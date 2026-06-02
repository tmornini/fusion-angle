import type {
    GraphEdge,
    GraphNode,
    Id,
    WorkOrderEntity,
} from '../../api/types.ts';
import {
    MS_PER_DAY,
    MS_PER_SECOND,
} from '../../api/types.ts';
import type { TransitionEvent }
    from './adapters/state-events.ts';
import { shouldShowWorkerHazard } from './flow-graph.ts';
import type { WorkerHazardLevel } from './flow-graph.ts';

export interface FlowStatsInput {
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly workOrders:
        readonly WorkOrderEntity[];
    readonly transitions:
        readonly TransitionEvent[];
    readonly nowMs: number;
    readonly windowDays: number;
    readonly workerNameById:
        ReadonlyMap<Id, string>;
}

export interface NodeStat {
    readonly id: string;
    readonly displayName: string;
    readonly isCreate: boolean;
    readonly isArchive: boolean;
    readonly positionX: number;
    readonly positionY: number;
    readonly outgoingEdgeIds: readonly string[];
    readonly heatPct: number;
    readonly heatT:   number;
    readonly avgSeconds: number | null;
    readonly medianSeconds: number | null;
    readonly p90Seconds: number | null;
    readonly visitsInWindow: number;
    readonly distinctWorkOrders: number;
    readonly currentlyHere: number;
    readonly throughputPerWeek: number;
    readonly revisitRatePct: number;
    readonly clanSize: number;
    readonly activeProducerCount: number;
    readonly topProducer: {
        readonly name: string;
        readonly vsClanAvgPct: number | null;
        readonly sharePct: number | null;
        readonly inCurrentClan: boolean;
    } | null;
    readonly assignmentLabel: string;
    readonly workerHazard: WorkerHazardLevel | null;
    readonly branchSplit: readonly {
        readonly edgeId: string;
        readonly label: string;
        readonly toNodeId: string;
        readonly pct: number;
    }[];
}

export interface FlowPath {
    readonly nodeIds: readonly string[];
    readonly edgeIds: readonly string[];
    readonly workOrderCount: number;
    readonly sharePct: number;
}

export type PathEntry =
    | { readonly kind: 'path';
        readonly path: FlowPath }
    | { readonly kind: 'rest';
        readonly count: number;
        readonly combinedSharePct: number };

export interface FlowStatsModel {
    readonly nodes: readonly NodeStat[];
    readonly edges: readonly GraphEdge[];
    readonly pathEntries: readonly PathEntry[];
    readonly completedWorkOrderCount: number;
    readonly incompleteWorkOrderCount: number;
    readonly windowDays: number;
    readonly droppedNodeIds:
        ReadonlySet<string>;
    readonly pathsWithDroppedStepsCount:
        number;
}

function emptyNodeStat(n: GraphNode): NodeStat {
    return {
        id: n.id,
        displayName: n.name,
        isCreate: n.isCreate,
        isArchive: n.isArchive,
        positionX: n.positionX,
        positionY: n.positionY,
        outgoingEdgeIds: [],
        heatPct: 0,
        heatT: 0,
        avgSeconds: null,
        medianSeconds: null,
        p90Seconds: null,
        visitsInWindow: 0,
        distinctWorkOrders: 0,
        currentlyHere: 0,
        throughputPerWeek: 0,
        revisitRatePct: 0,
        clanSize: 0,
        activeProducerCount: 0,
        topProducer: null,
        assignmentLabel: 'Unassigned',
        workerHazard: null,
        branchSplit: [],
    };
}

interface Sojourn {
    readonly nodeId: string;
    readonly enterMs: number;
    readonly exitMs: number;
    readonly workerId: string;
}

interface WoRun {
    readonly workOrderId: string;
    readonly sojourns: readonly Sojourn[];
    readonly pathNodeIds: readonly string[];
    readonly completed: boolean;
    readonly hadDroppedStep: boolean;
}

