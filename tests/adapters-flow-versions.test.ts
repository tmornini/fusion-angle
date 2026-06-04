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
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    postFlowVersion,
    getFlowVersions,
    deleteFlowVersion,
    FLOW_VERSION_CAP,
    type FlowVersion,
} from
'../web-app/app/adapters/flow-versions.ts';
import type {
    FlowVersionEntity,
    GraphNode,
    GraphEdge,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedRootAdmin,
} from './root-admin-fixture.ts';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    await seedHumanMember(db, 'current', 'Demo User');
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

async function saveGraph(
    ctx: RequestContext,
    flowId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
): Promise<void> {
    await putFlow(ctx, flowId, {
        name: 'Test Flow',
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    });
}

test(
    'postFlowVersion writes a version row',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        const rows = await db.flowVersions
            .getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.id, 'ver-1');
        assert.equal(
            rows[0]!.flow_id, 'flow-1',
        );
    },
);

test(
    'postFlowVersion snapshots the current'
    + ' graph as the version',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        const start = buildNode('start', {
            isCreate: true,
        });
        const mid = buildNode('mid');
        const end = buildNode('end', {
            isArchive: true,
        });
        const edge = buildEdge(
            'e1', 'start', 'mid',
        );
        await saveGraph(
            createRequestContext(db, await devToken()), 'flow-1',
            [start, mid, end], [edge],
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        const versions = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        assert.equal(versions.length, 1);
        const v = versions[0]!;
        assert.equal(v.nodes.length, 3);
        assert.equal(v.edges.length, 1);
        assert.equal(v.edges[0]!.id, 'e1');
        assert.ok(
            v.nodes.some(n => n.id === 'mid'),
        );
    },
);

test(
    'postFlowVersion copies flow metadata'
    + ' onto the version row',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        await putFlow(
            createRequestContext(db, await devToken()), 'flow-1',
            {
                name: 'Renamed',
                isLocked: true,
                isAutoLayout: true,
                isAutoFit: true,
                lockTimeout: 600,
                nodes: [buildNode('a')],
                edges: [],
            },
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        const versions = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        const v = versions[0]!;
        assert.equal(v.name, 'Renamed');
        assert.equal(v.isLocked, true);
        assert.equal(v.isAutoLayout, true);
        assert.equal(v.isAutoFit, true);
        assert.equal(v.lockTimeout, 600);
    },
);

test(
    'postFlowVersion captures a fresh'
    + ' at timestamp on the version',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        const rows = await db.flowVersions
            .getAll();
        const stamp = rows[0]!.at;
        assert.equal(typeof stamp, 'string');
        assert.ok(!Number.isNaN(
            Date.parse(stamp),
        ));
    },
);

test(
    'getFlowVersions returns an empty list'
    + ' when no versions exist',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        const versions = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        assert.deepEqual(versions, []);
    },
);

test(
    'getFlowVersions returns versions for'
    + ' the asked flow only',
    async () => {
        const { db } = await setupMemDb();
        const c1 = createRequestContext(db, await devToken());
        await createBaseFlow(c1, 'flow-1');
        await createBaseFlow(c1, 'flow-2');
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'a1', 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'a2', 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'b1', 'flow-2',
        );
        const v1 = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        const v2 = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-2',
        );
        assert.equal(v1.length, 2);
        assert.ok(v1.every(
            v => v.flowId === 'flow-1',
        ));
        assert.equal(v2.length, 1);
        assert.equal(v2[0]!.id, 'b1');
    },
);

test(
    'getFlowVersions orders newest first',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-2', 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-3', 'flow-1',
        );
        const versions = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        const ids = versions.map(v => v.id);
        assert.deepEqual(
            ids, ['ver-3', 'ver-2', 'ver-1'],
        );
    },
);

test(
    'deleteFlowVersion hard-deletes the row',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-2', 'flow-1',
        );
        await deleteFlowVersion(
            createRequestContext(db, await devToken()), 'ver-1',
        );
        const versions = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        assert.equal(versions.length, 1);
        assert.equal(versions[0]!.id, 'ver-2');
        const rows = await db.flowVersions
            .getAll();
        assert.equal(rows.length, 1);
    },
);

test(
    'FLOW_VERSION_CAP equals 10',
    () => {
        assert.equal(FLOW_VERSION_CAP, 10);
    },
);

test(
    'postFlowVersion keeps at most'
    + ' FLOW_VERSION_CAP versions',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        for (
            let i = 1;
            i <= FLOW_VERSION_CAP + 1;
            i++
        ) {
            await postFlowVersion(
                createRequestContext(db, await devToken()),
                'ver-' + i, 'flow-1',
            );
        }
        const versions = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        assert.equal(
            versions.length, FLOW_VERSION_CAP,
        );
    },
);

test(
    'postFlowVersion trims the oldest version'
    + ' when over the cap',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        for (
            let i = 1;
            i <= FLOW_VERSION_CAP + 1;
            i++
        ) {
            await postFlowVersion(
                createRequestContext(db, await devToken()),
                'ver-' + i, 'flow-1',
            );
        }
        const ids = (await db.flowVersions
            .getAll()).map(r => r.id);
        assert.ok(!ids.includes('ver-1'));
        assert.ok(ids.includes('ver-2'));
        assert.ok(
            ids.includes(
                'ver-' + (FLOW_VERSION_CAP + 1),
            ),
        );
    },
);

test(
    'cap trimming does not touch versions'
    + ' belonging to another flow',
    async () => {
        const { db } = await setupMemDb();
        const c1 = createRequestContext(db, await devToken());
        await createBaseFlow(c1, 'flow-1');
        await createBaseFlow(c1, 'flow-2');
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'other-1', 'flow-2',
        );
        for (
            let i = 1;
            i <= FLOW_VERSION_CAP + 1;
            i++
        ) {
            await postFlowVersion(
                createRequestContext(db, await devToken()),
                'ver-' + i, 'flow-1',
            );
        }
        const v2 = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-2',
        );
        assert.equal(v2.length, 1);
        assert.equal(v2[0]!.id, 'other-1');
        const v1 = await getFlowVersions(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        assert.equal(
            v1.length, FLOW_VERSION_CAP,
        );
    },
);

test(
    'a persisted version is visible through'
    + ' a fresh context and the raw table',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await devToken()), 'flow-1',
        );
        await postFlowVersion(
            createRequestContext(db, await devToken()),
            'ver-1', 'flow-1',
        );
        const raw = await createRequestContext(db, await devToken())
            .GET<FlowVersionEntity[]>(
                'flow-versions',
            );
        assert.equal(raw.length, 1);
        assert.equal(raw[0]!.id, 'ver-1');
        const versions: FlowVersion[] =
            await getFlowVersions(
                createRequestContext(db, await devToken()),
                'flow-1',
            );
        assert.equal(versions.length, 1);
        assert.equal(versions[0]!.id, 'ver-1');
    },
);
