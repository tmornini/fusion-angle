import type {
    FlowEntity,
    FlowWithGraph,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
    storedGraph,
} from '../../../api/types.ts';
import type {
    FlowGraphDelta,
    FlowNodeRowBody,
    FlowEdgeRowBody,
    GraphDeletion,
    FlowNodeMemberRowBody,
    FlowNodeAttributeRowBody,
    GraphRevival,
} from '../../../api/validators.ts';
import {
    asStoredGraph,
} from '../../../api/validators.ts';
export type {
    FlowGraphDelta,
    FlowNodeRowBody,
    FlowEdgeRowBody,
    GraphDeletion,
    FlowNodeMemberRowBody,
    FlowNodeAttributeRowBody,
    GraphRevival,
};
import {
    buildStartAndCompleteNodes,
} from './flow-defaults.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../../../api/api.ts';
import type {
    RequestContext,
} from './shared.ts';
import { jitteredBackoff } from './shared.ts';

const flowChanges =
    createSubscriptionChannel();

export function subscribeFlowChanges(
    fn: () => void,
): () => void {
    return flowChanges.subscribe(fn);
}

export function notifyFlowChange(): void {
    flowChanges.notify();
}

export interface FlowCreationInput {
    flowId: string;
    linkId: string;
    projectId: string;
    name: string;
}

export async function postFlowCreation(
    ctx: RequestContext,
    input: FlowCreationInput,
): Promise<void> {
    const now = nowUtc();
    const { start, complete } =
        buildStartAndCompleteNodes();
    const graph: StoredGraph = {
        nodes: [start, complete],
        edges: [],
    };
    const graphDelta = buildSaveEvents(
        { nodes: [], edges: [] },
        graph,
        input.flowId,
        generateCryptoSafeBase62,
        now,
    );

    await ctx.POST('flows', {
        id: input.flowId,
        flow: {
            name: input.name,
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
        projectFlowId: input.linkId,
        projectFlow: {
            project_id: input.projectId,
            flow_id: input.flowId,
            at: now,
        },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
        initialStateAt: nowUtc(),
        graphDelta,
    });

    flowChanges.notify();
}

export interface FlowSaveShape {
    name: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// The flow row body the named save/undo/redo POSTs carry —
// the FlowSaveShape projected onto the storage columns, minus
// the org column (the org-scoped flows store stamps it from the
// verified token and re-validates the rest). The graph is NOT a
// column — it lands in the relation tables via the graph delta,
// so the body carries only the flow's scalar fields. camelCase
// enters, snake_case exits — this builder is the divorce point.
export function buildFlowBody(
    save: FlowSaveShape,
): Record<string, unknown> {
    const entity: Omit<
        FlowEntity, 'id' | 'organization_id'
    > = {
        name: save.name,
        is_locked: save.isLocked,
        is_auto_layout: save.isAutoLayout,
        is_auto_fit: save.isAutoFit,
        lock_timeout: save.lockTimeout,
    };
    return entity as unknown as Record<string, unknown>;
}

// Pure diff: working vs baseline StoredGraph → FlowGraphDelta.
// Every working node emits an upsert row (idempotent overwrite).
// Every working edge emits an upsert row.
// Every id in baseline but absent in working emits a deletion.
// Per node: member diff by member_id; attribute diff by
// attributeId — added/removed per presence; changed mode or
// is_required → a NEW 'added' row (latest-wins semantics,
// never an update). Unchanged attributes emit NO event.
// The caller passes `generateCryptoSafeBase62` as `mint` and
// a single `nowUtc()` as `at` (one moment for the whole save).
export function buildSaveEvents(
    baseline: StoredGraph,
    working: StoredGraph,
    flowId: string,
    mint: () => string,
    at: string,
): FlowGraphDelta {
    // Build lookup sets for working ids (used in deletions)
    const workingNodeIds = new Set(
        working.nodes.map(n => n.id),
    );
    const workingEdgeIds = new Set(
        working.edges.map(e => e.id),
    );

    // Node upserts — always every working node
    const nodes: FlowNodeRowBody[] =
        working.nodes.map(node => ({
            id: node.id,
            flow_id: flowId,
            name: node.name,
            position_x: node.positionX,
            position_y: node.positionY,
            is_create: node.isCreate,
            is_archive: node.isArchive,
            task_instructions: node.taskInstructions,
            at,
        }));

    // Edge upserts — always every working edge
    const edges: FlowEdgeRowBody[] =
        working.edges.map(edge => ({
            id: edge.id,
            flow_id: flowId,
            name: edge.name,
            from_node_id: edge.fromNodeId,
            to_node_id: edge.toNodeId,
            at,
        }));

    // Deletions — baseline ids absent in working
    const deletions: GraphDeletion[] = [];
    for (const node of baseline.nodes) {
        if (!workingNodeIds.has(node.id)) {
            deletions.push({
                eventId: mint(),
                entityId: node.id,
                at,
            });
        }
    }
    for (const edge of baseline.edges) {
        if (!workingEdgeIds.has(edge.id)) {
            deletions.push({
                eventId: mint(),
                entityId: edge.id,
                at,
            });
        }
    }

    // Member events — per node diff
    const memberEvents: FlowNodeMemberRowBody[] = [];
    const baseNodeMap = new Map(
        baseline.nodes.map(n => [n.id, n]),
    );
    for (const node of working.nodes) {
        const base = baseNodeMap.get(node.id);
        const baseIds = new Set(
            base ? base.memberIds : [],
        );
        const workIds = new Set(node.memberIds);
        for (const mid of workIds) {
            if (!baseIds.has(mid)) {
                memberEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    member_id: mid,
                    action: 'added',
                    at,
                });
            }
        }
        for (const mid of baseIds) {
            if (!workIds.has(mid)) {
                memberEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    member_id: mid,
                    action: 'removed',
                    at,
                });
            }
        }
    }

    // Attribute events — per node diff by attributeId
    const attributeEvents:
        FlowNodeAttributeRowBody[] = [];
    for (const node of working.nodes) {
        const base = baseNodeMap.get(node.id);
        const baseAttrMap = new Map(
            (base ? base.attributes : []).map(
                a => [a.attributeId, a],
            ),
        );
        const workAttrMap = new Map(
            node.attributes.map(
                a => [a.attributeId, a],
            ),
        );
        // Added or changed
        for (const [aid, wa] of workAttrMap) {
            const ba = baseAttrMap.get(aid);
            if (ba === undefined) {
                // New attribute
                attributeEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    attribute_id: aid,
                    mode: wa.mode,
                    is_required: wa.isRequired,
                    action: 'added',
                    at,
                });
            } else if (
                wa.mode !== ba.mode
                || wa.isRequired !== ba.isRequired
            ) {
                // Changed — emit a new 'added' row
                // (latest-wins semantics)
                attributeEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    attribute_id: aid,
                    mode: wa.mode,
                    is_required: wa.isRequired,
                    action: 'added',
                    at,
                });
            }
            // Unchanged → no event
        }
        // Removed
        for (const [aid, ba] of baseAttrMap) {
            if (!workAttrMap.has(aid)) {
                attributeEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    attribute_id: aid,
                    mode: ba.mode,
                    is_required: ba.isRequired,
                    action: 'removed',
                    at,
                });
            }
        }
    }

    return {
        nodes, edges, deletions,
        memberEvents, attributeEvents,
    };
}

