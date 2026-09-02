import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    postFlowFromBackup,
    postFlowFromMermaid,
    postFlowFromZip,
    getBackupFromZip,
    getFlowZip,
    type Backup,
} from '../web-app/app/adapters/flow-export.ts';
import {
    postFlowCreation,
    putFlow,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    getFlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';
import {
    generateMermaid,
    mermaidIdOf,
} from '../web-app/app/mermaid-generate.ts';
import {
    DEFAULT_ZIP_LIMITS,
    getZipEntries,
} from '../web-app/app/zip.ts';
import {
    encodeIdentifier,
    generateIdentifier,
} from '../shared/identifier.ts';
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

const NULL_STORAGE: Partial<Storage> = {
    getItem: () => null,
    setItem: () => {},
};

async function setup(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
    );
    await seedHumanMember(db, 'mFNSxZqywTSMXhgUTdTqtA', 'Member One');
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    return { db, ctx };
}

function buildBackupWithMembersAndAttrs(
): { backup: Backup; attributeId: string } {
    const n1 = generateIdentifier();
    const n2 = generateIdentifier();
    const attributeId = generateIdentifier();
    return {
        attributeId,
        backup: {
            exportedAt: '2026-01-01T00:00:00.000000Z',
            projectId: generateIdentifier(),
            flow: {
                id: generateIdentifier(),
                name: 'Backup Flow',
                isLocked: false,
                isAutoLayout: false,
                isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                graph: {
                    nodes: [
                        {
                            id: n1,
                            name: 'Start',
                            positionX: 0,
                            positionY: 0,
                            isCreate: true,
                            isArchive: false,
                            memberIds: [
                                'mFNSxZqywTSMXhgUTdTqtA',
                            ],
                            attributes: [
                                {
                                    attributeId,
                                    mode: 'readonly',
                                    isRequired: true,
                                },
                            ],
                            taskInstructions: '',
                        },
                        {
                            id: n2,
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
                            id: generateIdentifier(),
                            name: 'Approve',
                            fromNodeId: n1,
                            toNodeId: n2,
                        },
                    ],
                },
            },
        },
    };
}

// Phase Final Task 2: graph relation ROW halves stripped —
// read the message-plane working graph via GET.
async function readPairGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<StoredGraph> {
    const flow = await ctx.GET<FlowWithGraph>(
        'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId,
    );
    return asStoredGraph(
        flow.graph, 'flow.graph',
    );
}

Deno.test(
    'postFlowFromBackup round-trip preserves'
    + ' node members AND attributes',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await setup();
        const newFlowId = generateIdentifier();
        const projectId = generateIdentifier();
        const { backup, attributeId } =
            buildBackupWithMembersAndAttrs();

        await postFlowFromBackup(
            ctx,
            newFlowId,
            backup,
            projectId,
        );

        const graph = await readPairGraph(
            ctx, newFlowId,
        );

        // Two nodes should be imported
        assertStrictEquals(
            graph.nodes.length, 2,
            'expected 2 imported nodes',
        );

        // The start node carries memberIds and attrs
        const startNode = graph.nodes.find(
            n => n.isCreate,
        );
        assert(
            startNode,
            'start node must be present',
        );

        // Members preserved
        assertEquals(
            startNode.memberIds,
            ['mFNSxZqywTSMXhgUTdTqtA'],
            'memberIds must be preserved',
        );

        // Attributes preserved — mode and isRequired
        assertStrictEquals(
            startNode.attributes.length, 1,
            'must have exactly 1 attribute',
        );
        const attr = startNode.attributes[0]!;
        assertStrictEquals(
            attr.attributeId, attributeId,
        );
        assertStrictEquals(
            attr.mode, 'readonly',
        );
        assertStrictEquals(
            attr.isRequired, true,
        );
    }),
);

