import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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
    postFlowCreation,
    putFlow,
    buildFlowBody,
} from
'../web-app/app/adapters/flow-mutations.ts';
import type {
    FlowWithGraph,
    GraphNode,
    GraphEdge,
    StateEntity,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
    const ctx = createRequestContext(db, await organizationToken());
    return { db, ctx };
}

// The four-relation delta a no-graph-change PUT carries: the
// direct ctx.PUT tests below craft the wire body by hand, so
// they supply the empty delta that putFlow would have diffed.
const EMPTY_GRAPH_DELTA = {
    nodes: [],
    edges: [],
    deletions: [],
    memberEvents: [],
    attributeEvents: [],
};

// organizations/:id/flows/:id is locked-class (Task 3): a raw ctx.PUT that
// hand-
// crafts its wire body (rather than riding putFlow's own C6
// retry loop) must echo the current head itself, or a
// non-genesis save 428s. Read once via GETWithEtag and
// thread the echo through PUT's headerFields.
function ifMatchHeaders(
    etag: string | undefined,
): readonly (readonly [string, string])[] | undefined {
    return etag === undefined
        ? undefined
        : [['if-match', '"' + etag + '"']];
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
    projectId = generateIdentifier(),
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId,
        name: 'Test Flow',
    });
}

Deno.test(
    'postFlowCreation creates flow plus link',
    async () => {
        const { ctx } = await setupMemDb();
        const projectId = generateIdentifier();
        await createBaseFlow(
            ctx, 'aEsGMmBEFaVdWihhHXwCbw', projectId,
        );
        const flow = await ctx.GET<FlowWithGraph>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        assertStrictEquals(flow.id, 'aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(flow.name, 'Test Flow');
        assertStrictEquals(
            flow.lock_timeout,
            DEFAULT_LOCK_TIMEOUT,
        );
        const links =
            await ctx.GET<{
                id: string;
                project_id: string;
                flow_id: string;
            }[]>(
                'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + projectId + '/flows/',
            );
        const link = links.find(
            l => l.flow_id === 'aEsGMmBEFaVdWihhHXwCbw',
        );
        assert(link);
        assertStrictEquals(
            link.project_id, projectId,
        );
    },
);

Deno.test(
    'postFlowCreation emits an active state event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        const events =
            await ctx.GET<StateEntity[]>(
                'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'aEsGMmBEFaVdWihhHXwCbw/versions/',
            );
        assertStrictEquals(events.length, 1);
        const ev = events[0]!;
        assertStrictEquals(ev.entity_id, 'aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(ev.state, 'active');
    },
);

Deno.test(
    'putFlow emits an updated state event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
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
                'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'aEsGMmBEFaVdWihhHXwCbw/versions/',
            );
        assertStrictEquals(events.length, 2);
        // Family history is DESC — current first.
        const states = events.map(e => e.state);
        assertEquals(
            states, ['updated', 'active'],
        );
    },
);

Deno.test(
    'putFlow persists every FlowSaveShape field',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        const startId = generateIdentifier();
        const endId = generateIdentifier();
        const midId = generateIdentifier();
        const edgeId = generateIdentifier();
        const start = buildNode(startId, {
            isCreate: true,
        });
        const complete = buildNode(endId, {
            isArchive: true,
        });
        const middle = buildNode(midId);
        const edge = buildEdge(
            edgeId, startId, midId,
        );
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'Renamed',
            isLocked: true,
            isAutoLayout: true,
            isAutoFit: true,
            lockTimeout: 600,
            nodes: [start, middle, complete],
            edges: [edge],
        });
        const flow = await ctx.GET<FlowWithGraph>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        assertStrictEquals(flow.name, 'Renamed');
        assertStrictEquals(flow.is_locked, true);
        assertStrictEquals(flow.is_auto_layout, true);
        assertStrictEquals(flow.is_auto_fit, true);
        assertStrictEquals(flow.lock_timeout, 600);
        const graph =
            flow.graph as unknown as StoredGraph;
        assertStrictEquals(graph.nodes.length, 3);
        assertStrictEquals(graph.edges.length, 1);
        assertStrictEquals(
            graph.edges[0]!.id, edgeId,
        );
    },
);

