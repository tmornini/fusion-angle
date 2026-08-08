import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    validateRecordTransition,
} from
'../web-app/app/adapters/record-transitions.ts';
import {
    postFlowCreation,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    putWorkOrder,
} from '../web-app/app/adapters/work-orders-mutations.ts';
import {
    postRecordChange,
} from '../web-app/app/adapters/records.ts';
import {
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
    type WorkOrderFlowGraph,
} from '../api/types.ts';

const AT_CREATED = '2026-05-01T10:00:00.000000Z';

async function seedSystemMember(
    db: MemoryDbAdapter,
): Promise<void> {
    // Phase Final Stage B: states table retired.
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

// NAMED re-pin (Task 7): validateRecordTransition reads
// work-orders/:id through the flipped GET (this commit), so
// the fixture must land through the SAME wire-reachable PUT
// the live route serves — a raw db.workOrders.put leaves no
// message pair at this address. The genesis transition ALSO
// re-pins here (finding 15's fixture budget): getWorkOrder
// TransitionEvents reads family /history, which is flipped
// too — a raw db.states.put left no pair at that address
// either.
async function seedWorkOrder(
    db: MemoryDbAdapter,
    id: string,
    flowGraph: WorkOrderFlowGraph,
    currentNodeId: string,
): Promise<void> {
    const ctx = createRequestContext(db, await organizationToken());
    await putWorkOrder(ctx, id, {
        displayId: 'WO-1',
        flowGraph,
        position: 0,
    });
    // Genesis transition via the named op (states/:id
    // retired). pure-move instance shape; no claim release.
    await ctx.POST('work-orders/' + id + '/transition', {
        transitionEventId: 't-create-' + id,
        targetState: currentNodeId,
        release: null,
        transitionAt: AT_CREATED,
    });
}

// NAMED re-pin (Task 7): the flipped GET flows/:id/records
// derives from the message ledger too, the SAME reason as
// seedFlowLink's own flows/:id/work-orders re-pin above — a
// raw db.flowRecords.put leaves no pair at this address, so
// the binding must land through the SAME wire-reachable PUT
// the live route serves.
async function seedBinding(
    db: MemoryDbAdapter,
    flowId: string,
    recordId: string,
): Promise<void> {
    const ctx = createRequestContext(db, await organizationToken());
    await ctx.PUT(
        'flows/' + flowId + '/records/fr-' + flowId,
        {
            flow_id: flowId,
            record_id: recordId,
            at: AT_CREATED,
        },
    );
}

// DELTA (Phase 4 Task 8 — the inventory grep, not the brief,
// found this site): getRecordForWorkOrder walks
// getAllFlowWorkOrderEntities -> getFlowEntities(ctx), i.e. the
// flipped GET flows list — a raw db.flows.put leaves no message
// pair, so the flipped list would never find this flow and the
// record binding lookup would silently resolve empty. Seeded
// through the SAME document PUT the live route uses
// (postFlowCreation) so a pair exists at this flow's address.
async function seedFlowLink(
    db: MemoryDbAdapter,
    flowId: string,
    workOrderId: string,
): Promise<void> {
    // The flow↔work-order join nests under its parent flow now,
    // so the parent flow must exist to be enumerated — the
    // record lookup walks flows → work-orders → records.
    const ctx = createRequestContext(db, await organizationToken());
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'p-' + flowId,
        name: flowId,
    });
    // NAMED re-pin (Task 7): getAllFlowWorkOrderEntities reads
    // flows/:id/work-orders through the flipped GET (this
    // commit) — a raw db.flowWorkOrders.put leaves no message
    // pair at this address, so the join must land through the
    // SAME wire-reachable PUT the live route serves.
    await ctx.PUT(
        'flows/' + flowId + '/work-orders/fwo-' + workOrderId,
        {
            flow_id: flowId,
            work_order_id: workOrderId,
            at: AT_CREATED,
        },
    );
}