// Compute the revival set for a redo-style save: every node/edge
// id present in the TARGET graph but absent from the CURRENT
// graph is a tombstoned id the target re-introduces. In redo,
// such an id is always previously-deleted, so revive it
// unconditionally — a 'restored' event on an already-live entity
// is harmless. `at` is the one moment of the computation.
// Exported: buildFlowPutBody (below) is the ONLY caller,
// recomputing this fresh against EACH retry attempt's own
// baseline — the one caller performRedo's revivalTarget flows
// through. Undo-as-replay (Phase 14 Task 8) computes ITS OWN
// revivals server-side (api/flow-graph-diff.ts's
// buildFlowGraphRevivals, the same diff semantics ported to
// api/routes.ts's undo route) — performUndo/postFlowUndo
// (flow-operations.ts) never call this function at all; the
// client no longer knows the restore target well enough to.
export function buildRevivals(
    current: StoredGraph,
    target: StoredGraph,
    at: string,
): GraphRevival[] {
    const currentIds = new Set<string>([
        ...current.nodes.map(n => n.id),
        ...current.edges.map(e => e.id),
    ]);
    const revivals: GraphRevival[] = [];
    for (const node of target.nodes) {
        if (!currentIds.has(node.id)) {
            revivals.push({
                eventId: generateCryptoSafeBase62(),
                entityId: node.id,
                at,
            });
        }
    }
    for (const edge of target.edges) {
        if (!currentIds.has(edge.id)) {
            revivals.push({
                eventId: generateCryptoSafeBase62(),
                entityId: edge.id,
                at,
            });
        }
    }
    return revivals;
}

