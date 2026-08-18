// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

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
import { devToken, organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    postFlowFromBackup,
    postFlowFromMermaid,
    type Backup,
} from '../web-app/app/adapters/flow-export.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    FlowWithGraph,
    StoredGraph,
} from '../api/types.ts';
import {
    asStoredGraph,
} from '../api/validators.ts';

async function setup(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'current', 'Demo User',
    );
    await seedHumanMember(db, 'm1', 'Member One');
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    return { db, ctx };
}

function buildBackupWithMembersAndAttrs(
): Backup {
    return {
        exportedAt: '2026-01-01T00:00:00.000000Z',
        projectId: 'project-1',
        flow: {
            id: 'backup-flow-1',
            name: 'Backup Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            graph: {
                nodes: [
                    {
                        id: 'orig-n1',
                        name: 'Start',
                        positionX: 0,
                        positionY: 0,
                        isCreate: true,
                        isArchive: false,
                        memberIds: ['m1'],
                        attributes: [
                            {
                                attributeId: 'attr-x',
                                mode: 'readonly',
                                isRequired: true,
                            },
                        ],
                        taskInstructions: '',
                    },
                    {
                        id: 'orig-n2',
                        name: 'Done',
                        positionX: 200,
                        positionY: 0,
                        isCreate: false,
                        isArchive: true,
                        memberIds: [],
                        attributes: [],
                        taskInstructions: '',
                    },
                ],
                edges: [
                    {
                        id: 'orig-e1',
                        name: 'Approve',
                        fromNodeId: 'orig-n1',
                        toNodeId: 'orig-n2',
                    },
                ],
            },
        },
    };
}

// Phase Final Task 2: graph relation ROW halves stripped —
// read the pair-plane working graph via GET.
async function readPairGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<StoredGraph> {
    const flow = await ctx.GET<FlowWithGraph>(
        'organizations/1/flows/' + flowId,
    );
    return asStoredGraph(
        flow.graph, 'flow.graph',
    );
}

test(
    'postFlowFromBackup round-trip preserves'
    + ' node members AND attributes',
    async () => {
        const { ctx } = await setup();
        const newFlowId = 'imported-flow-1';
        const backup = buildBackupWithMembersAndAttrs();

        await postFlowFromBackup(
            ctx,
            newFlowId,
            backup,
            'project-1',
        );

        const graph = await readPairGraph(
            ctx, newFlowId,
        );

        // Two nodes should be imported
        assert.equal(
            graph.nodes.length, 2,
            'expected 2 imported nodes',
        );

        // The start node carries memberIds and attrs
        const startNode = graph.nodes.find(
            n => n.isCreate,
        );
        assert.ok(
            startNode,
            'start node must be present',
        );

        // Members preserved
        assert.deepEqual(
            startNode.memberIds,
            ['m1'],
            'memberIds must be preserved',
        );

        // Attributes preserved — mode and isRequired
        assert.equal(
            startNode.attributes.length, 1,
            'must have exactly 1 attribute',
        );
        const attr = startNode.attributes[0]!;
        assert.equal(
            attr.attributeId, 'attr-x',
        );
        assert.equal(
            attr.mode, 'readonly',
        );
        assert.equal(
            attr.isRequired, true,
        );
    },
);

// F5/F43: mermaid import must POST graphDelta (the flow
// row no longer carries a graph blob). A simple stateDiagram
// with one intermediate state seeds start + intermediate
// + complete via the import auto-wire path.
test(
    'postFlowFromMermaid creates a flow with'
    + ' a pair-plane graph from simple .mmd',
    async () => {
        const { ctx } = await setup();
        const flowId = 'mermaid-import-1';
        const mmd = [
            'stateDiagram-v2',
            '[*] --> Draft',
            'Draft --> [*]',
        ].join('\n');

        const result = await postFlowFromMermaid(
            ctx, flowId, mmd, 'project-1',
        );
        assert.equal(result.flowId, flowId);

        const graph = await readPairGraph(
            ctx, flowId,
        );
        assert.ok(
            graph.nodes.length >= 2,
            'expected start + complete at minimum',
        );
        assert.ok(
            graph.nodes.some(n => n.isCreate),
            'start node present',
        );
        assert.ok(
            graph.nodes.some(n => n.isArchive),
            'complete node present',
        );
        assert.ok(
            graph.edges.length >= 1,
            'at least one edge after auto-wire',
        );
    },
);
