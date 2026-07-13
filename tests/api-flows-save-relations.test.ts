import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import type {
    FlowWithGraph,
    GraphNode,
    GraphEdge,
    StateEntity,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    asStoredGraph,
} from '../api/validators.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    documentPairsAt,
} from '../api/derive-documents.ts';

// Phase Final Task 2: graph relation ROW halves stripped.
// Save oracles re-home to pair-plane graph (GET) and to
// document-pair graphDelta member/attribute event ledgers.

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo User');
    await seedHumanMember(db, 'm1', 'Member One');
    await seedHumanMember(db, 'm2', 'Member Two');
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

function buildNode(
    id: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name: id,
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...overrides,
    };
}

function buildEdge(
    id: string,
    fromNodeId: string,
    toNodeId: string,
): GraphEdge {
    return {
        id,
        name: 'Transition',
        fromNodeId,
        toNodeId,
    };
}

function save(
    nodes: GraphNode[],
    edges: GraphEdge[],
): {
    name: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    return {
        name: 'Flow',
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    };
}

async function pairPlaneGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<StoredGraph> {
    const flow = await ctx.GET<FlowWithGraph>(
        'flows/' + flowId,
    );
    return asStoredGraph(
        flow.graph, 'flow.graph',
    );
}

function norm(g: StoredGraph): StoredGraph {
    return {
        nodes: [...g.nodes]
            .sort((p, q) => p.id.localeCompare(q.id))
            .map(n => ({
                ...n,
                memberIds: [...n.memberIds].sort(),
                attributes: [...n.attributes].sort(
                    (p, q) => p.attributeId
                        .localeCompare(q.attributeId),
                ),
            })),
        edges: [...g.edges]
            .sort((p, q) => p.id.localeCompare(q.id)),
    };
}

// graphDelta member/attribute events across every document
// pair at this flow (SIDECAR-KEEP append-only ledger).
async function pairGraphDeltaEvents(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<{
    memberEvents: {
        flow_node_id: string;
        member_id: string;
        action: string;
    }[];
    attributeEvents: {
        flow_node_id: string;
        attribute_id: string;
        mode: string;
        action: string;
    }[];
}> {
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    const pairs = documentPairsAt(
        requests, responses, '/organizations/1/flows/',
    ).filter((p) => p.uriId === flowId);
    const memberEvents: {
        flow_node_id: string;
        member_id: string;
        action: string;
    }[] = [];
    const attributeEvents: {
        flow_node_id: string;
        attribute_id: string;
        mode: string;
        action: string;
    }[] = [];
    for (const pair of pairs) {
        const delta = pair.body['graphDelta'];
        if (typeof delta !== 'object' || delta === null) {
            continue;
        }
        const d = delta as Record<string, unknown>;
        const members = d['memberEvents'];
        if (Array.isArray(members)) {
            for (const raw of members) {
                if (typeof raw !== 'object' || raw === null) {
                    continue;
                }
                const m = raw as Record<string, unknown>;
                memberEvents.push({
                    flow_node_id: String(m['flow_node_id']),
                    member_id: String(m['member_id']),
                    action: String(m['action']),
                });
            }
        }
        const attrs = d['attributeEvents'];
        if (Array.isArray(attrs)) {
            for (const raw of attrs) {
                if (typeof raw !== 'object' || raw === null) {
                    continue;
                }
                const a = raw as Record<string, unknown>;
                attributeEvents.push({
                    flow_node_id: String(a['flow_node_id']),
                    attribute_id: String(a['attribute_id']),
                    mode: String(a['mode']),
                    action: String(a['action']),
                });
            }
        }
    }
    return { memberEvents, attributeEvents };
}

// The known baseline graph save #1 establishes: two nodes
// (A keeps a member m1 and attribute x in editable mode,
// plus a soon-to-be-deleted member m2 and attribute y; B is
// plain) joined by edge e1. Save #2 diffs against THIS.
function buildBaselineGraph(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    const a = buildNode('a', {
        isCreate: true,
        memberIds: ['m1', 'm2'],
        attributes: [
            {
                attributeId: 'x',
                mode: 'editable',
                isRequired: false,
            },
            {
                attributeId: 'y',
                mode: 'readonly',
                isRequired: true,
            },
        ],
    });
    const b = buildNode('b', { isArchive: true });
    const c = buildNode('c');
    const e1 = buildEdge('e1', 'a', 'b');
    const e2 = buildEdge('e2', 'a', 'c');
    return { nodes: [a, b, c], edges: [e1, e2] };
}

// Save #2 working graph: add member m2→removed and m? ; the
// brief's seven operations — add a member, remove a member,
// add an attribute, change an attribute's mode, move a node,
// delete a node, delete an edge.
function buildWorkingGraph(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    const a = buildNode('a', {
        isCreate: true,
        positionX: 999, // moved
        positionY: 888,
        // m2 removed, m1 kept; nothing added on a
        memberIds: ['m1'],
        attributes: [
            // x mode changed editable -> readonly
            {
                attributeId: 'x',
                mode: 'readonly',
                isRequired: false,
            },
            // y removed; z added
            {
                attributeId: 'z',
                mode: 'editable',
                isRequired: true,
            },
        ],
    });
    // b gains member m2 (add a member)
    const b = buildNode('b', {
        isArchive: true,
        memberIds: ['m2'],
    });
    // c is deleted; edge e2 (a->c) is deleted with it
    const e1 = buildEdge('e1', 'a', 'b');
    return { nodes: [a, b], edges: [e1] };
}

async function seedKnownBaseline(
    ctx: RequestContext,
    flowId: string,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'project-1',
        name: 'Rel Save Flow',
    });
    const base = buildBaselineGraph();
    await putFlow(ctx, flowId, save(base.nodes, base.edges));
}

