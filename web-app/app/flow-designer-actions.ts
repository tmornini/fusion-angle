import type { GraphNode } from './adapters/flows';

export interface NodeMove {
    readonly nodeId: string;
    readonly x: number;
    readonly y: number;
}

export function applyMoveNodes(
    nodes: readonly GraphNode[],
    updates: readonly NodeMove[],
): GraphNode[] {
    const updateMap = new Map(
        updates.map(u => [u.nodeId, u]),
    );
    return nodes.map(n => {
        const u = updateMap.get(n.id);
        if (!u) return n;
        return {
            ...n,
            positionX: u.x,
            positionY: u.y,
        };
    });
}
