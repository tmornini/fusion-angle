import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { POST, PUT, handleRequest } from '../api/api.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { nowUtc } from '../api/types.ts';
import {
    deriveStateFieldValueReferrers,
    stateFieldValuesForStateEvent,
} from '../api/derive-state-field-values.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

// Phase Final Task 2: state_field_values dual-write stripped.
// This file no longer compares derive vs row-plane oracles —
// the SFV table is empty after live transitions. Coverage
// re-homes to pair-plane derive + wire-byte handleRequest
// assertions. Leaf PUT/DELETE routes retired Phase 15 Task 7;
// live writes ride the transition fold only. Seed still forms
// leaf-address pairs via formSeedPair (WRS survives).

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
    const db = new MemoryDbAdapter();
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

test('GET /states/:id/field-values wire equals'
+ ' stateFieldValuesForStateEvent over a live fold',
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
        db, req('GET', '/states/te1/field-values', token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await stateFieldValuesForStateEvent(
        db, STARK_ORGANIZATION, 'te1',
    );
    assert.equal(wireText, JSON.stringify(derived));
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.id, 'fv-1');
    // Phase Final Stage B: state_field_values table retired.
});

// Non-lex field-value ids so collection order is not
// insertion order (byIdAscending craftsmanship).
test('GET field-values collection is id-lex ordered after'
+ ' non-lex transition fold', async () => {
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
        db, req('GET', '/states/te-lex/field-values', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as { id: string }[];
    assert.deepEqual(
        list.map(r => r.id),
        ['fv-a', 'fv-m', 'fv-z'],
    );
});
