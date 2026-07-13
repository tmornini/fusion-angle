import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { POST, PUT, handleRequest } from '../api/api.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { nowUtc } from '../api/types.ts';
import {
    deriveStateFieldValueReferrers,
} from '../api/derive-state-field-values.ts';
import { workOrderHistoryFor } from
    '../api/derive-states.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

// Phase Final Task 2: state_field_values dual-write stripped.
// This file no longer compares derive vs row-plane oracles —
// the SFV table is empty after live transitions. Coverage
// re-homes to pair-plane derive + wire-byte handleRequest
// assertions. Leaf PUT/DELETE routes retired Phase 15 Task 7;
// GET states/:id/field-values retired (states-URI elimination
// C4) — product reads fold field values on work-order
// history. Live writes ride the transition fold only.

const BASE = 'http://localhost';
const LOCK_TIMEOUT_SECONDS = 300;

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

function graphJson(): string {
    return JSON.stringify({
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [], edges: [],
    });
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
        db, 'record-attributes/attr-1', {
            organization_id: '1', record_id: 'rec-1',
            name: 'Severity', attribute_type: 'text',
            sort_order: 0, options: '[]', constraints: '[]',
        },
        DEV_TOKEN,
    );
    return db;
}

test('RESTRICT: deriveStateFieldValueReferrers sees the'
+ ' transition fold; SFV row plane stays empty',
async () => {
    const db = await seededDb();

    await POST(
        db, 'work-orders/wo1/transition', {
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
        },
        DEV_TOKEN,
    );

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
    await POST(
        db, 'work-orders/wo1/transition', {
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
        },
        DEV_TOKEN,
    );

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
    await POST(
        db, 'work-orders/wo1/transition', {
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
        },
        DEV_TOKEN,
    );
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
