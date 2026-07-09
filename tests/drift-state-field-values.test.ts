import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { POST, PUT, DELETE } from '../api/api.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { nowUtc } from '../api/types.ts';
import {
    deriveStateFieldValueReferrers,
    stateFieldValuesForStateEvent,
} from '../api/derive-state-field-values.ts';

// Phase 14 Task 6's own drift suite: state_field_values (SFV)
// truth, pair-plane derived (api/derive-state-field-values.ts),
// proven byte-equal to the row plane it replaces as a decision
// surface for RESTRICT (api/record-attribute-refs.ts) and the
// GET states/:id/field-values read (api/routes.ts). Mirrors the
// sibling drift suites' own conventions (tests/drift-states.
// test.ts): sortByIdAscending on BOTH sides before deepEqual
// (H7's own reason — insertion order on the memory tier is not
// the derive's own order).

function sortByIdAscending<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): string {
    return JSON.stringify({
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [], edges: [],
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await db.workOrders.put('wo1', {
        organization_id: '1', display_id: 'abcd',
        flow_graph: graphJson(), position: 1,
    });
    await db.recordAttributes.put('attr-1', {
        organization_id: '1', record_id: 'rec-1',
        name: 'Severity', attribute_type: 'text',
        sort_order: 0, options: '[]', constraints: '[]',
    });
    return db;
}

test('RESTRICT parity: deriveStateFieldValueReferrers'
+ ' deepEquals the row plane over a live transition, a'
+ ' standalone leaf PUT, and a leaf DELETE of the'
+ ' transition-born row', async () => {
    const db = await seededDb();

    // A live transition folds ONE field-value row (fv-1) into
    // its OWN operation pair — no leaf pair of its own (Author
    // gate 5's own census, this module's header).
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

    // A standalone leaf PUT adds a SECOND row under the SAME
    // transition event, pair-wired at its own address.
    await PUT(
        db, 'states/te1/field-values/fv-2',
        {
            state_event_id: 'te1',
            attribute_id: 'attr-1',
            value: 'medium',
        },
        DEV_TOKEN,
    );

    // The leaf DELETE tombstones the TRANSITION-born row through
    // the standalone address — proving deletion reproduces
    // across sources, not merely within one (the leaf-DELETE
    // pair-visibility gate this task's brief names).
    await DELETE(
        db, 'states/te1/field-values/fv-1', DEV_TOKEN,
    );

    const derived =
        await deriveStateFieldValueReferrers(db, ['attr-1']);
    const old = await db.stateFieldValues
        .getAllWhere('attribute_id', 'attr-1');

    assert.deepEqual(
        sortByIdAscending([...(derived.get('attr-1') ?? [])]),
        sortByIdAscending(old),
    );
    assert.equal(old.length, 1);
    assert.equal(old[0]!.id, 'fv-2');
});

test('GET drift: stateFieldValuesForStateEvent deepEquals the'
+ ' row plane, both sides sorted, over a live transition'
+ ' plus a standalone leaf PUT under the SAME event',
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
    await PUT(
        db, 'states/te1/field-values/fv-2',
        {
            state_event_id: 'te1',
            attribute_id: 'attr-1',
            value: 'medium',
        },
        DEV_TOKEN,
    );

    const derived =
        await stateFieldValuesForStateEvent(db, 'te1');
    const old = await db.stateFieldValues
        .getAllWhere('state_event_id', 'te1');

    assert.deepEqual(
        sortByIdAscending(derived), sortByIdAscending(old));
    assert.equal(old.length, 2);
});
