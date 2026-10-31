import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    classifyInboxDrop,
    inboxListKindFromHash,
    transferInboxDrop,
} from '../web-app/app/workbox-inbox-drag.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    createWorkOrderFromFlow,
} from
    '../web-app/app/work-order-creation.ts';
import {
    postFlowCreation,
    putFlow,
} from '../client/flow-mutations.ts';
import {
    deleteWorkOrderClaim,
    getWorkOrders,
    isClaimedAndUnlapsed,
    type RequestContext,
} from '../client/index.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    type GraphEdge,
    type GraphNode,
    type StoredGraph,
} from '../shared/types.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const N_FINISH = generateIdentifier();
const E2 = generateIdentifier();

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
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
        name: '',
        fromNodeId,
        toNodeId,
    };
}

function buildLinearGraph(): StoredGraph {
    // n-middle carries one member so the flow
    // passes the publish gate (zero-member nodes
    // would mark the flow Not Ready).
    return {
        nodes: [
            buildNode(N_START, 'Start', {
                isCreate: true,
            }),
            buildNode(N_MIDDLE, 'Doing work', {
                memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
            }),
            buildNode(N_FINISH, 'Done', {
                isArchive: true,
            }),
        ],
        edges: [
            buildEdge(
                'YiJPbufDpkyrZcZCYbUJpg',
                N_START,
                N_MIDDLE,
            ),
            buildEdge(E2, N_MIDDLE, N_FINISH),
        ],
    };
}

// Seed a flow through the SAME gate-driven
// create/document-PUT idiom the live route uses
// (postFlowCreation + putFlow), so a message pair
// exists at this flow's document.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const ctx = inPageContext(
        db, await organizationToken(),
    );
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name: 'Test flow',
    });
    await putFlow(ctx, flowId, {
        name: 'Test flow',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    });
}

async function setupOneWorkOrder(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
    woId: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
    );
    const ctx = inPageContext(
        db, await organizationToken(),
    );
    await seedFlow(
        db, 'ZOousbbnzpqlxJExVAruYQ',
        buildLinearGraph(),
    );
    const woId = generateIdentifier();
    await createWorkOrderFromFlow(ctx, {
        workOrderId: woId,
        flowLinkId: generateIdentifier(),
        flowId: 'ZOousbbnzpqlxJExVAruYQ',
    });
    return { db, ctx, woId };
}

Deno.test(
    'available onto claimed-by-me Active is claim',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed', 'claimed',
            ),
            'claim',
        );
    },
);

Deno.test(
    'claimed-by-me onto available is release',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available', 'claimed',
            ),
            'release',
        );
    },
);

Deno.test(
    'claimed-by-me onto claimed-by-me is reorder',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'claimed', 'claimed',
            ),
            'reorder',
        );
    },
);

Deno.test(
    'available onto available is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop onto Archived by Me is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop while Archived by Me is selected'
    + ' is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'a drop outside both cards is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'outside', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    '#archived selects archived-by-me',
    () => {
        assertStrictEquals(
            inboxListKindFromHash('#archived'),
            'archivedByMe',
        );
    },
);

Deno.test(
    'empty and #active select claimed-by-me Active',
    () => {
        assertStrictEquals(
            inboxListKindFromHash(''),
            'claimed',
        );
        assertStrictEquals(
            inboxListKindFromHash('#active'),
            'claimed',
        );
    },
);

Deno.test(
    'transfer claim then positions among claimed'
    + ' rows',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const released = await deleteWorkOrderClaim(
            ctx, held,
        );
        const moved = await transferInboxDrop(
            ctx, released, {
                kind: 'claim',
                position: 3,
            },
        );
        assert(isClaimedAndUnlapsed(moved.claim));
        assertStrictEquals(
            moved.claim.memberId,
            'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(moved.position, 3);
    },
);

Deno.test(
    'transfer release clears this member\'s'
    + ' live claim',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const released = await transferInboxDrop(
            ctx, held, { kind: 'release' },
        );
        assertEquals(
            isClaimedAndUnlapsed(released.claim),
            false,
        );
    },
);

Deno.test(
    'transfer reorder writes position only',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const moved = await transferInboxDrop(
            ctx, held, {
                kind: 'reorder',
                position: 9,
            },
        );
        assert(isClaimedAndUnlapsed(moved.claim));
        assertStrictEquals(moved.position, 9);
    },
);

Deno.test(
    'transfer none returns the held work order',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const out = await transferInboxDrop(
            ctx, held, { kind: 'none' },
        );
        assertStrictEquals(out, held);
    },
);
