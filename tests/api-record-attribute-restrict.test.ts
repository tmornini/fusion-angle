import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    DELETE,
    POST,
    RequestError,
} from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';

// Destroying a record attribute is RESTRICT, not cascade:
// while a state_field_values row names it or a flow /
// work-order graph binds it, DELETE (and a record-write
// removal) is a 409 naming the referrers, and the whole
// batch rolls back — cascading would orphan immutable
// event payloads.

const AT = '2026-06-01T00:00:00.000000Z';

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await db.records.put('r1', {
        organization_id: '1', name: 'Asset',
        description: 'd', position: 1,
    });
    await db.recordAttributes.put('attr1', {
        organization_id: '1', record_id: 'r1',
        name: 'Priority', attribute_type: 'text',
        sort_order: 0, options: '[]',
        constraints: '[]',
    });
    return db;
}

function nodeBinding(
    attributeId: string,
): Record<string, unknown> {
    return {
        id: 'n1', name: 'Step', positionX: 0,
        positionY: 0, isCreate: false,
        isArchive: false, memberIds: [],
        attributes: [{
            attribute_id: attributeId,
            mode: 'editable', isRequired: false,
        }],
        taskInstructions: '',
    };
}

test(
    'an unreferenced attribute deletes cleanly',
    async () => {
        const db = await seededDb();
        await DELETE(
            db, 'record-attributes/attr1', DEV_TOKEN,
        );
        const rows = await db.recordAttributes.getAll();
        assert.equal(rows.length, 0);
    },
);

test(
    'a field-value referrer blocks deletion with 409',
    async () => {
        const db = await seededDb();
        await db.states.put('ev1', {
            entity_id: 'r1', state: 'active',
            member_id: 'current', at: AT,
        });
        await db.stateFieldValues.put('sfv1', {
            state_event_id: 'ev1', attribute_id: 'attr1',
            value: 'High',
        });
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409
                && /1 state field value/.test(
                    err.message,
                ),
        );
        const rows = await db.recordAttributes.getAll();
        assert.equal(rows.length, 1);
    },
);

test(
    'a flow-graph binding blocks deletion naming the flow',
    async () => {
        const db = await seededDb();
        await db.flows.put('f1', {
            organization_id: '1', name: 'Intake',
            is_locked: false, is_auto_layout: false,
            is_auto_fit: false, lock_timeout: 0,
            graph: JSON.stringify({
                nodes: [nodeBinding('attr1')],
                edges: [],
            }),
        });
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409
                && /flow\(s\) f1/.test(err.message),
        );
    },
);

test(
    'a work-order binding blocks deletion naming it',
    async () => {
        const db = await seededDb();
        await db.workOrders.put('wo1', {
            organization_id: '1', display_id: 'WO',
            flow_graph: JSON.stringify({
                flowId: 'f1', name: 'Intake',
                lockTimeout: 0,
                nodes: [nodeBinding('attr1')],
                edges: [],
            }),
            position: 1,
        });
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409
                && /work order\(s\) wo1/.test(
                    err.message,
                ),
        );
    },
);

test(
    'a referenced removal rolls back the whole'
    + ' record-write batch',
    async () => {
        const db = await seededDb();
        await db.states.put('ev1', {
            entity_id: 'r1', state: 'active',
            member_id: 'current', at: AT,
        });
        await db.stateFieldValues.put('sfv1', {
            state_event_id: 'ev1', attribute_id: 'attr1',
            value: 'High',
        });
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'edit',
                id: 'r1',
                record: {
                    organization_id: '1',
                    name: 'Renamed', description: 'd',
                    position: 1,
                },
                attributes: [],
                removedAttributeIds: ['attr1'],
            }, DEV_TOKEN),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409,
        );
        // the batch applied NOTHING: the record kept its
        // name and the attribute survived
        const record = await db.records.getById('r1');
        assert.equal(record.name, 'Asset');
        const attrs = await db.recordAttributes.getAll();
        assert.equal(attrs.length, 1);
    },
);
