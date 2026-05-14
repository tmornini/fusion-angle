// Which edges close a cycle: back-edges in a depth-first
// walk rooted at the flow's start node. Shared by the
// flow designer (flow-graph.ts) and the read-only stats
// canvas (flow-stats-graph.ts) so loop-backs are marked
// identically in both — one source of truth, not two
// copies that drift. Pure: no DOM, no I/O.

interface CycleNode {
    readonly id: string;
    readonly isCreate: boolean;
}

interface CycleEdge {
    readonly id: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
}

export function findCycleEdgeIds(
    nodes: readonly CycleNode[],
    edges: readonly CycleEdge[],
): ReadonlySet<string> {
    const outAdj = new Map<string, CycleEdge[]>();
    for (const node of nodes) {
        outAdj.set(node.id, []);
    }
    for (const edge of edges) {
        outAdj.get(edge.fromNodeId)?.push(edge);
    }

    const cycleEdgeIds = new Set<string>();
    const visited = new Set<string>();
    const onStack = new Set<string>();
    const dfs = (id: string): void => {
        visited.add(id);
        onStack.add(id);
        for (const e of outAdj.get(id) ?? []) {
            if (onStack.has(e.toNodeId)) {
                cycleEdgeIds.add(e.id);
            } else if (!visited.has(e.toNodeId)) {
                dfs(e.toNodeId);
            }
        }
        onStack.delete(id);
    };

    const startNode = nodes.find(n => n.isCreate);
    if (startNode) dfs(startNode.id);
    for (const node of nodes) {
        if (!visited.has(node.id)) dfs(node.id);
    }
    return cycleEdgeIds;
}