// Assemble the PUT /flows/:id document body for a save: the
// flow row's own fields, a fresh 'updated' trio, the client-
// authored post-save graph snapshot (the exact wire form GET
// /flows/:id emits — byte-identical types, no transform), the
// graph delta diffed against the CURRENT stored graph, and the
// revivals diffed against that SAME fresh baseline (empty for
// every ordinary edit; performRedo is the one caller that
// supplies a revivalTarget — see putFlow below). ONE GET
// (ctx.GETWithResponseId, never getFlowGraph — that helper also
// applies withRenderableLayout, a presentation concern, and
// hides the Response-ID header this builder also needs) serves
// BOTH the baseline diff source AND the echo to carry as
// If-Response-ID — calling getFlowGraph plus a separate header
// read would silently add a hop to every save path. Not
// exported: putFlow (below) is the ONLY caller since the C6
// retry loop owns rebuilding a fresh body per attempt —
// including the revivals: everything derived from the mutable
// baseline (the delta AND the revivals) recomputes per attempt;
// only the caller's INTENT (revivalTarget, the graph itself)
// stays stable across retries.
async function buildFlowPutBody(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
    revivalTarget: StoredGraph | undefined,
): Promise<{
    body: Record<string, unknown>;
    ifResponseId: string | undefined;
}> {
    const now = nowUtc();
    const { body: current, responseId } =
        await ctx.GETWithResponseId<FlowWithGraph>(
            'flows/' + id,
        );
    const baseline = asStoredGraph(
        current.graph, 'flow.graph',
    );
    const delta = buildSaveEvents(
        baseline,
        { nodes: save.nodes, edges: save.edges },
        id,
        generateCryptoSafeBase62,
        now,
    );
    const revivals = revivalTarget
        ? buildRevivals(baseline, revivalTarget, now)
        : [];
    return {
        body: {
            ...buildFlowBody(save),
            state: 'updated',
            state_at: now,
            state_event_id: generateCryptoSafeBase62(),
            graph: storedGraph({
                nodes: save.nodes,
                edges: save.edges,
            }),
            graphDelta: delta,
            revivals,
        },
        ifResponseId: responseId,
    };
}

// The C6 retry loop's attempt cap — three attempts, never
// infinite (Commandment: retries only where the error is
// transient, capped).
const MAX_PUT_ATTEMPTS = 3;

// Per-flowId save serialization (Phase 14 Task 8 fast-follow).
// Presenter gestures and flow-operations commitFlowMutation
// both enqueue here so concurrent puts targeting the same
// baseline cannot race. Keyed by flowId so DIFFERENT flows
// never head-of-line block each other. Module-scope Map is a
// demo-tier concession (single-flow-per-tab); not
// correctness-load-bearing for multi-tab (putFlow's 412
// retry still absorbs cross-tab contention).
const saveChains = new Map<string, Promise<void>>();

// Run `work` after any prior save for this flowId settles.
// Returns THIS work's own promise (rejects on work failure).
// The stored chain tail always settles so a later enqueue
// still runs after a prior failure.
export function enqueueFlowSave(
    flowId: string,
    work: () => Promise<void>,
): Promise<void> {
    const previous =
        saveChains.get(flowId) ?? Promise.resolve();
    const gated = previous.then(
        () => undefined,
        () => undefined,
    );
    const thisWork = gated.then(work);
    saveChains.set(
        flowId,
        thisWork.then(
            () => undefined,
            () => undefined,
        ),
    );
    return thisWork;
}

// Save a flow: the flow row PUT, its 'updated' state event, and
// the graph delta — written atomically through the locked-class
// PUT /flows/:id. The client echoes the baseline it just read
// (buildFlowPutBody's ifResponseId) as If-Response-ID; a save
// racing another writer's save finds the head has moved and
// 412s. This loop ABSORBS that 412: on attempt < 3 it backs off
// (jitteredBackoff) and REBUILDS the body — buildFlowPutBody
// re-fetches the baseline and re-diffs, so the rebuild IS the
// re-apply — then resubmits with the FRESH echo. E6 split: each
// 412 attempt is a NEW write (fresh baseline, fresh delta, fresh
// trio, fresh revivals) — a network-level resend of ONE attempt
// is still byte-identical and replays via the gate's own fast
// path. Any other error, or the third 412, propagates — the
// caller (the designer's #persistFlow, routed through
// reportFault, or performRedo's own catch) is the only place a
// save failure surfaces. The flow-change notification fires
// EXACTLY ONCE, on this loop's OWN success return — never per
// attempt, never in a finally — so a mid-retry 412 never
// triggers a wasted cross-tab re-render.
// `revivalTarget` names the CALLER's intent — the graph a
// revival-bearing op (redo; undo's own retry, a later task)
// wants restored — never a precomputed revivals list: a
// concurrent save landing between attempts can tombstone a node
// the target carries, so a list captured once would replay
// STALE revivals against a delta that is, by construction,
// always rebuilt fresh. buildFlowPutBody derives the actual
// revivals from `revivalTarget` fresh on EVERY attempt, against
// that attempt's own baseline — exactly like the delta. Every
// ordinary edit omits revivalTarget and gets an empty revivals
// list, unchanged from today.
export async function putFlow(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
    revivalTarget?: StoredGraph,
): Promise<void> {
    for (
        let attempt = 1;
        attempt <= MAX_PUT_ATTEMPTS;
        attempt++
    ) {
        const { body, ifResponseId } =
            await buildFlowPutBody(
                ctx, id, save, revivalTarget,
            );
        try {
            await ctx.PUT(
                `flows/${id}`,
                body,
                ifResponseId === undefined
                    ? undefined
                    : [['if-response-id', ifResponseId]],
            );
            flowChanges.notify();
            return;
        } catch (err) {
            if (
                err instanceof RequestError
                && err.status === HTTP_PRECONDITION_FAILED
                && attempt < MAX_PUT_ATTEMPTS
            ) {
                await jitteredBackoff(attempt);
                continue;
            }
            throw err;
        }
    }
}
