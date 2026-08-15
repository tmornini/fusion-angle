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
    formWritePair,
} from '../api/message-pair.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Phase Final Task 2: state_field_values dual-write stripped.
// This file no longer compares derive vs row-plane oracles —
// the SFV table is empty after live transitions. Coverage
// re-homes to pair-plane derive + wire-byte handleRequest
// assertions. Leaf PUT/DELETE routes retired Phase 15 Task 7;
// GET states/:id/field-values retired (states-URI elimination
// C4) — product reads fold field values on work-order
// history. Task 8 CUT: legacy fieldValues appends stay
// BELOW the gate (SFV census is STORED-data truth).

const BASE = 'http://localhost';
const LOCK_TIMEOUT_SECONDS = 300;
const TRANSITION_PATTERN = 'work-orders/:id/transition';

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

// Seed via REAL PUT so the WO carries a document pair.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await PUT(
        db, 'work-orders/wo1', {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        DEV_TOKEN,
    );
    // Phase Final Stage B: record_attributes retired.
    await PUT(
        db, 'organizations/1/record-types/rec-1', {
            name: 'Parent', description: '', position: 0,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'rec-1-genesis',
        },
        DEV_TOKEN,
    );
    await PUT(
        db, 'organizations/1/record-types/rec-1'
        + '/attributes/attr-1', {
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
        'work-orders', 'wo1', 'transition',
    ];
    const pair = await formWritePair({
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
        db, 'wo1', body, SYSTEM_MEMBER_ID,
        undefined, [], pair,
    );
}

test('RESTRICT: deriveStateFieldValueReferrers sees the'
+ ' transition fold; SFV row plane stays empty',
async () => {
    const db = await seededDb();

    await appendLegacyTransition(db, {
        transitionEventId: 'te1',
        targetState: 'n-next',
        fieldValues: [{
            id: 'fv-1',
            fields: {
                state_event_id: 'te1',
                attribute_id: 'attr-1',
                value: 'high',
            },
        }],
        release: null,
        transitionAt: nowUtc(),
    });

    const derived =
        await deriveStateFieldValueReferrers(
            db, STARK_ORGANIZATION, ['attr-1'],
        );
    const rows = derived.get('attr-1') ?? [];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 'fv-1');
    assert.equal(rows[0]!.attribute_id, 'attr-1');
    // Phase Final Stage B: state_field_values table retired.
});

// C4: route parity re-homes onto work-order history
// (inline field_values fold), not GET states/:id/field-values.
test('GET work-orders/:id/history wire equals'
+ ' workOrderHistoryFor over a live fold',
async () => {
    const db = await seededDb();
    await appendLegacyTransition(db, {
        transitionEventId: 'te1',
        targetState: 'n-next',
        fieldValues: [{
            id: 'fv-1',
            fields: {
                state_event_id: 'te1',
                attribute_id: 'attr-1',
                value: 'high',
            },
        }],
        release: null,
        transitionAt: nowUtc(),
    });

    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/work-orders/wo1/history', token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, 'wo1',
    );
    assert.equal(wireText, JSON.stringify(derived));
    const transition = derived.find((row) => row.id === 'te1');
    assert.ok(transition !== undefined);
    assert.deepEqual(transition!.field_values, [{
        id: 'fv-1',
        attribute_id: 'attr-1',
        value: 'high',
    }]);
});

// Non-lex field-value ids so collection order is not
// insertion order (byIdAscending craftsmanship).
test('work-order history field_values are id-lex ordered'
+ ' after non-lex transition fold', async () => {
    const db = await seededDb();
    await appendLegacyTransition(db, {
        transitionEventId: 'te-lex',
        targetState: 'n-next',
        fieldValues: [
            {
                id: 'fv-z',
                fields: {
                    state_event_id: 'te-lex',
                    attribute_id: 'attr-1',
                    value: 'z',
                },
            },
            {
                id: 'fv-a',
                fields: {
                    state_event_id: 'te-lex',
                    attribute_id: 'attr-1',
                    value: 'a',
                },
            },
            {
                id: 'fv-m',
                fields: {
                    state_event_id: 'te-lex',
                    attribute_id: 'attr-1',
                    value: 'm',
                },
            },
        ],
        release: null,
        transitionAt: nowUtc(),
    });
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/work-orders/wo1/history', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as {
        id: string;
        field_values: { id: string }[];
    }[];
    const transition = list.find((row) => row.id === 'te-lex');
    assert.ok(transition !== undefined);
    assert.deepEqual(
        transition!.field_values.map(r => r.id),
        ['fv-a', 'fv-m', 'fv-z'],
    );
});