test(
    'PUT /flows/:id ROUND-TRIP: pair-plane graph'
    + ' equals the intended saved graph',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-save-rt';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));

        const graph = await pairPlaneGraph(ctx, flowId);

        // node c deleted, edge e2 deleted
        const nodeIds = graph.nodes
            .map(n => n.id).sort();
        assert.deepEqual(nodeIds, ['a', 'b']);
        const edgeIds = graph.edges.map(e => e.id);
        assert.deepEqual(edgeIds, ['e1']);

        const a = graph.nodes
            .find(n => n.id === 'a')!;
        // node a moved
        assert.equal(a.positionX, 999);
        assert.equal(a.positionY, 888);
        // member m2 removed from a, m1 kept
        assert.deepEqual(a.memberIds.sort(), ['m1']);
        // attribute x mode changed, y removed, z added
        const aAttrs = [...a.attributes]
            .sort((p, q) =>
                p.attributeId.localeCompare(q.attributeId));
        assert.deepEqual(
            aAttrs,
            [
                {
                    attributeId: 'x',
                    mode: 'readonly',
                    isRequired: false,
                },
                {
                    attributeId: 'z',
                    mode: 'editable',
                    isRequired: true,
                },
            ],
        );

        const b = graph.nodes
            .find(n => n.id === 'b')!;
        // member m2 added to b
        assert.deepEqual(b.memberIds.sort(), ['m2']);
    },
);

test(
    'PUT /flows/:id APPEND-ONLY: removed/re-added/'
    + 'changed leave new graphDelta events, never splice',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-save-ledger';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));

        const { memberEvents, attributeEvents } =
            await pairGraphDeltaEvents(db, flowId);
        // m2 on node a: an 'added' (baseline) then a
        // 'removed' (save #2). The 'added' is never spliced.
        const aM2 = memberEvents.filter(
            row => row.flow_node_id === 'a'
                && row.member_id === 'm2',
        );
        const aM2Actions = aM2.map(r => r.action).sort();
        assert.deepEqual(
            aM2Actions, ['added', 'removed'],
            'removed member leaves a removed event beside'
            + ' the original added event',
        );
        // m2 re-added on node b: a NEW 'added' event
        const bM2 = memberEvents.filter(
            row => row.flow_node_id === 'b'
                && row.member_id === 'm2',
        );
        assert.equal(bM2.length, 1);
        assert.equal(bM2[0]!.action, 'added');

        // x on a: baseline 'added' (editable) then a NEW
        // 'added' (readonly) — prior event UNMUTATED.
        const aX = attributeEvents.filter(
            row => row.flow_node_id === 'a'
                && row.attribute_id === 'x',
        );
        assert.equal(
            aX.length, 2,
            'mode change appends a new added event',
        );
        const editableRow = aX.find(
            r => r.mode === 'editable',
        );
        const readonlyRow = aX.find(
            r => r.mode === 'readonly',
        );
        assert.ok(
            editableRow,
            'the original editable event is untouched',
        );
        assert.ok(readonlyRow);
        // y on a removed: an 'added' then a 'removed'
        const aY = attributeEvents.filter(
            row => row.flow_node_id === 'a'
                && row.attribute_id === 'y',
        );
        assert.deepEqual(
            aY.map(r => r.action).sort(),
            ['added', 'removed'],
        );
    },
);

test(
    'PUT /flows/:id IDEMPOTENCY: replaying one delta'
    + ' body twice leaves pair graph unchanged',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-save-idem';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        // Capture ONE PUT body (with one graphDelta) AND its
        // If-Response-ID echo, and replay both.
        let captured: Record<string, unknown> | null = null;
        let capturedHeaders:
            readonly (readonly [string, string])[]
            | undefined;
        const origPut = ctx.PUT.bind(ctx);
        const spyCtx: RequestContext = {
            ...ctx,
            PUT: async <T,>(
                path: string,
                body?: unknown,
                headerFields?:
                    readonly (readonly [string, string])[],
            ): Promise<T> => {
                if (path === 'flows/' + flowId
                    && captured === null) {
                    captured =
                        body as Record<string, unknown>;
                    capturedHeaders = headerFields;
                }
                return origPut<T>(path, body, headerFields);
            },
        };
        await putFlow(spyCtx, flowId, save(
            working.nodes, working.edges,
        ));
        assert.ok(captured, 'a PUT body was captured');

        const firstGraph = norm(
            await pairPlaneGraph(ctx, flowId),
        );

        // Replay the EXACT captured body (and its echo header).
        await origPut(
            'flows/' + flowId, captured, capturedHeaders,
        );

        // Derived state identical (byte-identical resend).
        const replayGraph = norm(
            await pairPlaneGraph(ctx, flowId),
        );
        assert.deepEqual(replayGraph, firstGraph);
    },
);

test(
    'PUT /flows/:id pair-plane graph equals the'
    + ' intended working graph after save',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-save-dual';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));

        const flow = await ctx.GET<FlowWithGraph>(
            'flows/' + flowId,
        );
        const blob = asStoredGraph(
            flow.graph, 'flow.graph',
        );
        const intended: StoredGraph = {
            nodes: working.nodes,
            edges: working.edges,
        };
        assert.deepEqual(norm(blob), norm(intended));
    },
);

test(
    'PUT /flows/:id still emits exactly one updated event'
    + ' (existing covenant intact)',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-save-event';
        await seedKnownBaseline(ctx, flowId);
        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));
        const events = await ctx.GET<StateEntity[]>(
            'flows/' + flowId + '/history',
        );
        // Family history is DESC — current first.
        assert.deepEqual(
            events.map(e => e.state),
            ['updated', 'updated', 'active'],
        );
    },
);