// Nested attributes (Task 21): parent type must exist for
// the collection probe; attribute lands at the nested
// detail address the flipped adapter GETs.
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
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    try {
        await ctx.GET(
            'organizations/1/record-types/'
            + recordId,
        );
    } catch {
        await postRecordChange(ctx, recordId, {
            kind: 'create',
            record: {
                name: recordId,
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
    }
    await ctx.PUT(
        'organizations/1/record-types/'
        + recordId
        + '/attributes/'
        + id,
        {
            name: options.name ?? 'Attr',
            attribute_type:
                options.attribute_type ?? 'text',
            sort_order: 1,
            options: [],
            constraints: options.constraints ?? [],
        },
    );
}

test(
    'validateRecordTransition returns an empty'
    + ' array for a flow with no record binding',
    async () => {
        const db = memoryDbAdapter();
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
        const ctx = createRequestContext(db, await organizationToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', new Map(), new Map(),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition returns a required'
    + ' violation when the CURRENT node has a'
    + ' required attribute with no stored value',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-step', [{
                    attributeId: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
                buildNode('n-target'),
            ],
            [
                buildEdge('e-1', 'n-create', 'n-step'),
                buildEdge('e-2', 'n-step', 'n-target'),
            ],
        );
        // WO sits ON the step that owns the required
        // attr — the form paints current-node fields;
        // the gate must check the same node.
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-step',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
        });
        const ctx = createRequestContext(db, await organizationToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', new Map(), new Map(),
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'required');
        if (out[0]!.kind !== 'required') return;
        assert.equal(out[0]!.attributeName, 'Email');
    },
);

test(
    'validateRecordTransition reports every'
    + ' required ref when storedValues is null'
    + ' (unbound A3 mirror)',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-step', [{
                    attributeId: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
                buildNode('n-target'),
            ],
            [
                buildEdge('e-1', 'n-create', 'n-step'),
                buildEdge('e-2', 'n-step', 'n-target'),
            ],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-step',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
        });
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const out = await validateRecordTransition(
            ctx, 'wo-1', new Map(), null,
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'required');
        if (out[0]!.kind !== 'required') return;
        assert.equal(out[0]!.attributeName, 'Email');
    },
);

test(
    'validateRecordTransition does not require'
    + ' TARGET-node attributes when the current'
    + ' node is clean',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-target', [{
                    attributeId: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
            ],
            [buildEdge('e-1', 'n-create', 'n-target')],
        );
        // At Create (no attrs). Target requires Email —
        // pre-fix gate would fail; current-node gate
        // must pass so the operator can enter and fill.
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-create',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
        });
        const ctx = createRequestContext(db, await organizationToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1', new Map(), new Map(),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition passes when a'
    + ' required CURRENT attribute has a'
    + ' satisfying stored value',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-step', [{
                    attributeId: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
                buildNode('n-target', [{
                    attributeId: 'a-1',
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
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Email',
        });
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        // Instance head is the SoT — pass storedValues
        // directly; no history fold.
        const out = await validateRecordTransition(
            ctx, 'wo-1', new Map(),
            new Map([['a-1', 'me@example.com']]),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition lets pendingValues'
    + ' override stored values to satisfy a'
    + ' required check on the CURRENT node',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-step', [{
                    attributeId: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                }]),
                buildNode('n-target'),
            ],
            [
                buildEdge('e-1', 'n-create', 'n-step'),
                buildEdge('e-2', 'n-step', 'n-target'),
            ],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-step',
        );
        await seedBinding(db, 'flow-1', 'rec-1');
        await seedFlowLink(db, 'flow-1', 'wo-1');
        await seedAttribute(db, 'a-1', 'rec-1', {
            name: 'Code',
        });
        const ctx = createRequestContext(db, await organizationToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1',
            new Map([['a-1', 'ABC']]),
            new Map(),
        );
        assert.deepEqual(out, []);
    },
);

test(
    'validateRecordTransition surfaces a regex'
    + ' constraint violation from the runner',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedSystemMember(db);
        const flowGraph = buildFlowGraph(
            [
                buildNode('n-create', [], {
                    isCreate: true,
                }),
                buildNode('n-step', [{
                    attributeId: 'a-1',
                    mode: 'editable',
                    isRequired: false,
                }]),
                buildNode('n-target'),
            ],
            [
                buildEdge('e-1', 'n-create', 'n-step'),
                buildEdge('e-2', 'n-step', 'n-target'),
            ],
        );
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-step',
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
        const ctx = createRequestContext(db, await organizationToken());
        const out = await validateRecordTransition(
            ctx, 'wo-1',
            new Map([['a-1', 'not-an-email']]),
            new Map(),
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'regex');
    },
);

test(
    'validateRecordTransition throws when the'
    + ' current node id does not exist on the'
    + ' work order flow graph',
    async () => {
        const db = memoryDbAdapter();
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
        // Ledger points at a node the frozen graph
        // never had — gate must refuse, not coerce.
        await seedWorkOrder(
            db, 'wo-1', flowGraph, 'n-ghost',
        );
        const ctx = createRequestContext(db, await organizationToken());
        await assert.rejects(
            () => validateRecordTransition(
                ctx, 'wo-1', new Map(), new Map(),
            ),
            /current node not found/,
        );
    },
);