// F5/F43: mermaid import must POST graphDelta (the flow
// row no longer carries a graph blob). A simple stateDiagram
// with one intermediate state seeds start + intermediate
// + complete via the import auto-wire path.
Deno.test(
    'postFlowFromMermaid creates a flow with'
    + ' a message-plane graph from simple .mmd',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await setup();
        const flowId = generateIdentifier();
        const mmd = [
            'stateDiagram-v2',
            '[*] --> Draft',
            'Draft --> [*]',
        ].join('\n');

        const result = await postFlowFromMermaid(
            ctx, flowId, mmd, generateIdentifier(),
        );
        assertStrictEquals(result.flowId, flowId);

        const graph = await readPairGraph(
            ctx, flowId,
        );
        assert(
            graph.nodes.length >= 2,
            'expected start + complete at minimum',
        );
        assert(
            graph.nodes.some(n => n.isCreate),
            'start node present',
        );
        assert(
            graph.nodes.some(n => n.isArchive),
            'complete node present',
        );
        assert(
            graph.edges.length >= 1,
            'at least one edge after auto-wire',
        );
    }),
);

Deno.test(
    'flowchart mmd with begin round-trips'
    + ' through postFlowFromMermaid',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await setup();
        const flowId = generateIdentifier();
        const startId = generateIdentifier();
        const midId = generateIdentifier();
        const endId = generateIdentifier();
        const mmd = generateMermaid({
            id: flowId,
            name: 'Lead',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [
                {
                    id: startId,
                    name: 'Create',
                    positionX: -190,
                    positionY: 30,
                    isCreate: true,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: midId,
                    name: 'Capture',
                    positionX: 0,
                    positionY: 30,
                    isCreate: false,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: endId,
                    name: 'Archive',
                    positionX: 190,
                    positionY: 30,
                    isCreate: false,
                    isArchive: true,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
            ],
            edges: [
                {
                    id: generateIdentifier(),
                    name: 'begin',
                    fromNodeId: startId,
                    toNodeId: midId,
                },
                {
                    id: generateIdentifier(),
                    name: 'submit',
                    fromNodeId: midId,
                    toNodeId: endId,
                },
            ],
            hasUndoHistory: false,
        });
        await postFlowFromMermaid(
            ctx, flowId, mmd, generateIdentifier(),
        );
        const graph = await readPairGraph(
            ctx, flowId,
        );
        const names = graph.edges
            .map(e => e.name)
            .sort();
        assertEquals(
            names, ['begin', 'submit'],
        );
    }),
);

Deno.test(
    'zip sidecar mermaid ids stay injective',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await setup();
        const dashBytes = new Uint8Array(16);
        dashBytes[0] = 62 << 2;
        const underBytes = new Uint8Array(16);
        underBytes[0] = 63 << 2;
        const dashId = encodeIdentifier(
            dashBytes,
        );
        const underId = encodeIdentifier(
            underBytes,
        );
        const flowId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Injective',
        });
        await putFlow(ctx, flowId, {
            name: 'Injective',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [
                {
                    id: dashId,
                    name: 'Dash',
                    positionX: 0,
                    positionY: 0,
                    isCreate: true,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: underId,
                    name: 'Under',
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
                    id: generateIdentifier(),
                    name: '',
                    fromNodeId: dashId,
                    toNodeId: underId,
                },
            ],
        });
        const zip = await getFlowZip(
            ctx, flowId,
        );
        const entries = await getZipEntries(
            zip.data, DEFAULT_ZIP_LIMITS,
        );
        const sidecar = entries.find(
            e => e.name === 'sidecar.json',
        );
        assert(sidecar, 'sidecar.json');
        const parsed = JSON.parse(
            new TextDecoder().decode(
                sidecar.data,
            ),
        ) as {
            nodes: { mermaidId: string }[];
            edges: {
                mermaidFrom: string;
                mermaidTo: string;
            }[];
        };
        const dashHex = mermaidIdOf(dashId);
        const underHex = mermaidIdOf(underId);
        assertNotStrictEquals(dashHex, underHex);
        const ids = parsed.nodes.map(
            n => n.mermaidId,
        );
        assertStrictEquals(
            new Set(ids).size, ids.length,
        );
        assert(ids.includes(dashHex));
        assert(ids.includes(underHex));
        assert(!ids.includes(dashId));
        assert(!ids.includes(underId));
        assert(
            !ids.includes(
                dashId.replaceAll('-', '_'),
            ),
        );
        const edge = parsed.edges[0];
        assertStrictEquals(edge?.mermaidFrom, dashHex);
        assertStrictEquals(edge?.mermaidTo, underHex);
    }),
);

