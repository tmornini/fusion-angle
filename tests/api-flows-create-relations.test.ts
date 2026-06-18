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
} from '../api/types.ts';
import {
    buildStartAndCompleteNodes,
} from
'../web-app/app/adapters/flow-defaults.ts';
import {
    reassembleStoredGraph,
} from '../api/flow-graph-relations.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

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

test(
    'postFlowCreation seeds flow_nodes rows'
    + ' for the default graph',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-rel-1';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Rel Test Flow',
        });
        const nodeRows = await db.flowNodes
            .getAllWhere('flow_id', flowId);
        assert.equal(
            nodeRows.length,
            2,
            'expected 2 node rows for the'
            + ' default graph',
        );
    },
);

test(
    'postFlowCreation: reassembled graph'
    + ' equals the default graph',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-rel-2';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Rel Test Flow 2',
        });

        const nodeRows = await db.flowNodes
            .getAllWhere('flow_id', flowId);
        const edgeRows = await db.flowEdges
            .getAllWhere('flow_id', flowId);
        const memberRows = await db.flowNodeMembers
            .getAll();
        const attrRows = await db.flowNodeAttributes
            .getAll();

        // Reassemble from the seeded relation rows
        const reassembled = reassembleStoredGraph(
            nodeRows, edgeRows, memberRows, attrRows,
        );

        // Build the expected default graph
        const { start, complete } =
            buildStartAndCompleteNodes();

        assert.equal(
            reassembled.nodes.length, 2,
            'expected 2 nodes',
        );
        assert.equal(
            reassembled.edges.length, 0,
            'expected 0 edges',
        );

        const createNode = reassembled.nodes.find(
            n => n.isCreate,
        );
        const archiveNode = reassembled.nodes.find(
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
        const { db, ctx } = await setupMemDb();
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
    'postFlowCreation: flow_edges is empty'
    + ' for the default graph',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-rel-4';
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Edge Test Flow',
        });
        const edgeRows = await db.flowEdges
            .getAllWhere('flow_id', flowId);
        assert.equal(
            edgeRows.length, 0,
            'expected 0 edge rows for the'
            + ' default graph',
        );
    },
);
