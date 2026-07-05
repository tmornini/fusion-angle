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
// while a state_field_values row names it or a live
// flow-node-attribute relation row binds it, or a
// work-order graph references it, DELETE (and a record-write
// removal) is a 409 naming the referrers, and the whole
// batch rolls back — cascading would orphan immutable
// event payloads.
//
// The LIVE flow referrer scan reads the flow_node_attributes
// relation (latest action per flow_node_id); a frozen
// work-order referrer scan still reads work_orders.flow_graph.

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

// Seed a live flow with one node bound to `attributeId` via
// the relation. Returns the db so the caller can continue.
async function seedFlowNodeAttribute(
    db: MemoryDbAdapter,
    opts: {
        flowId: string;
        nodeId: string;
        attributeId: string;
        action?: 'added' | 'removed';
        rowId?: string;
    },
): Promise<void> {
    const {
        flowId, nodeId, attributeId,
        action = 'added', rowId = 'fna1',
    } = opts;
    await db.flows.put(flowId, {
        organization_id: '1', name: 'Intake',
        is_locked: false, is_auto_layout: false,
        is_auto_fit: false, lock_timeout: 0,
    });
    await db.flowNodes.put(nodeId, {
        flow_id: flowId, name: 'Step',
        position_x: 0, position_y: 0,
        is_create: false, is_archive: false,
        task_instructions: '', at: AT,
    });
    await db.flowNodeAttributes.put(rowId, {
        flow_node_id: nodeId,
        attribute_id: attributeId,
        mode: 'editable', is_required: false,
        action, at: AT,
    });
}

function workOrderNodeBinding(
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
    'a live node-attribute binding blocks deletion'
    + ' naming the flow',
    async () => {
        const db = await seededDb();
        await seedFlowNodeAttribute(db, {
            flowId: 'f1', nodeId: 'n1',
            attributeId: 'attr1',
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
    'a removed node-attribute binding does not block'
    + ' deletion',
    async () => {
        const db = await seededDb();
        // seed added then removed: latest action is 'removed'
        await seedFlowNodeAttribute(db, {
            flowId: 'f1', nodeId: 'n1',
            attributeId: 'attr1',
            action: 'added', rowId: 'fna1',
        });
        await db.flowNodeAttributes.put('fna2', {
            flow_node_id: 'n1',
            attribute_id: 'attr1',
            mode: 'editable', is_required: false,
            action: 'removed',
            at: '2026-06-02T00:00:00.000000Z',
        });
        // deletion must succeed — 'removed' is not a referrer
        await DELETE(
            db, 'record-attributes/attr1', DEV_TOKEN,
        );
        const rows = await db.recordAttributes.getAll();
        assert.equal(rows.length, 0);
    },
);

test(
    'attribute on multiple nodes counts the flow once',
    async () => {
        const db = await seededDb();
        // two nodes in same flow, both bind attr1
        await seedFlowNodeAttribute(db, {
            flowId: 'f1', nodeId: 'n1',
            attributeId: 'attr1', rowId: 'fna1',
        });
        await db.flowNodes.put('n2', {
            flow_id: 'f1', name: 'Review',
            position_x: 1, position_y: 0,
            is_create: false, is_archive: false,
            task_instructions: '', at: AT,
        });
        await db.flowNodeAttributes.put('fna2', {
            flow_node_id: 'n2',
            attribute_id: 'attr1',
            mode: 'editable', is_required: false,
            action: 'added', at: AT,
        });
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) => {
                if (!(err instanceof RequestError)) {
                    return false;
                }
                if (err.status !== 409) return false;
                // flow f1 appears exactly once in the message
                const matches =
                    err.message.match(/f1/g) ?? [];
                return matches.length === 1;
            },
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
                nodes: [workOrderNodeBinding('attr1')],
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
        const requestsBefore = await db.requests.getAll();
        const responsesBefore = await db.responses.getAll();
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
                // Echoes the SAME event pre-seeded above (ev1)
                // — never a fresh mint — so the trio's own gate
                // admits this body and the 409 below still
                // proves the RESTRICT mechanism, not validation.
                state: 'active',
                state_at: AT,
                state_event_id: 'ev1',
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
        // pair-balance: the whole bundle (operation + document
        // + attribute pairs) is pairs-or-nothing, so a 409
        // rollback appends NEITHER table any rows.
        assert.equal(
            (await db.requests.getAll()).length,
            requestsBefore.length,
        );
        assert.equal(
            (await db.responses.getAll()).length,
            responsesBefore.length,
        );
    },
);