Deno.test(
    'zip Create New keeps begin edges and'
    + ' sidecar positions with Auto Layout off',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await setup();
        const sourceId = generateIdentifier();
        const startId = generateIdentifier();
        const midId = generateIdentifier();
        const endId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId: sourceId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Lead',
        });
        await putFlow(ctx, sourceId, {
            name: 'Lead',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [
                {
                    id: startId,
                    name: 'Create',
                    positionX: -190,
                    positionY: 30,
                    isCreate: true,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: midId,
                    name: 'Capture',
                    positionX: 0,
                    positionY: 30,
                    isCreate: false,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: endId,
                    name: 'Archive',
                    positionX: 190,
                    positionY: 30,
                    isCreate: false,
                    isArchive: true,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
            ],
            edges: [
                {
                    id: generateIdentifier(),
                    name: 'begin',
                    fromNodeId: startId,
                    toNodeId: midId,
                },
                {
                    id: generateIdentifier(),
                    name: 'submit',
                    fromNodeId: midId,
                    toNodeId: endId,
                },
            ],
        });
        const zip = await getFlowZip(
            ctx, sourceId,
        );
        const backup = await getBackupFromZip(
            zip.data,
        );
        const importedId = generateIdentifier();
        await postFlowFromBackup(
            ctx, importedId, backup,
            generateIdentifier(),
        );
        const graph = await getFlowGraph(
            ctx, importedId,
        );
        assertStrictEquals(graph.isAutoLayout, false);
        const names = graph.edges
            .map(e => e.name)
            .sort();
        assertEquals(
            names, ['begin', 'submit'],
        );
        const capture = graph.nodes.find(
            n => n.name === 'Capture',
        );
        assert(capture);
        assertStrictEquals(capture.positionX, 0);
        assertStrictEquals(capture.positionY, 30);
        const create = graph.nodes.find(
            n => n.isCreate,
        );
        assert(create);
        assertStrictEquals(create.positionX, -190);
        assertStrictEquals(create.positionY, 30);
    }),
);

Deno.test(
    'zip mermaid path reads sidecar.json'
    + ' positions and begin edges',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await setup();
        const sourceId = generateIdentifier();
        const startId = generateIdentifier();
        const midId = generateIdentifier();
        const endId = generateIdentifier();
        await postFlowCreation(ctx, {
            flowId: sourceId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Lead',
        });
        await putFlow(ctx, sourceId, {
            name: 'Lead',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [
                {
                    id: startId,
                    name: 'Create',
                    positionX: -190,
                    positionY: 30,
                    isCreate: true,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: midId,
                    name: 'Capture',
                    positionX: 0,
                    positionY: 30,
                    isCreate: false,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
                {
                    id: endId,
                    name: 'Archive',
                    positionX: 190,
                    positionY: 30,
                    isCreate: false,
                    isArchive: true,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                },
            ],
            edges: [
                {
                    id: generateIdentifier(),
                    name: 'begin',
                    fromNodeId: startId,
                    toNodeId: midId,
                },
                {
                    id: generateIdentifier(),
                    name: 'submit',
                    fromNodeId: midId,
                    toNodeId: endId,
                },
            ],
        });
        const zip = await getFlowZip(
            ctx, sourceId,
        );
        const importedId = generateIdentifier();
        await postFlowFromZip(
            ctx, importedId, zip.data,
            generateIdentifier(),
        );
        const graph = await getFlowGraph(
            ctx, importedId,
        );
        assertStrictEquals(graph.isAutoLayout, false);
        const names = graph.edges
            .map(e => e.name)
            .sort();
        assertEquals(
            names, ['begin', 'submit'],
        );
        const capture = graph.nodes.find(
            n => n.name === 'Capture',
        );
        assert(capture);
        assertStrictEquals(capture.positionX, 0);
        assertStrictEquals(capture.positionY, 30);
    }),
);
