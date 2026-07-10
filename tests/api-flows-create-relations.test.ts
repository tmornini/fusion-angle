import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postFlowCreation,
} from
'../web-app/app/adapters/flow-mutations.ts';
import type {
    StateEntity,
    FlowWithGraph,
    StoredGraph,
} from '../api/types.ts';
import {
    buildStartAndCompleteNodes,
} from
'../web-app/app/adapters/flow-defaults.ts';
import {
    asStoredGraph,
} from '../api/validators.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

// Phase Final Task 2: graph relation ROW halves stripped.
// Create still seeds graph on the document pair; oracles
// re-home to GET /flows/:id (pair-plane graph).

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo User');
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

async function getFlowGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<StoredGraph> {
    const flow = await ctx.GET<FlowWithGraph>(
        'flows/' + flowId,
    );
    return asStoredGraph(
        JSON.parse(flow.graph), 'flow.graph',
    );
}

test(
    'postFlowCreation seeds default-graph nodes'
    + ' on the pair plane',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-rel-1';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Rel Test Flow',
        });
        const graph = await getFlowGraph(ctx, flowId);
        assert.equal(
            graph.nodes.length,
            2,
            'expected 2 nodes for the default graph',
        );
    },
);

test(
    'postFlowCreation: pair-plane graph'
    + ' equals the default graph',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-rel-2';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Rel Test Flow 2',
        });

        const graph = await getFlowGraph(ctx, flowId);
        const { start, complete } =
            buildStartAndCompleteNodes();

        assert.equal(
            graph.nodes.length, 2,
            'expected 2 nodes',
        );
        assert.equal(
            graph.edges.length, 0,
            'expected 0 edges',
        );

        const createNode = graph.nodes.find(
            n => n.isCreate,
        );
        const archiveNode = graph.nodes.find(
            n => n.isArchive,
        );

        assert.ok(
            createNode,
            'expected a create node',
        );
        assert.ok(
            archiveNode,
            'expected an archive node',
        );
        assert.equal(
            createNode.name,
            start.name,
            'create node name',
        );
        assert.equal(
            archiveNode.name,
            complete.name,
            'archive node name',
        );
        assert.deepEqual(
            createNode.memberIds, [],
            'create node has no members',
        );
        assert.deepEqual(
            createNode.attributes, [],
            'create node has no attributes',
        );
    },
);

test(
    'postFlowCreation: initial active state event'
    + ' still lands',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-rel-3';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'State Event Test Flow',
        });
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/' + flowId + '/history',
        );
        assert.equal(events.length, 1);
        const ev = events[0]!;
        assert.equal(ev.entity_id, flowId);
        assert.equal(ev.state, 'active');
        // author is server-derived, not client body
        assert.equal(
            ev.member_id, 'current',
            'state event must be authored by the verified actor',
        );
    },
);

test(
    'postFlowCreation: pair-plane graph has no'
    + ' edges for the default graph',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-rel-4';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Edge Test Flow',
        });
        const graph = await getFlowGraph(ctx, flowId);
        assert.equal(
            graph.edges.length, 0,
            'expected 0 edges for the default graph',
        );
    },
);
