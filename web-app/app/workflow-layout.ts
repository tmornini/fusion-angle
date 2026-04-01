export interface LayoutInput {
    id: string;
    isStart: boolean;
    isComplete: boolean;
}

export interface LayoutEdge {
    fromId: string;
    toId: string;
}

export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 56;
export const HORIZONTAL_GAP = 120;
export const VERTICAL_GAP = 90;
export const START_X = 40;
export const START_Y = 30;

function buildAdjacency(
    edges: LayoutEdge[],
): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const edge of edges) {
        const list = adj.get(edge.fromId);
        if (list) {
            list.push(edge.toId);
        } else {
            adj.set(edge.fromId, [edge.toId]);
        }
    }
    return adj;
}

function assignRanks(
    startId: string,
    adj: Map<string, string[]>,
    allIds: string[],
): Map<string, number> {
    const ranks = new Map<string, number>();
    const visited = new Set<string>();
    const queue: Array<[string, number]> = [
        [startId, 0],
    ];
    visited.add(startId);
    ranks.set(startId, 0);

    let maxRank = 0;
    while (queue.length > 0) {
        const entry = queue.shift()!;
        const [nodeId, rank] = entry;
        const neighbors = adj.get(nodeId);
        if (!neighbors) continue;
        for (const neighborId of neighbors) {
            if (visited.has(neighborId)) continue;
            visited.add(neighborId);
            const nextRank = rank + 1;
            ranks.set(neighborId, nextRank);
            if (nextRank > maxRank) {
                maxRank = nextRank;
            }
            queue.push([neighborId, nextRank]);
        }
    }

    const orphanRank = maxRank + 1;
    for (const id of allIds) {
        if (!ranks.has(id)) {
            ranks.set(id, orphanRank);
        }
    }

    return ranks;
}

export function computeLayout(
    nodes: LayoutInput[],
    edges: LayoutEdge[],
    canvasWidth: number,
    canvasHeight: number,
): Map<string, { x: number; y: number }> {
    const positions = new Map<
        string,
        { x: number; y: number }
    >();

    if (nodes.length === 0) return positions;

    const startNode = nodes.find(n => n.isStart);
    const completeNode = nodes.find(
        n => n.isComplete,
    );
    const startId = startNode?.id ?? nodes[0]!.id;
    const completeId = completeNode?.id;

    const adj = buildAdjacency(edges);
    const allIds = nodes.map(n => n.id);
    const ranks = assignRanks(startId, adj, allIds);

    const rankGroups = new Map<number, string[]>();
    for (const [id, rank] of ranks) {
        const group = rankGroups.get(rank);
        if (group) {
            group.push(id);
        } else {
            rankGroups.set(rank, [id]);
        }
    }

    const step = NODE_WIDTH + HORIZONTAL_GAP;
    const intraRankGap = NODE_HEIGHT + 20;

    for (const [rank, ids] of rankGroups) {
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i]!;
            const x = START_X + rank * step;
            const y =
                START_Y +
                rank * VERTICAL_GAP +
                i * intraRankGap;
            positions.set(id, { x, y });
        }
    }

    positions.set(startId, {
        x: START_X,
        y: START_Y,
    });

    if (completeId) {
        let maxX = START_X;
        let maxY = START_Y;
        for (const [id, pos] of positions) {
            if (id === completeId) continue;
            if (pos.x > maxX) maxX = pos.x;
            if (pos.y > maxY) maxY = pos.y;
        }

        const rightEdge =
            canvasWidth - NODE_WIDTH - START_X;
        const bottomEdge =
            canvasHeight - NODE_HEIGHT - START_Y;
        const beyondX = maxX + step;
        const beyondY = maxY + VERTICAL_GAP;

        positions.set(completeId, {
            x: Math.max(rightEdge, beyondX),
            y: Math.max(bottomEdge, beyondY),
        });
    }

    return positions;
}

export function clampNodePosition(
    x: number,
    y: number,
    isStart: boolean,
    isComplete: boolean,
    startPos: { x: number; y: number },
    completePos: { x: number; y: number },
): { x: number; y: number } {
    if (isStart) {
        return { x: START_X, y: START_Y };
    }

    if (isComplete) {
        return {
            x: completePos.x,
            y: completePos.y,
        };
    }

    const halfGap = HORIZONTAL_GAP / 2;
    const minX =
        startPos.x + NODE_WIDTH + halfGap;
    const maxX =
        completePos.x - NODE_WIDTH - halfGap;
    const minY =
        startPos.y + NODE_HEIGHT + halfGap;
    const maxY =
        completePos.y - NODE_HEIGHT - halfGap;

    return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
    };
}
