// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    validateFlowForCreation,
    getFlowsForCreation,
} from '../web-app/app/adapters/flow-publish.ts';
import {
    postFlowCreation,
    putFlow,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    storedGraph,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import { asStoredGraph } from '../api/validators.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import type {
    FlowWithGraph,
    GraphEdge,
    GraphNode,
    StoredGraph,
} from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

function buildNode(
    id: string,
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: id.toUpperCase(),
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
    from: string,
    to: string,
): GraphEdge {
    return {
        id, name: '',
        fromNodeId: from, toNodeId: to,
    };
}

// Carries the authored graph literal alongside the stored
// scalar fields. `graph` is NOT a stored column — it is the
// relation-seed input; the flow row stores only the scalars.
function buildFlowEntity(
    id: string,
    graph: StoredGraph,
    overrides: Partial<FlowWithGraph> = {},
): FlowWithGraph {
    return {
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        name: 'Flow ' + id,
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: storedGraph(graph),
        hasUndoHistory: false,
        ...overrides,
    };
}

// Seed a flow through the SAME gate-driven create/document-PUT
// idiom the live route uses (postFlowCreation + putFlow), so a
// message pair exists at this flow's address — required for the
// flipped GET flows route (Phase 4 Task 8), which
// getFlowsForCreation reads, to derive it. postFlowCreation
// seeds a default start/complete graph; the immediate putFlow
// overwrites it with the caller's own graph and is_locked flag —
// the two-step idiom every gate-driven flow fixture uses.
async function seedFlowWithRelations(
    ctx: RequestContext,
    flow: FlowWithGraph,
): Promise<void> {
    const graph = asStoredGraph(
        flow.graph, 'flow.graph',
    );
    await postFlowCreation(ctx, {
        flowId: flow.id,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name: flow.name,
    });
    await putFlow(ctx, flow.id, {
        name: flow.name,
        isLocked: flow.is_locked,
        isAutoLayout: flow.is_auto_layout,
        isAutoFit: flow.is_auto_fit,
        lockTimeout: flow.lock_timeout,
        nodes: graph.nodes,
        edges: graph.edges,
    });
}

// Node/edge ids are globally-unique canvas ids (the flow_nodes
// keyPath), so seeding two flows demands distinct ids — the
// optional prefix namespaces them per flow.
function readyGraph(memberId: string): StoredGraph {
    const start = generateIdentifier();
    const mid = generateIdentifier();
    const done = generateIdentifier();
    return {
        nodes: [
            buildNode(start, { isCreate: true }),
            buildNode(mid, {
                memberIds: [memberId],
            }),
            buildNode(done, { isArchive: true }),
        ],
        edges: [
            buildEdge(
                generateIdentifier(), start, mid,
            ),
            buildEdge(
                generateIdentifier(), mid, done,
            ),
        ],
    };
}

test(
    'validateFlowForCreation reports ready when'
    + ' every regular node has a member and an'
    + ' outgoing edge',
    () => {
        const flow = buildFlowEntity(
            generateIdentifier(),
            readyGraph(generateIdentifier()),
        );
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, true);
        assert.equal(r.problems.length, 0);
    },
);

test(
    'validateFlowForCreation flags zero_members'
    + ' on regular nodes with empty memberIds',
    () => {
        const start = generateIdentifier();
        const mid = generateIdentifier();
        const done = generateIdentifier();
        const graph: StoredGraph = {
            nodes: [
                buildNode(start, {
                    isCreate: true,
                }),
                buildNode(mid),
                buildNode(done, {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(), start, mid,
                ),
                buildEdge(
                    generateIdentifier(), mid, done,
                ),
            ],
        };
        const flow = buildFlowEntity(
            generateIdentifier(), graph,
        );
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, false);
        assert.equal(r.problems.length, 1);
        assert.equal(
            r.problems[0]!.kind, 'zero_members',
        );
        assert.equal(
            r.problems[0]!.nodeId, mid,
        );
    },
);

