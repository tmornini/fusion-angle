import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { testHashPassword } from './mock-seed.ts';
import {
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import {
    SEED_INSTANCE_ID,
    SEED_RECORD_TYPE_ID,
    WO01_ID,
    WO01_REVIEW_EVENT_ID,
    WO01_COMPLETE_EVENT_ID,
    mockStateFieldValues,
} from '../api/mock-data/seed-message-pairs.ts';
import {
    deriveInstanceRevisions,
    deriveInstanceHead,
    instancesUriPrefix,
} from '../api/derive-record-instances.ts';
import {
    workOrderBindingFor,
    workOrderHistoryFor,
} from '../api/derive-states.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';

function messagePairJsonOf(message: string): {
    readonly body: Record<string, unknown>;
} {
    const body = HttpMessage.fromWire(message).body();
    return {
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// Task 6: WO-instance SoT seed chain — genesis empty, binding,
// Review 6 + Complete 1 new-shape ops with revision pairs.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
): Request {
    return new Request(BASE + path, {
        method,
        headers: {
            Authorization: 'Bearer ' + token,
        },
    });
}

async function seededDb() {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    return db;
}

const LEGACY_UNION = new Map(
    mockStateFieldValues.map((fv) => [
        fv.attribute_id, fv.value,
    ]),
);

test('A1 chain: instance history {} → 6 → 7; head = union',
async () => {
    const db = await seededDb();
    const revisions = await deriveInstanceRevisions(
        db, STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
        SEED_INSTANCE_ID,
    );
    assert.equal(revisions.length, 3);
    assert.equal(revisions[0]!.values.length, 0);
    assert.equal(revisions[1]!.values.length, 6);
    assert.equal(revisions[2]!.values.length, 7);

    const head = await deriveInstanceHead(
        db, STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
        SEED_INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.equal(head!.values.length, 7);
    for (const entry of head!.values) {
        assert.equal(
            entry.value,
            LEGACY_UNION.get(entry.attribute_id),
            'head value drift for ' + entry.attribute_id,
        );
    }
    assert.equal(
        LEGACY_UNION.get('CPJmMPXRaBIiNdGBofUPVg'),
        'Acme Corp',
    );
    assert.equal(
        LEGACY_UNION.get('ElVKgkCreTEHQXJZPBJDKw'),
        'Approved. Strong fit.',
    );
});

test('WO01 bind names instance + type; detail GET embeds',
async () => {
    const db = await seededDb();
    const bind = await workOrderBindingFor(
        db, STARK_ORGANIZATION, WO01_ID,
    );
    assert.deepEqual(bind, {
        instanceId: SEED_INSTANCE_ID,
        recordTypeId: SEED_RECORD_TYPE_ID,
    });

    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WO01_ID, token,
    ));
    assert.equal(res.status, 200);
    const body = await res.json() as Record<
        string, unknown
    >;
    assert.equal(body['instance_id'], SEED_INSTANCE_ID);
    assert.equal(
        body['record_type_id'], SEED_RECORD_TYPE_ID,
    );
});

test('WO01 bind seed pair is PUT (locked verb)',
async () => {
    const db = await seededDb();
    const prefix =
        '/organizations/' + STARK_ORGANIZATION
        + '/work-orders/' + WO01_ID + '/binding/';
    const requests = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    assert.equal(requests.length, 1);
    const model = parseWire(requests[0]!.request);
    assert.equal(model.startLine.kind, 'request');
    if (model.startLine.kind !== 'request') {
        return;
    }
    assert.equal(model.startLine.method, 'PUT');
});

test('WO01 history: Review 6 new-shape + Complete 1;'
+ ' other WOs stay legacy',
async () => {
    const db = await seededDb();
    const history = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, WO01_ID,
    );
    const byId = new Map(
        history.map((row) => [row.id, row]),
    );
    const review = byId.get(WO01_REVIEW_EVENT_ID)!;
    const complete = byId.get(WO01_COMPLETE_EVENT_ID)!;
    assert.equal(review.field_values.length, 6);
    for (const fv of review.field_values) {
        assert.equal(fv.id, fv.attribute_id);
    }
    assert.equal(complete.field_values.length, 1);
    assert.equal(
        complete.field_values[0]!.id,
        complete.field_values[0]!.attribute_id,
    );

    // Other WO transition pairs keep the LEGACY fieldValues
    // key (never instance_id/set) — event fidelity.
    const otherWoId = 'krzCXtfVNOLvbGcYnSrhng';
    const otherPrefix =
        '/organizations/' + STARK_ORGANIZATION
        + '/work-orders/' + otherWoId + '/transition/';
    const otherReqs = await db.messagePairs.getAllWhere(
        'uri_collection', otherPrefix,
    );
    assert.ok(otherReqs.length > 0);
    for (const request of otherReqs) {
        const embedded = messagePairJsonOf(
            request.request,
        ) as {
            body: Record<string, unknown>;
        };
        assert.ok(
            Object.hasOwn(embedded.body, 'fieldValues'),
            'legacy body missing fieldValues',
        );
        assert.equal(
            Object.hasOwn(embedded.body, 'instance_id'),
            false,
        );
        assert.equal(
            Object.hasOwn(embedded.body, 'set'),
            false,
        );
    }
});

test('chain provenance: three instance pairs ordered by at;'
+ ' no predecessor columns',
async () => {
    const db = await seededDb();
    const prefix = instancesUriPrefix(
        STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
    );
    const [requests, responses] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', prefix),
        db.messagePairs.getAllWhere('uri_collection', prefix),
    ]);
    const byId = new Map(
        responses
            .filter((r) => r.uri_id === SEED_INSTANCE_ID)
            .map((r) => [r.id, r]),
    );
    const requestById = new Map(
        requests
            .filter((r) => r.uri_id === SEED_INSTANCE_ID)
            .map((r) => [r.id, r]),
    );
    assert.equal(byId.size, 3);

    const ordered = [...requestById.values()]
        .sort((a, b) =>
            a.response_at < b.response_at ? -1
                : a.response_at > b.response_at ? 1
                    : a.id < b.id ? -1
                        : a.id > b.id ? 1
                            : 0,
        );
    const genesis = byId.get(ordered[0]!.id)!;
    const reviewRev = byId.get(ordered[1]!.id)!;
    const completeRev = byId.get(ordered[2]!.id)!;

    assert.ok(genesis);
    assert.ok(reviewRev);
    assert.ok(completeRev);
    for (const row of [genesis, reviewRev, completeRev]) {
        assert.equal('follows' in row, false);
        assert.equal('supersedes' in row, false);
    }
});
