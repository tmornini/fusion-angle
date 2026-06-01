// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    validateFlowForCreation,
    getFlowsForCreation,
} from '../web-app/app/adapters/flow-publish.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    FlowEntity,
    GraphEdge,
    GraphNode,
    StoredGraph,
} from '../api/types.ts';

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
        workerIds: [],
        attributes: [],
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

function buildFlowEntity(
    id: string,
    graph: StoredGraph,
    overrides: Partial<FlowEntity> = {},
): FlowEntity {
    return {
        id,
        name: 'Flow ' + id,
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: jsonObjectField(
            graph as unknown as Record<
                string, unknown
            >,
        ),
        ...overrides,
    };
}

function readyGraph(): StoredGraph {
    return {
        nodes: [
            buildNode('start', { isCreate: true }),
            buildNode('mid', {
                workerIds: ['hw_1'],
            }),
            buildNode('done', { isArchive: true }),
        ],
        edges: [
            buildEdge('e1', 'start', 'mid'),
            buildEdge('e2', 'mid', 'done'),
        ],
    };
}

test(
    'validateFlowForCreation reports ready when'
    + ' every regular node has a worker and an'
    + ' outgoing edge',
    () => {
        const flow = buildFlowEntity(
            'f1', readyGraph(),
        );
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, true);
        assert.equal(r.problems.length, 0);
    },
);

test(
    'validateFlowForCreation flags zero_workers'
    + ' on regular nodes with empty workerIds',
    () => {
        const graph: StoredGraph = {
            nodes: [
                buildNode('start', {
                    isCreate: true,
                }),
                buildNode('mid'),
                buildNode('done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge('e1', 'start', 'mid'),
                buildEdge('e2', 'mid', 'done'),
            ],
        };
        const flow = buildFlowEntity('f1', graph);
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, false);
        assert.equal(r.problems.length, 1);
        assert.equal(
            r.problems[0]!.kind, 'zero_workers',
        );
        assert.equal(
            r.problems[0]!.nodeId, 'mid',
        );
    },
);

test(
    'validateFlowForCreation flags dead_end on'
    + ' a non-End node with zero outgoing edges',
    () => {
        const graph: StoredGraph = {
            nodes: [
                buildNode('start', {
                    isCreate: true,
                }),
                buildNode('mid', {
                    workerIds: ['hw_1'],
                }),
                buildNode('orphan', {
                    workerIds: ['hw_1'],
                }),
                buildNode('done', {
                    isArchive: true,
                }),
            ],
            // orphan has no outgoing edge
            edges: [
                buildEdge('e1', 'start', 'mid'),
                buildEdge('e2', 'mid', 'done'),
            ],
        };
        const flow = buildFlowEntity('f1', graph);
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, false);
        const problem = r.problems.find(
            p => p.nodeId === 'orphan',
        );
        assert.ok(problem);
        assert.equal(problem!.kind, 'dead_end');
    },
);

test(
    'validateFlowForCreation ignores start and'
    + ' complete nodes (they never hazard)',
    () => {
        const graph: StoredGraph = {
            nodes: [
                buildNode('start', {
                    isCreate: true,
                    // intentionally empty
                }),
                buildNode('mid', {
                    workerIds: ['hw_1'],
                }),
                buildNode('done', {
                    isArchive: true,
                    // intentionally empty
                }),
            ],
            edges: [
                buildEdge('e1', 'start', 'mid'),
                buildEdge('e2', 'mid', 'done'),
            ],
        };
        const flow = buildFlowEntity('f1', graph);
        const r = validateFlowForCreation(flow);
        assert.equal(r.ready, true);
    },
);

test(
    'getFlowsForCreation partitions ready and'
    + ' notReady flows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        const goodGraph = readyGraph();
        const badGraph: StoredGraph = {
            nodes: [
                buildNode('start', {
                    isCreate: true,
                }),
                buildNode('mid'),
                buildNode('done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge('e1', 'start', 'mid'),
                buildEdge('e2', 'mid', 'done'),
            ],
        };
        const { id: _g, ...goodBody } =
            buildFlowEntity('good', goodGraph);
        const { id: _b, ...badBody } =
            buildFlowEntity('bad', badGraph);
        await db.flows.put('good', goodBody);
        await db.flows.put('bad', badBody);
        const ctx = createRequestContext(db);
        const result = await getFlowsForCreation(
            ctx,
        );
        assert.equal(result.ready.length, 1);
        assert.equal(result.ready[0]!.id, 'good');
        assert.equal(result.notReady.length, 1);
        assert.equal(
            result.notReady[0]!.id, 'bad',
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
        const db = new MemoryDbAdapter();
        await db.createSchema();
        const { id: _g, ...lockedReadyBody } =
            buildFlowEntity(
                'locked-ready', readyGraph(),
                { is_locked: true },
            );
        const { id: _g2, ...openReadyBody } =
            buildFlowEntity(
                'open-ready', readyGraph(),
            );
        await db.flows.put(
            'locked-ready', lockedReadyBody,
        );
        await db.flows.put(
            'open-ready', openReadyBody,
        );
        const ctx = createRequestContext(db);
        const result = await getFlowsForCreation(
            ctx,
        );
        assert.equal(result.ready.length, 1);
        assert.equal(
            result.ready[0]!.id, 'open-ready',
        );
        assert.equal(result.notReady.length, 0);
    },
);