function reconstructRuns(
    input: FlowStatsInput,
    nodeById: ReadonlyMap<string, GraphNode>,
): {
    runs: readonly WoRun[];
    droppedNodeIds: ReadonlySet<string>;
} {
    const byWo =
        new Map<string, TransitionEvent[]>();
    for (const t of input.transitions) {
        const arr = byWo.get(t.work_order_id) ?? [];
        arr.push(t);
        byWo.set(t.work_order_id, arr);
    }
    const dropped = new Set<string>();
    const runs: WoRun[] = [];
    for (const [woId, ts] of byWo) {
        ts.sort((a, b) =>
            a.at.localeCompare(
                b.at,
            ),
        );
        const sojourns: Sojourn[] = [];
        const pathNodeIds: string[] = [];
        let completed = false;
        let hadDropped = false;
        for (let i = 0; i < ts.length; i++) {
            const t = ts[i]!;
            const node = nodeById.get(t.to_node_id);
            if (!node) {
                dropped.add(t.to_node_id);
                hadDropped = true;
                continue;
            }
            pathNodeIds.push(node.id);
            const enterMs =
                Date.parse(t.at);
            const nextT = ts[i + 1];
            // Open-ended sojourn uses nowMs as the
            // exit so in-flight WOs contribute heat.
            const exitMs = nextT
                ? Date.parse(nextT.at)
                : input.nowMs;
            if (!node.isCreate && !node.isArchive) {
                sojourns.push({
                    nodeId: node.id,
                    enterMs, exitMs,
                    workerId: t.worker_id,
                });
            }
            if (node.isArchive) completed = true;
        }
        runs.push({
            workOrderId: woId,
            sojourns,
            pathNodeIds,
            completed,
            hadDroppedStep: hadDropped,
        });
    }
    return { runs, droppedNodeIds: dropped };
}

// A node's clan IS its workerIds directly.
// The label lists the workers' display names,
// or "Unassigned" if the list is empty.
function resolveClan(
    n: GraphNode,
    input: FlowStatsInput,
): { ids: ReadonlySet<string>;
     label: string } {
    if (n.workerIds.length === 0) {
        return {
            ids: new Set(),
            label: 'Unassigned',
        };
    }
    const names = n.workerIds.map(id =>
        input.workerNameById.get(id) ?? id,
    );
    return {
        ids: new Set(n.workerIds),
        label: names.join(', '),
    };
}

