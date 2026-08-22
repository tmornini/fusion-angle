import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { PUT, handleRequest } from '../api/api.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import {
    deriveStateFieldValueReferrers,
} from '../api/derive-state-field-values.ts';
import { workOrderHistoryFor } from
    '../api/derive-states.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    postWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

const N_NEXT = generateIdentifier();
const TE_1 = generateIdentifier();
const FV_1 = generateIdentifier();
const TE_LEX = generateIdentifier();
const FV_Z = generateIdentifier();
const FV_A = generateIdentifier();
const FV_M = generateIdentifier();

// Phase Final Task 2: state_field_values dual-write stripped.
// This file no longer compares derive vs row-plane oracles —
// the SFV table is empty after live transitions. Coverage
// re-homes to message-plane derive + wire-byte handleRequest
// assertions. Leaf PUT/DELETE routes retired Phase 15 Task 7;
// GET states/:id/field-values retired (states-URI elimination
// C4) — product reads fold field values on work-order
// history. Task 8 CUT: legacy fieldValues appends stay
// BELOW the gate (SFV census is STORED-data truth).

const BASE = 'http://localhost';
const LOCK_TIMEOUT_SECONDS = 300;
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [], edges: [],
    };
}

// Seed via REAL PUT so the WO carries a document message pair.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA', {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        DEV_TOKEN,
    );
    // Phase Final Stage B: record_attributes retired.
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', {
            name: 'Parent', description: '', position: 0,
            state: 'active',
        },
        DEV_TOKEN,
    );
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw'
        + '/attributes/VPckAwjJsTGCEkKaOOGRGw', {
            name: 'Severity', attribute_type: 'text',
            sort_order: 0, options: [], constraints: [],
        },
        DEV_TOKEN,
    );
    return db;
}

// Task 8: below-facade legacy append — SFV census pins
// stored fold shape, not the retired live wire.
async function appendLegacyTransition(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<void> {
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', 'yNSSnbrpacodQTzUEcdEVA', 'transition',
    ];
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TRANSITION_PATTERN,
        routeSegments: TRANSITION_PATTERN.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: STARK_ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, 'yNSSnbrpacodQTzUEcdEVA', body, SYSTEM_MEMBER_ID,
        undefined, [], messagePair,
    );
}

test('RESTRICT: deriveStateFieldValueReferrers sees the'
+ ' transition fold; SFV row plane stays empty',
async () => {
    const db = await seededDb();

    await appendLegacyTransition(db, {
        transitionEventId: TE_1,
        targetState: N_NEXT,
        fieldValues: [{
            id: FV_1,
            fields: {
                state_event_id: TE_1,
                attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                value: 'high',
            },
        }],
        release: null,
        transitionAt: nowUtc(),
    });

    const derived =
        await deriveStateFieldValueReferrers(
            db, STARK_ORGANIZATION, ['VPckAwjJsTGCEkKaOOGRGw'],
        );
    const rows = derived.get('VPckAwjJsTGCEkKaOOGRGw') ?? [];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, FV_1);
    assert.equal(rows[0]!.attribute_id, 'VPckAwjJsTGCEkKaOOGRGw');
    // Phase Final Stage B: state_field_values table retired.
});

// C4: route parity re-homes onto work-order history
// (inline field_values fold), not GET states/:id/field-values.
test('GET organizations/:id/work-orders/:id/history wire equals'
+ ' workOrderHistoryFor over a live fold',
async () => {
    const db = await seededDb();
    await appendLegacyTransition(db, {
        transitionEventId: TE_1,
        targetState: N_NEXT,
        fieldValues: [{
            id: FV_1,
            fields: {
                state_event_id: TE_1,
                attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                value: 'high',
            },
        }],
        release: null,
        transitionAt: nowUtc(),
    });

    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/history', token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA',
    );
    assert.equal(wireText, JSON.stringify(derived));
    const transition = derived.find((row) => row.id === TE_1);
    assert.ok(transition !== undefined);
    assert.deepEqual(transition!.field_values, [{
        id: FV_1,
        attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
        value: 'high',
    }]);
});

// Non-lex field-value ids so collection order is not
// insertion order (byIdAscending craftsmanship).
test('work-order history field_values are identifier-'
+ 'ordered after non-lex transition fold', async () => {
    const db = await seededDb();
    await appendLegacyTransition(db, {
        transitionEventId: TE_LEX,
        targetState: N_NEXT,
        fieldValues: [
            {
                id: FV_Z,
                fields: {
                    state_event_id: TE_LEX,
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'z',
                },
            },
            {
                id: FV_A,
                fields: {
                    state_event_id: TE_LEX,
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'a',
                },
            },
            {
                id: FV_M,
                fields: {
                    state_event_id: TE_LEX,
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'm',
                },
            },
        ],
        release: null,
        transitionAt: nowUtc(),
    });
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/history', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as {
        id: string;
        field_values: { id: string }[];
    }[];
    const transition = list.find((row) => row.id === TE_LEX);
    assert.ok(transition !== undefined);
    assert.deepEqual(
        transition!.field_values.map(r => r.id),
        [FV_A, FV_M, FV_Z].sort(compareIdentifiers),
    );
});
