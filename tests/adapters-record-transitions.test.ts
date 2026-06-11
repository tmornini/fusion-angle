import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    validateRecordTransition,
} from
'../web-app/app/adapters/record-transitions.ts';
import {
    jsonObjectField,
    jsonArrayField,
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
    type WorkOrderFlowGraph,
} from '../api/types.ts';

const AT_CREATED = '2026-05-01T10:00:00.000000Z';
const AT_FIRST = '2026-05-01T11:00:00.000000Z';

async function seedSystemMember(
    db: MemoryDbAdapter,
): Promise<void> {
    await db.members.put(SYSTEM_MEMBER_ID, {
        type: 'system',
    });
    await db.states.postEvent(
        'st-system', SYSTEM_MEMBER_ID, 'active',
        'system',
    );
}

function buildNode(
    id: string,
    attributes: NodeAttribute[] = [],
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: id,
        description: '',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes,
        taskInstructions: '',
        ...overrides,
    };
}

function buildEdge(
    id: string, from: string, to: string,
): GraphEdge {
    return {
        id,
        name: 'go',
        description: '',
        fromNodeId: from,
        toNodeId: to,
    };
}

function buildFlowGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
): WorkOrderFlowGraph {
    return {
        name: 'Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    };
}

async function seedWorkOrder(
    db: MemoryDbAdapter,
    id: string,
    flowGraph: WorkOrderFlowGraph,
    currentNodeId: string,
): Promise<void> {
    await db.workOrders.put(id, {
        organization_id: '1',
        display_id: 'WO-1',
        flow_graph: jsonObjectField(
            flowGraph as unknown as Record<
                string, unknown
            >,
        ),
        position: 0,
    });
    await db.states.put('t-create-' + id, {
        entity_id: id,
        state: currentNodeId,
        member_id: SYSTEM_MEMBER_ID,
        at: AT_CREATED,
    });
}

async function seedBinding(
    db: MemoryDbAdapter,
    flowId: string,
    recordId: string,
): Promise<void> {
    await db.flowRecords.put('fr-' + flowId, {
        flow_id: flowId,
        record_id: recordId,
        at: AT_CREATED,
    });
}

async function seedFlowLink(
    db: MemoryDbAdapter,
    flowId: string,
    workOrderId: string,
): Promise<void> {
    await db.flowWorkOrders.put(
        'fwo-' + workOrderId, {
            flow_id: flowId,
            work_order_id: workOrderId,
            at: AT_CREATED,
        },
    );
}

async function seedAttribute(
    db: MemoryDbAdapter,
    id: string,
    recordId: string,
    options: {
        name?: string;
        attribute_type?:
            'text' | 'number' | 'date'
            | 'select' | 'checkbox';
        constraints?: unknown[];
    } = {},
): Promise<void> {
    await db.recordAttributes.put(id, {
        organization_id: '1',
        record_id: recordId,
        name: options.name ?? 'Attr',
        attribute_type:
            options.attribute_type ?? 'text',
        sort_order: 1,
        options: jsonArrayField([]),
        constraints: jsonArrayField(
            options.constraints ?? [],
        ),
    });
}

test(
    'validateRecordTransition returns an empty'
    + ' array for a flow with no record binding',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-target'),
            ],
            [buildEdge('e-1', 'n-create', 'n-target')],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-create',
        );
        const ctx = createRequestContext(db, await devToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', 'n-target', new Map(),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition returns a required'
    + ' violation when the target node has a'
    + ' required attribute with no stored value',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-target', [{
                    attribute_id: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
            ],
            [buildEdge('e-1', 'n-create', 'n-target')],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-create',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
        });
        const ctx = createRequestContext(db, await devToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', 'n-target', new Map(),
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'required');
        if (out[0]!.kind !== 'required') return;
        assert.equal(out[0]!.attributeName, 'Email');
    },
);

test(
    'validateRecordTransition passes when a'
    + ' required attribute has a satisfying'
    + ' stored value',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-step', [{
                    attribute_id: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
                buildNode('n-target', [{
                    attribute_id: 'a-1',
                    mode: 'readonly',
                    isRequired: true,
                }]),
            ],
            [
                buildEdge('e-1', 'n-create', 'n-step'),
                buildEdge('e-2', 'n-step', 'n-target'),
            ],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-step',
        );
        // Add a transition with a stored value at
        // n-step.
        await db.states.put('t-step', {
            entity_id: 'wo-1',
            state: 'n-step',
            member_id: SYSTEM_MEMBER_ID,
            at: AT_FIRST,
        });
        await db.stateFieldValues.put('fv-1', {
            state_event_id: 't-step',
            field_id: 'a-1',
            value: 'me@example.com',
        });
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
        });
        const ctx = createRequestContext(db, await devToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', 'n-target', new Map(),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition lets pendingValues'
    + ' override stored values to satisfy a'
    + ' required check',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-target', [{
                    attribute_id: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
            ],
            [buildEdge('e-1', 'n-create', 'n-target')],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-create',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Code',
        });
        const ctx = createRequestContext(db, await devToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', 'n-target',
            new Map([['a-1', 'ABC']]),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition surfaces a regex'
    + ' constraint violation from the runner',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-target', [{
                    attribute_id: 'a-1',
                    mode: 'editable',
                    isRequired: false,
                }]),
            ],
            [buildEdge('e-1', 'n-create', 'n-target')],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-create',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
            attribute_type: 'text',
            constraints: [{
                kind: 'regex',
                pattern:
                    '^[^@]+@[^@]+\\.[^@]+$',
            }],
        });
        const ctx = createRequestContext(db, await devToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', 'n-target',
            new Map([['a-1', 'not-an-email']]),
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'regex');
    },
);

test(
    'validateRecordTransition throws when the'
    + ' target node id does not exist on the'
    + ' work order flow graph',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-real'),
            ],
            [buildEdge('e-1', 'n-create', 'n-real')],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-create',
        );
        const ctx = createRequestContext(db, await devToken());
        await assert.rejects(
            () => validateRecordTransition(
                ctx, 'wo-1', 'n-ghost',
                new Map(),
            ),
            /target node not found/,
        );
    },
);
