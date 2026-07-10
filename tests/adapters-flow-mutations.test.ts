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

// flows/:id is locked-class (Task 3): a raw ctx.PUT that hand-
// crafts its wire body (rather than riding putFlow's own C6
// retry loop) must echo the current head itself, or a
// non-genesis save 412s. Read once via GETWithResponseId and
// thread the echo through PUT's headerFields.
function ifResponseIdHeaders(
    responseId: string | undefined,
): readonly (readonly [string, string])[] | undefined {
    return responseId === undefined
        ? undefined
        : [['if-response-id', responseId]];
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

test(
    'postFlowCreation creates flow plus link',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const flow = await ctx.GET<FlowWithGraph>(
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
                'projects/project-1/flows',
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
        const flow = await ctx.GET<FlowWithGraph>(
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
        const flow = await ctx.GET<FlowWithGraph>(
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
        const flow = await ctx.GET<FlowWithGraph>(
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

// publishing-a-version-then-saving RETIRED (Phase 15 Task 7)
// with the versions routes.

test(
    'PUT flows/:id replays identically as one updated event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const { responseId } =
            await ctx.GETWithResponseId<FlowWithGraph>(
                'flows/flow-1',
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
            state_event_id: 'fixed-ev',
            graph: JSON.stringify({ nodes: [], edges: [] }),
            graphDelta: EMPTY_GRAPH_DELTA,
            revivals: [],
        };
        const headers = ifResponseIdHeaders(responseId);
        await ctx.PUT('flows/flow-1', body, headers);
        await ctx.PUT('flows/flow-1', body, headers);
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/flow-1/history',
        );
        assert.equal(events.length, 2);
    },
);

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): the old body
// carried a client-computed `flow`/`graph`/`graphDelta`/
// `revivals` and a `consumedVersionId` to delete — all retired.
// Undo now resolves its own restore target from the flows/:id
// document-pair history (api/derive-flows.ts's
// resolveFlowUndoTarget), so the setup needs a genuine PRIOR
// SAVE to restore to (a flow_versions row is no longer read at
// all) and the POST body shrinks to the state trio's two free
// fields.
test(
    'POST flows/:id/undo posts the updated event'
    + ' at the caller time',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        await putFlow(ctx, 'flow-1', {
            name: 'edited',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [],
            edges: [],
        });
        await ctx.POST('flows/flow-1/undo', {
            eventId: 'undo-ev',
            at: '2099-01-02T00:00:00.000000Z',
        });
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/flow-1/history',
        );
        assert.equal(
            events.at(-1)!.at,
            '2099-01-02T00:00:00.000000Z',
        );
    },
);

test(
    'redo document-PUT posts the updated event at the'
    + ' caller time',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        // versions POST RETIRED (Phase 15 Task 7); redo is
        // client-side document PUT only (performRedo).
        const { responseId } =
            await ctx.GETWithResponseId<FlowWithGraph>(
                'flows/flow-1',
            );
        await ctx.PUT(
            'flows/flow-1',
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
                state_event_id: 'redo-ev',
                graph: JSON.stringify({ nodes: [], edges: [] }),
                graphDelta: EMPTY_GRAPH_DELTA,
                revivals: [],
            },
            ifResponseIdHeaders(responseId),
        );
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/flow-1/history',
        );
        assert.equal(
            events.at(-1)!.at,
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
test(
    'putFlow C6 retry recomputes revivals per attempt:'
    + ' a node tombstoned mid-retry is restored, not'
    + ' left invisible by a stale (once-computed)'
    + ' revivals list',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const flow0 = await ctx.GET<FlowWithGraph>(
            'flows/flow-1',
        );
        const baseline0 =
            JSON.parse(flow0.graph) as StoredGraph;
        const start = baseline0.nodes.find(
            n => n.isCreate,
        )!;
        const complete = baseline0.nodes.find(
            n => n.isArchive,
        )!;
        const mid = buildNode('mid');

        // 'mid' starts alive — an ordinary edit, no race yet.
        await putFlow(ctx, 'flow-1', {
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
                if (path === 'flows/flow-1') {
                    putCalls += 1;
                    if (putCalls === 1) {
                        await putFlow(ctx, 'flow-1', {
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
            'flow-1',
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

        assert.equal(
            putCalls, 2,
            'exactly one 412 retry happened',
        );
        assert.ok(
            secondBody, 'the retry attempt PUT a body',
        );
        const revivals = (
            secondBody as Record<string, unknown>
        ).revivals as { entityId: string }[];
        assert.ok(
            revivals.some(r => r.entityId === 'mid'),
            'the recomputed retry restores the node the'
            + ' race just tombstoned — a revivals list'
            + ' captured once (before the race) would'
            + ' still be empty here',
        );

        // Behavioral confirmation: 'mid' is visible again.
        const flow = await ctx.GET<FlowWithGraph>(
            'flows/flow-1',
        );
        const graph =
            JSON.parse(flow.graph) as StoredGraph;
        assert.ok(
            graph.nodes.some(n => n.id === 'mid'),
            'mid reappears once its restore rides the'
            + ' retry that actually lands',
        );
    },
);