test(
    'validateFlowForCreation flags dead_end on'
    + ' a non-End node with zero outgoing edges',
    () => {
        const start = generateIdentifier();
        const mid = generateIdentifier();
        const orphan = generateIdentifier();
        const done = generateIdentifier();
        const memberId = generateIdentifier();
        const graph: StoredGraph = {
            nodes: [
                buildNode(start, {
                    isCreate: true,
                }),
                buildNode(mid, {
                    memberIds: [memberId],
                }),
                buildNode(orphan, {
                    memberIds: [memberId],
                }),
                buildNode(done, {
                    isArchive: true,
                }),
            ],
            // orphan has no outgoing edge
            edges: [
                buildEdge(
                    generateIdentifier(), start, mid,
                ),
                buildEdge(
                    generateIdentifier(), mid, done,
                ),
            ],
        };
        const flow = buildFlowEntity(
            generateIdentifier(), graph,
        );
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, false);
        const problem = r.problems.find(
            p => p.nodeId === orphan,
        );
        assert.ok(problem);
        assert.equal(problem!.kind, 'dead_end');
    },
);

test(
    'validateFlowForCreation ignores start and'
    + ' complete nodes (they never hazard)',
    () => {
        const start = generateIdentifier();
        const mid = generateIdentifier();
        const done = generateIdentifier();
        const graph: StoredGraph = {
            nodes: [
                buildNode(start, {
                    isCreate: true,
                    // intentionally empty
                }),
                buildNode(mid, {
                    memberIds: [generateIdentifier()],
                }),
                buildNode(done, {
                    isArchive: true,
                    // intentionally empty
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(), start, mid,
                ),
                buildEdge(
                    generateIdentifier(), mid, done,
                ),
            ],
        };
        const flow = buildFlowEntity(
            generateIdentifier(), graph,
        );
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, true);
    },
);

test(
    'getFlowsForCreation partitions ready and'
    + ' notReady flows',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        const goodId = generateIdentifier();
        const badId = generateIdentifier();
        const goodGraph = readyGraph(
            generateIdentifier(),
        );
        const badStart = generateIdentifier();
        const badMid = generateIdentifier();
        const badDone = generateIdentifier();
        const badGraph: StoredGraph = {
            nodes: [
                buildNode(badStart, {
                    isCreate: true,
                }),
                buildNode(badMid),
                buildNode(badDone, {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(),
                    badStart, badMid,
                ),
                buildEdge(
                    generateIdentifier(),
                    badMid, badDone,
                ),
            ],
        };
        await seedFlowWithRelations(
            ctx, buildFlowEntity(goodId, goodGraph),
        );
        await seedFlowWithRelations(
            ctx, buildFlowEntity(badId, badGraph),
        );
        const result = await getFlowsForCreation(
            ctx,
        );
        assert.equal(result.ready.length, 1);
        assert.equal(result.ready[0]!.id, goodId);
        assert.equal(result.notReady.length, 1);
        assert.equal(
            result.notReady[0]!.id, badId,
        );
        assert.equal(
            result.notReady[0]!.problemCount, 1,
        );
    },
);

test(
    'getFlowsForCreation filters out locked flows'
    + ' entirely (regardless of readiness)',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        const lockedId = generateIdentifier();
        const openId = generateIdentifier();
        const memberId = generateIdentifier();
        await seedFlowWithRelations(
            ctx,
            buildFlowEntity(
                lockedId, readyGraph(memberId),
                { is_locked: true },
            ),
        );
        await seedFlowWithRelations(
            ctx,
            buildFlowEntity(
                openId, readyGraph(memberId),
            ),
        );
        const result = await getFlowsForCreation(
            ctx,
        );
        assert.equal(result.ready.length, 1);
        assert.equal(
            result.ready[0]!.id, openId,
        );
        assert.equal(result.notReady.length, 0);
    },
);