Deno.test(
    'putFlow replaces graph fully'
    + ' (no bleed-through from prior writes)',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        const aId = generateIdentifier();
        const bId = generateIdentifier();
        const a = buildNode(aId);
        const b = buildNode(bId);
        const ab = buildEdge(
            generateIdentifier(), aId, bId,
        );
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'xDyDkxEPwtcNmJVknUHDsg',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [a, b],
            edges: [ab],
        });
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'v2',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [a],
            edges: [],
        });
        const flow = await ctx.GET<FlowWithGraph>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        const graph =
            flow.graph as unknown as StoredGraph;
        assertStrictEquals(graph.nodes.length, 1);
        assertStrictEquals(graph.nodes[0]!.id, aId);
        assertStrictEquals(graph.edges.length, 0);
    },
);

Deno.test(
    'putFlow last-write-wins'
    + ' across two starting-from-same callers',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        const aAdded = generateIdentifier();
        const bAdded = generateIdentifier();
        const baseNode = buildNode(generateIdentifier());
        const callerANodes = [
            baseNode, buildNode(aAdded),
        ];
        const callerBNodes = [
            baseNode, buildNode(bAdded),
        ];
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'caller-A',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: callerANodes,
            edges: [],
        });
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'caller-B',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: callerBNodes,
            edges: [],
        });
        const flow = await ctx.GET<FlowWithGraph>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        assertStrictEquals(flow.name, 'caller-B');
        const graph =
            flow.graph as unknown as StoredGraph;
        assertStrictEquals(graph.nodes.length, 2);
        assert(
            graph.nodes.some(
                n => n.id === bAdded,
            ),
        );
        assert(
            !graph.nodes.some(
                n => n.id === aAdded,
            ),
        );
    },
);

// publishing-a-version-then-saving RETIRED (Phase 15 Task 7)
// with the versions routes.

Deno.test(
    'PUT organizations/:id/flows/:id replays identically'
    + ' as one updated event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        const { etag } =
            await ctx.GETWithEtag<FlowWithGraph>(
                'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'aEsGMmBEFaVdWihhHXwCbw',
            );
        const body = {
            ...buildFlowBody({
                name: 'Replayed',
                isLocked: false,
                isAutoLayout: false,
                isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [],
                edges: [],
            }),
            state: 'updated',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: generateIdentifier(),
            graph: { nodes: [], edges: [] },
            graphDelta: EMPTY_GRAPH_DELTA,
            revivals: [],
        };
        const headers = ifMatchHeaders(etag);
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aEsGMmBEFaVdWihhHXwCbw', body, headers);
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aEsGMmBEFaVdWihhHXwCbw', body, headers);
        const events = await ctx.GET<StateEntity[]>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/versions/',
        );
        assertStrictEquals(events.length, 2);
    },
);

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): the old body
// carried a client-computed `flow`/`graph`/`graphDelta`/
// `revivals` and a `consumedVersionId` to delete — all retired.
// Undo now resolves its own restore target from the
// organizations/:id/flows/:id
// document-pair history (api/derive-flows.ts's
// resolveFlowUndoTarget), so the setup needs a genuine PRIOR
// SAVE to restore to (a flow_versions row is no longer read at
// all) and the POST body shrinks to the state trio's two free
// fields.
Deno.test(
    'POST organizations/:id/flows/:id/undo posts the updated event'
    + ' at the caller time',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'edited',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [],
            edges: [],
        });
        const undoHead = await ctx.GETWithEtag<unknown>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        await ctx.POSTWithHeaders(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/undo',
            {
                eventId: generateIdentifier(),
                at: '2099-01-02T00:00:00.000000Z',
            },
            undoHead.etag === undefined
                ? []
                : [['if-match', '"' + undoHead.etag + '"']],
        );
        const events = await ctx.GET<StateEntity[]>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/versions/',
        );
        // Family history is DESC — index 0 is current.
        assertStrictEquals(
            events[0]!.at,
            '2099-01-02T00:00:00.000000Z',
        );
    },
);

Deno.test(
    'redo document-PUT posts the updated event at the'
    + ' caller time',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        // versions POST RETIRED (Phase 15 Task 7); redo is
        // client-side document PUT only (performRedo).
        const { etag } =
            await ctx.GETWithEtag<FlowWithGraph>(
                'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'aEsGMmBEFaVdWihhHXwCbw',
            );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
            {
                ...buildFlowBody({
                    name: 'redone',
                    isLocked: false,
                    isAutoLayout: false,
                    isAutoFit: false,
                    lockTimeout: DEFAULT_LOCK_TIMEOUT,
                    nodes: [],
                    edges: [],
                }),
                state: 'updated',
                state_at: '2099-01-03T00:00:00.000000Z',
                state_event_id: generateIdentifier(),
                graph: { nodes: [], edges: [] },
                graphDelta: EMPTY_GRAPH_DELTA,
                revivals: [],
            },
            ifMatchHeaders(etag),
        );
        const events = await ctx.GET<StateEntity[]>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/versions/',
        );
        // Family history is DESC — index 0 is current.
        assertStrictEquals(
            events[0]!.at,
            '2099-01-03T00:00:00.000000Z',
        );
    },
);

