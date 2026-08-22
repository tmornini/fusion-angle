import type {
    StoredGraph,
} from './types.ts';
import type {
    FlowGraphDelta,
    FlowNodeRowBody,
    FlowEdgeRowBody,
    GraphDeletion,
    FlowNodeMemberRowBody,
    FlowNodeAttributeRowBody,
    GraphRevival,
} from './validators.ts';

// The undo route's OWN diff — a server-side port of
// web-app/app/adapters/flow-mutations.ts's buildSaveEvents/
// buildRevivals, byte-identical in semantics. `api/` cannot
// import from `web-app/` (backwards layering — a server module
// depending on client code) and `shared/` cannot import from
// `api/` either (AGENTS.md: the dependency is one-way), so
// hoisting these two pure functions into `shared/` would force
// moving FlowGraphDelta/GraphRevival/etc. off api/validators.ts
// too — a far larger refactor than Task 8's Step 0 authorizes.
// Two instances (the client's own save path, this undo path) is
// below the rule-of-three; duplicating a pure function here is
// sanctioned, not a shortcut (Article: never generalize before
// exploratory duplication).
//
// Undo-as-replay (Phase 14 Task 8): restore-target resolution
// moved server-side (documentPairsAt walk, api/derive-flows.ts),
// so the SERVER — not the client — now holds both the CURRENT
// graph and the TARGET graph at diff time; these two functions
// are what it uses to keep feeding the SAME graphDelta/revivals
// sidecars deriveFlowGraphStates already depends on
// (SIDECAR-KEEP — the mechanism persists; see the PINNED Step 0
// block in .superpowers/sdd/phase14-task-8-report.md for the
// full rationale on why "client-owned" could not be read
// literally here).

// Pure diff: baseline vs working StoredGraph → FlowGraphDelta.
// Every working node/edge emits an upsert row (idempotent
// overwrite); every baseline id absent from working emits a
// deletion; member/attribute events are the per-node ADD/REMOVE
// diff (latest-wins on a changed mode/is_required — a NEW
// 'added' row, never an update). The caller passes `mint` (id
// generator) and a single `at` for the WHOLE computation — one
// moment for every sub-event this diff produces.
export function buildFlowGraphDelta(
    baseline: StoredGraph,
    working: StoredGraph,
    flowId: string,
    mint: () => string,
    at: string,
): FlowGraphDelta {
    const workingNodeIds = new Set(
        working.nodes.map(n => n.id),
    );
    const workingEdgeIds = new Set(
        working.edges.map(e => e.id),
    );

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

    const edges: FlowEdgeRowBody[] =
        working.edges.map(edge => ({
            id: edge.id,
            flow_id: flowId,
            name: edge.name,
            from_node_id: edge.fromNodeId,
            to_node_id: edge.toNodeId,
            at,
        }));

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
        for (const [aid, wa] of workAttrMap) {
            const ba = baseAttrMap.get(aid);
            if (ba === undefined) {
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
        }
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

// Every node/edge id present in TARGET but absent from CURRENT
// is a tombstoned id the target re-introduces — revive it
// unconditionally (a 'restored' event on an already-live entity
// is harmless). `at` is the one moment of the computation —
// the SAME value buildFlowGraphDelta above receives.
export function buildFlowGraphRevivals(
    current: StoredGraph,
    target: StoredGraph,
    mint: () => string,
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
                eventId: mint(),
                entityId: node.id,
                at,
            });
        }
    }
    for (const edge of target.edges) {
        if (!currentIds.has(edge.id)) {
            revivals.push({
                eventId: mint(),
                entityId: edge.id,
                at,
            });
        }
    }
    return revivals;
}
