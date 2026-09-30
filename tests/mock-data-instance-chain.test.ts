import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { NIL_IDENTIFIER } from
    '../shared/identifier.ts';
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
    workOrderHeadFor,
    workOrderHistoryFor,
} from '../api/derive-states.ts';
import { validateWorkOrderVersion } from '../api/validators.ts';
import { responseRecordOf } from '../api/message-pair.ts';
import { framedRequest } from './http-fixtures.ts';

// Task 6: WO-instance SoT seed chain — a PATCH create landing
// its PATCH and PUT together, the binding PUT, then Review and
// Complete, each one latched POST with its revision.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
): Request {
    return framedRequest(BASE + path, {
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

Deno.test('A1 chain: instance history {} → 6 → 7; head = union',
async () => {
    const db = await seededDb();
    const revisions = await deriveInstanceRevisions(
        db, STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
        SEED_INSTANCE_ID,
    );
    assertStrictEquals(revisions.length, 3);
    assertStrictEquals(revisions[0]!.values.length, 0);
    assertStrictEquals(revisions[1]!.values.length, 6);
    assertStrictEquals(revisions[2]!.values.length, 7);

    const head = await deriveInstanceHead(
        db, STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
        SEED_INSTANCE_ID,
    );
    assert(head !== undefined);
    assertStrictEquals(head!.values.length, 7);
    for (const entry of head!.values) {
        assertStrictEquals(
            entry.value,
            LEGACY_UNION.get(entry.attribute_id),
            'head value drift for ' + entry.attribute_id,
        );
    }
    assertStrictEquals(
        LEGACY_UNION.get('CPJmMPXRaBIiNdGBofUPVg'),
        'Acme Corp',
    );
    assertStrictEquals(
        LEGACY_UNION.get('ElVKgkCreTEHQXJZPBJDKw'),
        'Approved. Strong fit.',
    );
});

Deno.test('WO01 bind names instance + type; detail GET embeds',
async () => {
    const db = await seededDb();
    const head = await workOrderHeadFor(
        db, STARK_ORGANIZATION, WO01_ID,
    );
    assertEquals(
        [head?.version.instance_id, head?.version.record_type_id],
        [SEED_INSTANCE_ID, SEED_RECORD_TYPE_ID],
    );

    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WO01_ID, token,
    ));
    assertStrictEquals(res.status, 200);
    const body = await res.json() as Record<
        string, unknown
    >;
    assertStrictEquals(body['instance_id'], SEED_INSTANCE_ID);
    assertStrictEquals(
        body['record_type_id'], SEED_RECORD_TYPE_ID,
    );
});

Deno.test('WO01 bind lands a work-order version',
async () => {
    const db = await seededDb();
    const prefix =
        '/organizations/' + STARK_ORGANIZATION
        + '/work-orders/' + WO01_ID + '/binding/';
    const requests = await db.messagePairs.getCollectionPairs(prefix,
    );
    assertStrictEquals(requests.length, 1);
    assertStrictEquals(requests[0]!.method, 'PUT');
    const versions = (await db.messagePairs.getDocumentHistory(
        '/organizations/' + STARK_ORGANIZATION + '/work-orders/',
        WO01_ID,
    )).filter((pair) => pair.method === 'PUT')
        .map((pair) => validateWorkOrderVersion(
            responseRecordOf(pair.response)!,
        ));
    const bound = versions.findIndex(
        (version) => version.instance_id !== undefined,
    );
    assert(bound > 0);
    assertStrictEquals(versions[bound - 1]!.instance_id, undefined);
    assertEquals(
        [
            versions[bound]!.instance_id,
            versions[bound]!.record_type_id,
            versions[bound]!.events,
        ],
        [SEED_INSTANCE_ID, SEED_RECORD_TYPE_ID, []],
    );
});

Deno.test('WO01 history: Review 6 new-shape + Complete 1',
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
    assertStrictEquals(review.field_values.length, 6);
    for (const fv of review.field_values) {
        assertStrictEquals(fv.id, fv.attribute_id);
    }
    assertStrictEquals(complete.field_values.length, 1);
    assertStrictEquals(
        complete.field_values[0]!.id,
        complete.field_values[0]!.attribute_id,
    );
});

Deno.test('chain provenance: three instance pairs ordered by at;'
+ ' no predecessor columns',
async () => {
    const db = await seededDb();
    const prefix = instancesUriPrefix(
        STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
    );
    const [requests, responses] = await Promise.all([
        db.messagePairs.getCollectionPairs(prefix),
        db.messagePairs.getCollectionPairs(prefix),
    ]);
    const byId = new Map(
        responses
            .filter((r) => r.name === SEED_INSTANCE_ID
                && r.method === 'PUT')
            .map((r) => [r.id, r]),
    );
    const requestById = new Map(
        requests
            .filter((r) => r.name === SEED_INSTANCE_ID
                && r.method === 'PUT')
            .map((r) => [r.id, r]),
    );
    assertStrictEquals(byId.size, 3);

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

    assert(genesis);
    assert(reviewRev);
    assert(completeRev);
    assertStrictEquals('follows' in genesis, false);
    assertStrictEquals(genesis.supersedes, NIL_IDENTIFIER);
    assertStrictEquals('follows' in reviewRev, false);
    assertStrictEquals(reviewRev.supersedes, genesis.id);
    assertStrictEquals('follows' in completeRev, false);
    assertStrictEquals(
        completeRev.supersedes, reviewRev.id,
    );
});