// Fix wave 1 (Task 4 review, Critical): putFlow's C6 retry loop
// rebuilds the graph delta fresh per attempt, but a prior bug
// carried the CALLER's revivals list through unchanged across
// every attempt. Between one attempt's 412 and the next, a
// concurrent save can tombstone a node the revival target still
// carries — the fresh delta re-upserts that node's ROW, but a
// stale revivals list lacks the 'restored' EVENT needed to clear
// the tombstone (append-only states: only 'restored' clears it),
// so the node stays invisible forever even though the retry
// "succeeded". The fix: putFlow takes a revivalTarget (the
// target GRAPH, not a precomputed list) and buildFlowPutBody
// derives the actual revivals fresh, every attempt, against that
// attempt's OWN freshly-fetched baseline — exactly like the
// delta already does. This test simulates the race for real (no
// fabricated error): a concurrent putFlow (on the raw ctx) drops
// 'mid' between this putFlow's attempt-1 read and its attempt-1
// write, which genuinely 412s via the real gate since the head
// has moved. The retry's SECOND attempt must recompute — not
// replay — the revivals.
Deno.test(
    'putFlow C6 retry recomputes revivals per attempt:'
    + ' a node tombstoned mid-retry is restored, not'
    + ' left invisible by a stale (once-computed)'
    + ' revivals list',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw');
        const flow0 = await ctx.GET<FlowWithGraph>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        const baseline0 =
            flow0.graph as unknown as StoredGraph;
        const start = baseline0.nodes.find(
            n => n.isCreate,
        )!;
        const complete = baseline0.nodes.find(
            n => n.isArchive,
        )!;
        const midId = generateIdentifier();
        const mid = buildNode(midId);

        // 'mid' starts alive — an ordinary edit, no race yet.
        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
            name: 'Test Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [start, complete, mid],
            edges: [],
        });

        let putCalls = 0;
        let secondBody: Record<string, unknown> | null = null;
        // A concurrent editor's save lands between the tracked
        // putFlow's attempt-1 read and its attempt-1 write: it
        // drops 'mid' (tombstoning it) and moves the head, via
        // the SAME real putFlow path any other caller rides —
        // so attempt 1's now-stale echo genuinely 412s through
        // the real gate.
        const racingCtx: RequestContext = {
            ...ctx,
            PUT: async <T,>(
                path: string,
                body: Record<string, unknown>,
                headerFields?:
                    readonly (readonly [string, string])[],
            ): Promise<T> => {
                if (path === 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'aEsGMmBEFaVdWihhHXwCbw') {
                    putCalls += 1;
                    if (putCalls === 1) {
                        await putFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw', {
                            name: 'Test Flow',
                            isLocked: false,
                            isAutoLayout: false,
                            isAutoFit: false,
                            lockTimeout:
                                DEFAULT_LOCK_TIMEOUT,
                            nodes: [start, complete],
                            edges: [],
                        });
                    } else {
                        secondBody = body;
                    }
                }
                return ctx.PUT<T>(path, body, headerFields);
            },
        };

        await putFlow(
            racingCtx,
            'aEsGMmBEFaVdWihhHXwCbw',
            {
                name: 'Test Flow',
                isLocked: false,
                isAutoLayout: false,
                isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [start, complete, mid],
                edges: [],
            },
            { nodes: [start, complete, mid], edges: [] },
        );

        assertStrictEquals(
            putCalls, 2,
            'exactly one 412 retry happened',
        );
        assert(
            secondBody, 'the retry attempt PUT a body',
        );
        const revivals = (
            secondBody as Record<string, unknown>
        ).revivals as { entityId: string }[];
        assert(
            revivals.some(r => r.entityId === midId),
            'the recomputed retry restores the node the'
            + ' race just tombstoned — a revivals list'
            + ' captured once (before the race) would'
            + ' still be empty here',
        );

        // Behavioral confirmation: 'mid' is visible again.
        const flow = await ctx.GET<FlowWithGraph>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw',
        );
        const graph =
            flow.graph as unknown as StoredGraph;
        assert(
            graph.nodes.some(n => n.id === midId),
            'mid reappears once its restore rides the'
            + ' retry that actually lands',
        );
    },
);
