import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StateEntity,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    seedHumanWorker,
} from './worker-fixtures.ts';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedHumanWorker(db, 'current', 'Demo User');
    const ctx = createRequestContext(db);
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
        workerIds: [],
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

async function createBaseFlow(
    ctx: RequestContext,
    flowId: string,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'project-1',
        name: 'Test Flow',
    });
}

test(
    'postFlowCreation creates flow plus link',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const flow = await ctx.GET<FlowEntity>(
            'flows/flow-1',
        );
        assert.equal(flow.id, 'flow-1');
        assert.equal(flow.name, 'Test Flow');
        assert.equal(
            flow.lock_timeout,
            DEFAULT_LOCK_TIMEOUT,
        );
        const links =
            await ctx.GET<{
                id: string;
                project_id: string;
                flow_id: string;
            }[]>(
                'project-flows',
            );
        const link = links.find(
            l => l.flow_id === 'flow-1',
        );
        assert.ok(link);
        assert.equal(
            link.project_id, 'project-1',
        );
    },
);

test(
    'postFlowCreation emits an active state event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const events =
            await ctx.GET<StateEntity[]>(
                'entity-states/flow-1/history',
            );
        assert.equal(events.length, 1);
        const ev = events[0]!;
        assert.equal(ev.entity_id, 'flow-1');
        assert.equal(ev.state, 'active');
    },
);

test(
    'putFlow emits an updated state event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        await putFlow(ctx, 'flow-1', {
            name: 'Edited',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [],
            edges: [],
        });
        const events =
            await ctx.GET<StateEntity[]>(
                'entity-states/flow-1/history',
            );
        assert.equal(events.length, 2);
        const states = events.map(e => e.state);
        assert.deepEqual(
            states, ['active', 'updated'],
        );
    },
);

test(
    'putFlow persists every FlowSaveShape field',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const start = buildNode('start', {
            isCreate: true,
        });
        const complete = buildNode('end', {
            isArchive: true,
        });
        const middle = buildNode('mid');
        const edge = buildEdge(
            'e1', 'start', 'mid',
        );
        await putFlow(ctx, 'flow-1', {
            name: 'Renamed',
            isLocked: true,
            isAutoLayout: true,
            isAutoFit: true,
            lockTimeout: 600,
            nodes: [start, middle, complete],
            edges: [edge],
        });
        const flow = await ctx.GET<FlowEntity>(
            'flows/flow-1',
        );
        assert.equal(flow.name, 'Renamed');
        assert.equal(flow.is_locked, true);
        assert.equal(flow.is_auto_layout, true);
        assert.equal(flow.is_auto_fit, true);
        assert.equal(flow.lock_timeout, 600);
        const graph =
            JSON.parse(flow.graph) as StoredGraph;
        assert.equal(graph.nodes.length, 3);
        assert.equal(graph.edges.length, 1);
        assert.equal(
            graph.edges[0]!.id, 'e1',
        );
    },
);

test(
    'putFlow replaces graph fully'
    + ' (no bleed-through from prior writes)',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const a = buildNode('a');
        const b = buildNode('b');
        const ab = buildEdge('ab', 'a', 'b');
        await putFlow(ctx, 'flow-1', {
            name: 'v1',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [a, b],
            edges: [ab],
        });
        await putFlow(ctx, 'flow-1', {
            name: 'v2',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [a],
            edges: [],
        });
        const flow = await ctx.GET<FlowEntity>(
            'flows/flow-1',
        );
        const graph =
            JSON.parse(flow.graph) as StoredGraph;
        assert.equal(graph.nodes.length, 1);
        assert.equal(graph.nodes[0]!.id, 'a');
        assert.equal(graph.edges.length, 0);
    },
);

test(
    'putFlow last-write-wins'
    + ' across two starting-from-same callers',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const baseNode = buildNode('base');
        const callerANodes = [
            baseNode, buildNode('a-added'),
        ];
        const callerBNodes = [
            baseNode, buildNode('b-added'),
        ];
        await putFlow(ctx, 'flow-1', {
            name: 'caller-A',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: callerANodes,
            edges: [],
        });
        await putFlow(ctx, 'flow-1', {
            name: 'caller-B',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: callerBNodes,
            edges: [],
        });
        const flow = await ctx.GET<FlowEntity>(
            'flows/flow-1',
        );
        assert.equal(flow.name, 'caller-B');
        const graph =
            JSON.parse(flow.graph) as StoredGraph;
        assert.equal(graph.nodes.length, 2);
        assert.ok(
            graph.nodes.some(
                n => n.id === 'b-added',
            ),
        );
        assert.ok(
            !graph.nodes.some(
                n => n.id === 'a-added',
            ),
        );
    },
);
