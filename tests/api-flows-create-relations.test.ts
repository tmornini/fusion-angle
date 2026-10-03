import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    type RequestContext,
} from '../client/request-context.ts';
import { inPageContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    postFlowCreation,
} from
'../client/flow-mutations.ts';
import type {
    FlowWithGraph,
    StoredGraph,
} from '../shared/types.ts';
import {
    buildStartAndCompleteNodes,
} from
'../client/flow-defaults.ts';
import { asStoredGraph } from '../shared/flow-graph-body.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Phase Final Task 2: graph relation ROW halves stripped.
// Create still seeds graph on the document message pair; oracles
// re-home to GET /organizations/:id/flows/:id (message-plane graph).

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
    const ctx = inPageContext(db, await organizationToken());
    return { db, ctx };
}

async function getFlowGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<StoredGraph> {
    const flow = (await ctx.GET<FlowWithGraph>(
        'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId,
    )).body().toValue();
    return asStoredGraph(
        flow.graph, 'flow.graph',
    );
}

Deno.test(
    'postFlowCreation seeds default-graph nodes'
    + ' on the message plane',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Rel Test Flow',
        });
        const graph = await getFlowGraph(ctx, flowId);
        assertStrictEquals(
            graph.nodes.length,
            2,
            'expected 2 nodes for the default graph',
        );
    },
);

Deno.test(
    'postFlowCreation: message-plane graph'
    + ' equals the default graph',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Rel Test Flow 2',
        });

        const graph = await getFlowGraph(ctx, flowId);
        const { start, complete } =
            buildStartAndCompleteNodes();

        assertStrictEquals(
            graph.nodes.length, 2,
            'expected 2 nodes',
        );
        assertStrictEquals(
            graph.edges.length, 0,
            'expected 0 edges',
        );

        const createNode = graph.nodes.find(
            n => n.isCreate,
        );
        const archiveNode = graph.nodes.find(
            n => n.isArchive,
        );

        assert(
            createNode,
            'expected a create node',
        );
        assert(
            archiveNode,
            'expected an archive node',
        );
        assertStrictEquals(
            createNode.name,
            start.name,
            'create node name',
        );
        assertStrictEquals(
            archiveNode.name,
            complete.name,
            'archive node name',
        );
        assertEquals(
            createNode.memberIds, [],
            'create node has no members',
        );
        assertEquals(
            createNode.attributes, [],
            'create node has no attributes',
        );
    },
);

Deno.test(
    'postFlowCreation: initial active state event'
    + ' still lands',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'State Event Test Flow',
        });
        const parts = await ctx.GETCollection<{
            id: string;
            state: string;
        }>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/versions/',
        );
        assertStrictEquals(parts.length, 1);
        const part = parts[0]!;
        const ev = part.body().toValue();
        assertStrictEquals(ev.id, flowId);
        assertStrictEquals(ev.state, 'active');
        // author is server-derived, not client body
        assertStrictEquals(
            part.query('header.requester-identity-id')
                .toText(),
            'XXZruirZyAOoRpNxaDnpSA',
            'state event must be authored by the'
                + ' verified actor',
        );
    },
);

Deno.test(
    'postFlowCreation: message-plane graph has no'
    + ' edges for the default graph',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Edge Test Flow',
        });
        const graph = await getFlowGraph(ctx, flowId);
        assertStrictEquals(
            graph.edges.length, 0,
            'expected 0 edges for the default graph',
        );
    },
);
