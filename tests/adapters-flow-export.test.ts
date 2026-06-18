// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

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
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    postFlowFromBackup,
    type Backup,
} from '../web-app/app/adapters/flow-export.ts';
import {
    reassembleStoredGraph,
} from '../api/flow-graph-relations.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';

async function setup(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'current', 'Demo User',
    );
    await seedHumanMember(db, 'm1', 'Member One');
    const ctx = createRequestContext(
        db, await devToken(),
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

// Reads back all relation rows for a given flow and
// returns the reassembled domain graph.
async function readReassembled(
    db: MemoryDbAdapter,
    flowId: string,
) {
    const nodeRows =
        await db.flowNodes.getAllWhere(
            'flow_id', flowId,
        );
    const edgeRows =
        await db.flowEdges.getAllWhere(
            'flow_id', flowId,
        );
    const memberRows =
        await db.flowNodeMembers.getAll();
    const attrRows =
        await db.flowNodeAttributes.getAll();
    return reassembleStoredGraph(
        nodeRows, edgeRows, memberRows, attrRows,
    );
}

test(
    'postFlowFromBackup round-trip preserves'
    + ' node members AND attributes',
    async () => {
        const { db, ctx } = await setup();
        const newFlowId = 'imported-flow-1';
        const backup = buildBackupWithMembersAndAttrs();

        await postFlowFromBackup(
            ctx,
            newFlowId,
            backup,
            'project-1',
        );

        const graph = await readReassembled(
            db, newFlowId,
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