export function buildFlowStats(
    input: FlowStatsInput,
): FlowStatsModel {
    const nodeById = new Map(
        input.nodes.map(n => [n.id, n]),
    );
    const winLo =
        input.nowMs - input.windowDays * MS_PER_DAY;
    const winHi = input.nowMs;
    const { runs, droppedNodeIds } =
        reconstructRuns(input, nodeById);

    const nodeSec = new Map<string, number>();
    let flowSec = 0;
    for (const run of runs) {
        for (const s of run.sojourns) {
            const sec = clipInterval(
                s.enterMs, s.exitMs, winLo, winHi,
            );
            nodeSec.set(
                s.nodeId,
                (nodeSec.get(s.nodeId) ?? 0) + sec,
            );
            flowSec += sec;
        }
    }

    // Second pass: visit counts, percentile arrays,
    // WIP, and revisit tracking.
    // We count a visit whenever the sojourn interval
    // *touches* the window (not just when sec > 0),
    // because an instantaneous occupancy (enterMs ===
    // exitMs within the window) is a real visit but
    // yields sec === 0 after clipInterval.
    const sojournsByNode = new Map<string, number[]>();
    const visitsByNode   = new Map<string, number>();
    const woIdsByNode    =
        new Map<string, Set<string>>();
    const revisitsByNode = new Map<string, number>();
    const currentlyAt   = new Map<string, number>();

    for (const run of runs) {
        const seenInRun = new Set<string>();
        for (const s of run.sojourns) {
            if (s.enterMs > winHi
                || s.exitMs < winLo) continue;
            const sec = clipInterval(
                s.enterMs, s.exitMs, winLo, winHi,
            );
            if (sec > 0) {
                const arr =
                    sojournsByNode.get(s.nodeId) ?? [];
                arr.push(sec);
                sojournsByNode.set(s.nodeId, arr);
            }
            visitsByNode.set(
                s.nodeId,
                (visitsByNode.get(s.nodeId) ?? 0) + 1,
            );
            const woIds =
                woIdsByNode.get(s.nodeId)
                ?? new Set<string>();
            woIds.add(run.workOrderId);
            woIdsByNode.set(s.nodeId, woIds);
            if (seenInRun.has(s.nodeId)) {
                revisitsByNode.set(
                    s.nodeId,
                    (revisitsByNode.get(s.nodeId) ?? 0)
                    + 1,
                );
            }
            seenInRun.add(s.nodeId);
        }
        // A run whose last path node isn't the
        // complete node contributes to WIP at that
        // node.
        if (!run.completed
            && run.pathNodeIds.length > 0) {
            const last =
                run.pathNodeIds[
                    run.pathNodeIds.length - 1
                ]!;
            const lastNode = nodeById.get(last);
            if (lastNode && !lastNode.isArchive) {
                currentlyAt.set(
                    last,
                    (currentlyAt.get(last) ?? 0) + 1,
                );
            }
        }
    }

    const weeks = input.windowDays / 7;

    // Count OUT-transitions per (node, worker) within
    // the window.  Transitions with from_node_id='' are
    // creation events and carry no producer signal.
    const outByNode =
        new Map<string, Map<string, number>>();
    for (const t of input.transitions) {
        if (t.from_node_id === '') continue;
        if (!nodeById.has(t.from_node_id)) continue;
        const ms = Date.parse(t.at);
        if (ms < winLo || ms > winHi) continue;
        const inner =
            outByNode.get(t.from_node_id)
            ?? new Map<string, number>();
        inner.set(
            t.worker_id,
            (inner.get(t.worker_id) ?? 0) + 1,
        );
        outByNode.set(t.from_node_id, inner);
    }

    // Precompute outgoing edges per node so each
    // node's branchSplit can look them up in O(1).
    const outgoingEdgesByNode = new Map<string, GraphEdge[]>();
    for (const e of input.edges) {
        const arr = outgoingEdgesByNode.get(e.fromNodeId) ?? [];
        arr.push(e);
        outgoingEdgesByNode.set(e.fromNodeId, arr);
    }

    const stats: NodeStat[] = input.nodes.map(n => {
        const sec = nodeSec.get(n.id) ?? 0;
        const heatPct =
            flowSec > 0
            && !n.isCreate
            && !n.isArchive
                ? (sec / flowSec) * 100
                : 0;
        const heatT =
            Math.min(1, Math.max(0, heatPct / 100));
        const sojourns =
            (sojournsByNode.get(n.id) ?? [])
            .slice()
            .sort((x, y) => x - y);
        const visits   = visitsByNode.get(n.id) ?? 0;
        const revisits =
            revisitsByNode.get(n.id) ?? 0;
        const clan = resolveClan(n, input);
        const outMap =
            outByNode.get(n.id)
            ?? new Map<string, number>();
        const totalOut = Array.from(outMap.values())
            .reduce((s, v) => s + v, 0);
        let topProducer: NodeStat['topProducer'] =
            null;
        if (totalOut > 0) {
            // Tiebreak: name ascending, then id.
            const sorted =
                Array.from(outMap.entries())
                .sort((a, b) => {
                    if (b[1] !== a[1])
                        return b[1] - a[1];
                    const na =
                        input.workerNameById.get(a[0])
                        ?? a[0];
                    const nb =
                        input.workerNameById.get(b[0])
                        ?? b[0];
                    if (na !== nb)
                        return na.localeCompare(nb);
                    return a[0].localeCompare(b[0]);
                });
            const [pid, count] = sorted[0]!;
            topProducer = {
                name:
                    input.workerNameById.get(pid)
                    ?? pid,
                sharePct: Math.round(
                    (count / totalOut) * 100,
                ),
                vsClanAvgPct: clan.ids.size > 0
                    ? Math.round(
                        (count
                         / (totalOut / clan.ids.size)
                        ) * 100,
                    )
                    : null,
                inCurrentClan: clan.ids.has(pid),
            };
        }
        const outEdges =
            outgoingEdgesByNode.get(n.id) ?? [];
        let branchSplit: NodeStat['branchSplit'] = [];
        if (outEdges.length > 1) {
            // Count OUT-transitions per target within
            // the window to compute route percentages.
            const perTarget = new Map<string, number>();
            for (const tx of input.transitions) {
                if (tx.from_node_id !== n.id) continue;
                const ms = Date.parse(tx.at);
                if (ms < winLo || ms > winHi) continue;
                perTarget.set(tx.to_node_id,
                    (perTarget.get(tx.to_node_id) ?? 0)
                    + 1);
            }
            const total =
                Array.from(perTarget.values())
                     .reduce((s, v) => s + v, 0);
            branchSplit = outEdges.map(e => ({
                edgeId: e.id,
                // Edge name trumps target node name;
                // fall back to target node id last.
                label: e.name !== ''
                    ? e.name
                    : (nodeById.get(e.toNodeId)?.name
                       ?? e.toNodeId),
                toNodeId: e.toNodeId,
                pct: total > 0
                    ? Math.round(
                        ((perTarget.get(e.toNodeId)
                          ?? 0) / total) * 100)
                    : 0,
            })).sort((a, b) => b.pct - a.pct);
        }

        // Two-tier hazard rendering — see
        // shouldShowWorkerHazard in flow-graph.ts.
        // Shared with the designer canvas so both
        // surfaces escalate identically.
        const workerHazard =
            shouldShowWorkerHazard(n, input.edges);

        return { ...emptyNodeStat(n),
            heatPct, heatT,
            avgSeconds: sojourns.length === 0
                ? null
                : Math.round(
                    sojourns.reduce(
                        (acc, x) => acc + x, 0,
                    ) / sojourns.length,
                ),
            medianSeconds: sojourns.length === 0
                ? null
                : Math.round(
                    quantile(sojourns, 0.5),
                ),
            p90Seconds: sojourns.length === 0
                ? null
                : Math.round(
                    quantile(sojourns, 0.9),
                ),
            visitsInWindow:     visits,
            distinctWorkOrders:
                woIdsByNode.get(n.id)?.size ?? 0,
            currentlyHere:
                currentlyAt.get(n.id) ?? 0,
            throughputPerWeek:
                weeks > 0 ? visits / weeks : 0,
            revisitRatePct: visits > 0
                ? Math.round(
                    (revisits / visits) * 100,
                )
                : 0,
            clanSize:            clan.ids.size,
            activeProducerCount: outMap.size,
            topProducer,
            assignmentLabel: clan.label,
            outgoingEdgeIds: outEdges.map(e => e.id),
            branchSplit,
            workerHazard,
        };
    });

    const MAX_VISIBLE_PATHS = 8;

    const edgeIdByPair = new Map<string, string>();
    for (const e of input.edges) {
        edgeIdByPair.set(
            e.fromNodeId + '\0' + e.toNodeId, e.id,
        );
    }

    interface PathBucket {
        nodeIds: string[];
        edgeIds: string[];
        count: number;
    }
    const byKey = new Map<string, PathBucket>();
    for (const run of runs) {
        if (!run.completed) continue;
        const ids = run.pathNodeIds.slice();
        const key = JSON.stringify(ids);
        const cur = byKey.get(key);
        if (cur) { cur.count++; continue; }
        const edgeIds: string[] = [];
        for (let i = 0; i + 1 < ids.length; i++) {
            const eid = edgeIdByPair.get(
                ids[i]! + '\0' + ids[i + 1]!,
            );
            if (eid !== undefined) edgeIds.push(eid);
        }
        byKey.set(key, { nodeIds: ids, edgeIds, count: 1 });
    }
    const sortedBuckets =
        Array.from(byKey.values())
             .sort((a, b) => b.count - a.count);
    const totalCompleted =
        sortedBuckets.reduce((s, b) => s + b.count, 0);
    const visible = sortedBuckets.slice(0, MAX_VISIBLE_PATHS);
    const restBuckets = sortedBuckets.slice(MAX_VISIBLE_PATHS);
    const pathEntries: PathEntry[] = visible.map(b => ({
        kind: 'path',
        path: {
            nodeIds: b.nodeIds, edgeIds: b.edgeIds,
            workOrderCount: b.count,
            sharePct: totalCompleted > 0
                ? Math.round(
                    (b.count / totalCompleted) * 100,
                )
                : 0,
        },
    }));
    if (restBuckets.length > 0) {
        const restCount =
            restBuckets.reduce((s, b) => s + b.count, 0);
        pathEntries.push({
            kind: 'rest', count: restCount,
            combinedSharePct: totalCompleted > 0
                ? Math.round(
                    (restCount / totalCompleted) * 100,
                )
                : 0,
        });
    }

    return {
        nodes: stats,
        edges: input.edges,
        pathEntries,
        completedWorkOrderCount:
            runs.filter(r => r.completed).length,
        incompleteWorkOrderCount:
            runs.filter(r => !r.completed).length,
        windowDays: input.windowDays,
        droppedNodeIds,
        pathsWithDroppedStepsCount:
            runs.filter(r => r.hadDroppedStep).length,
    };
}

export function quantile(
    sorted: readonly number[],
    q: number,
): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;
    const idx = q * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]!
        + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function clipInterval(
    startMs: number, endMs: number,
    loMs:    number, hiMs:  number,
): number {
    if (endMs <= startMs) return 0;
    const start = Math.max(startMs, loMs);
    const end   = Math.min(endMs,   hiMs);
    return end <= start
        ? 0
        : Math.round((end - start) / MS_PER_SECOND);
}
