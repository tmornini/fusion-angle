export interface LayoutInput {
    id: string;
    isStart: boolean;
    isComplete: boolean;
}

export interface EdgePair {
    fromId: string;
    toId: string;
}

export interface LayoutEdge extends EdgePair {
    labelWidth: number;
}

export interface LayoutContext {
    readonly nodes: readonly LayoutInput[];
    readonly edges: readonly LayoutEdge[];
    readonly canvasWidth: number;
    readonly canvasHeight: number;
}

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 64;
export const HORIZONTAL_GAP = 60;
export const VERTICAL_GAP = 180;
export const START_X = 0;
export const START_Y = 0;
export const LABEL_SAFETY_MARGIN = 16;

type Position = { x: number; y: number };
type Layers = readonly (readonly string[])[];

interface AugmentedEdge extends LayoutEdge {
    origFromId: string;
    origToId: string;
}

const DUMMY_PREFIX = '__dummy__';

function isDummy(id: string): boolean {
    return id.startsWith(DUMMY_PREFIX);
}

function countPairInversions(
    pairs: readonly (readonly [number, number])[],
): number {
    let total = 0;
    for (let i = 0; i < pairs.length; i++) {
        for (
            let j = i + 1;
            j < pairs.length;
            j++
        ) {
            const [t1, b1] = pairs[i]!;
            const [t2, b2] = pairs[j]!;
            const isInversion =
                (t1 < t2 && b1 > b2)
                || (t1 > t2 && b1 < b2);
            if (isInversion) total++;
        }
    }
    return total;
}

export function edgeWaypointKey(
    fromId: string, toId: string,
): string {
    return `${fromId}->${toId}`;
}

const MIN_LAYER_STEP =
    NODE_WIDTH + HORIZONTAL_GAP;
const SIBLING_NODE_GAP = 100;
const SIBLING_STEP =
    Math.max(NODE_WIDTH, NODE_HEIGHT)
    + SIBLING_NODE_GAP;
const CROSSING_SWEEP_COUNT = 24;
const COORD_ITERATIONS = 4;
const MAX_ASPECT_STRETCH = 2.5;
const MIN_SNAKE_NODES = 4;

export function buildAdjacency(
    edges: readonly EdgePair[],
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

export function isReachable(
    sourceId: string,
    targetId: string,
    adj: Map<string, string[]>,
): boolean {
    const visited = new Set<string>();
    const stack: string[] = [sourceId];
    visited.add(sourceId);
    while (stack.length > 0) {
        const node = stack.pop()!;
        const neighbors = adj.get(node);
        if (!neighbors) continue;
        for (const n of neighbors) {
            if (n === targetId) return true;
            if (visited.has(n)) continue;
            visited.add(n);
            stack.push(n);
        }
    }
    return false;
}

export function wouldBeCycle(
    fromId: string,
    toId: string,
    edges: readonly EdgePair[],
): boolean {
    if (fromId === toId) return true;
    const adj = buildAdjacency(edges);
    return isReachable(toId, fromId, adj);
}

export interface LayoutResult {
    positions: Map<string, Position>;
    waypoints: Map<string, Position[]>;
}

export function computeLayout(
    context: LayoutContext,
): LayoutResult {
    const {
        nodes, edges,
        canvasWidth, canvasHeight,
    } = context;
    if (nodes.length === 0) {
        return {
            positions: new Map(),
            waypoints: new Map(),
        };
    }

    const startNode = nodes.find(n => n.isStart);
    if (!startNode) {
        throw new Error('Flow has no start node');
    }

    const { forwardEdges, reversedIds } =
        removeCycles(nodes, edges);

    const baseLayers = assignLayers(nodes, forwardEdges);
    const aug = insertDummies(baseLayers, forwardEdges);
    const ordered = reduceCrossings(aug.layers, aug.edges);
    const topo = ordered
        .flat()
        .filter(id => !isDummy(id));

    const hasWideFan = [
        ...buildAdjacency(forwardEdges).values(),
    ].some(a => a.length >= 3);

    if (
        !hasWideFan
        && topo.length >= MIN_SNAKE_NODES
    ) {
        const k = computeSnakeWrap(
            topo.length, canvasWidth, canvasHeight,
        );
        if (k > 0) {
            const sugiPos = assignCoordinates(
                ordered, aug.edges,
            );
            const snakePos = computeTopoSnake(
                topo, k, forwardEdges,
                canvasWidth, canvasHeight,
            );
            const canvasAspect =
                canvasWidth / canvasHeight;
            const snakeMismatch =
                computeAspectMismatch(
                    computeBboxAspect(snakePos),
                    canvasAspect,
                );
            const sugiMismatch =
                computeAspectMismatch(
                    computeBboxAspect(sugiPos),
                    canvasAspect,
                );
            if (snakeMismatch < sugiMismatch) {
                return {
                    positions: fitToCanvas(
                        snakePos,
                        canvasWidth, canvasHeight,
                        nodes,
                    ),
                    waypoints: new Map(),
                };
            }
            return finalizeLayout(
                sugiPos, aug.edges,
                canvasWidth, canvasHeight, nodes,
                reversedIds,
            );
        }
    }

    const natural = assignCoordinates(
        ordered, aug.edges,
    );
    return finalizeLayout(
        natural, aug.edges,
        canvasWidth, canvasHeight, nodes,
        reversedIds,
    );
}

function finalizeLayout(
    natural: Map<string, Position>,
    edges: readonly AugmentedEdge[],
    canvasW: number,
    canvasH: number,
    nodes: readonly LayoutInput[],
    reversedIds: ReadonlySet<string>,
): LayoutResult {
    const fitted = fitToCanvas(
        natural, canvasW, canvasH, nodes,
    );
    const positions = new Map<string, Position>();
    const dummyPositions =
        new Map<string, Position>();
    for (const [id, p] of fitted) {
        if (isDummy(id)) {
            dummyPositions.set(id, p);
        } else {
            positions.set(id, p);
        }
    }
    const waypoints = extractWaypoints(
        edges, dummyPositions, reversedIds,
    );
    return { positions, waypoints };
}

function insertDummies(
    layers: Layers,
    edges: readonly LayoutEdge[],
): {
    layers: string[][];
    edges: AugmentedEdge[];
} {
    const layerOf = new Map<string, number>();
    layers.forEach((l, i) => {
        for (const id of l) {
            layerOf.set(id, i);
        }
    });
    const out: string[][] =
        layers.map(l => [...l]);
    const augEdges: AugmentedEdge[] = [];
    let counter = 0;
    for (const e of edges) {
        const fl = layerOf.get(e.fromId);
        const tl = layerOf.get(e.toId);
        if (
            fl === undefined
            || tl === undefined
            || tl - fl <= 1
        ) {
            augEdges.push({
                ...e,
                origFromId: e.fromId,
                origToId: e.toId,
            });
            continue;
        }
        let prev = e.fromId;
        for (let i = fl + 1; i < tl; i++) {
            const id =
                `${DUMMY_PREFIX}${counter++}`;
            out[i]!.push(id);
            layerOf.set(id, i);
            augEdges.push({
                fromId: prev,
                toId: id,
                labelWidth: 0,
                origFromId: e.fromId,
                origToId: e.toId,
            });
            prev = id;
        }
        augEdges.push({
            fromId: prev,
            toId: e.toId,
            labelWidth: 0,
            origFromId: e.fromId,
            origToId: e.toId,
        });
    }
    return { layers: out, edges: augEdges };
}

function extractWaypoints(
    edges: readonly AugmentedEdge[],
    dummyPositions: Map<string, Position>,
    reversedIds: ReadonlySet<string>,
): Map<string, Position[]> {
    const result = new Map<string, Position[]>();
    for (const e of edges) {
        if (
            !isDummy(e.fromId)
            && !isDummy(e.toId)
        ) continue;
        const originalKey = edgeWaypointKey(
            e.origToId, e.origFromId,
        );
        const key = reversedIds.has(originalKey)
            ? originalKey
            : edgeWaypointKey(
                e.origFromId, e.origToId,
            );
        const list = result.get(key) ?? [];
        if (isDummy(e.toId)) {
            const pos =
                dummyPositions.get(e.toId);
            if (pos) list.push(pos);
        }
        result.set(key, list);
    }
    for (const key of reversedIds) {
        const list = result.get(key);
        if (list && list.length > 1) {
            result.set(key, [...list].reverse());
        }
    }
    return result;
}

function removeCycles(
    nodes: readonly LayoutInput[],
    edges: readonly LayoutEdge[],
): {
    forwardEdges: readonly LayoutEdge[];
    reversedIds: ReadonlySet<string>;
} {
    const validEdges = edges.filter(
        e => e.fromId !== e.toId,
    );

    const outAdj =
        new Map<string, string[]>();
    for (const n of nodes) {
        outAdj.set(n.id, []);
    }
    for (const e of validEdges) {
        outAdj.get(e.fromId)!.push(e.toId);
    }

    const backPairs = new Set<string>();
    const visited = new Set<string>();
    const onStack = new Set<string>();

    const dfs = (id: string): void => {
        visited.add(id);
        onStack.add(id);
        const neighbors =
            outAdj.get(id) ?? [];
        for (const n of neighbors) {
            if (onStack.has(n)) {
                backPairs.add(
                    id + ':' + n,
                );
            } else if (!visited.has(n)) {
                dfs(n);
            }
        }
        onStack.delete(id);
    };

    const startNode =
        nodes.find(n => n.isStart);
    if (startNode) {
        dfs(startNode.id);
    }
    for (const n of nodes) {
        if (!visited.has(n.id)) {
            dfs(n.id);
        }
    }

    const forwardEdges: LayoutEdge[] = [];
    const reversedIds = new Set<string>();
    for (const e of validEdges) {
        const key =
            e.fromId + ':' + e.toId;
        if (backPairs.has(key)) {
            forwardEdges.push({
                fromId: e.toId,
                toId: e.fromId,
                labelWidth: e.labelWidth,
            });
            reversedIds.add(
                e.fromId + '->' + e.toId,
            );
        } else {
            forwardEdges.push(e);
        }
    }

    return { forwardEdges, reversedIds };
}

function assignLayers(
    nodes: readonly LayoutInput[],
    forwardEdges: readonly LayoutEdge[],
): Layers {
    const preds = new Map<string, string[]>();
    const outAdj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const n of nodes) {
        preds.set(n.id, []);
        outAdj.set(n.id, []);
        inDeg.set(n.id, 0);
    }
    for (const e of forwardEdges) {
        const predsList = preds.get(e.toId);
        const outList = outAdj.get(e.fromId);
        if (!predsList || !outList) continue;
        predsList.push(e.fromId);
        outList.push(e.toId);
        inDeg.set(e.toId, inDeg.get(e.toId)! + 1);
    }

    const remInDeg = new Map(inDeg);
    const queue: string[] = [];
    for (const n of nodes) {
        if (remInDeg.get(n.id) === 0) {
            queue.push(n.id);
        }
    }

    const topo: string[] = [];
    while (queue.length > 0) {
        const id = queue.shift()!;
        topo.push(id);
        const outs = outAdj.get(id)!;
        for (const t of outs) {
            const rem = remInDeg.get(t)! - 1;
            remInDeg.set(t, rem);
            if (rem === 0) {
                queue.push(t);
            }
        }
    }

    const layerOf = new Map<string, number>();
    for (const id of topo) {
        const ps = preds.get(id)!;
        if (ps.length === 0) {
            layerOf.set(id, 0);
        } else {
            let maxPred = 0;
            for (const p of ps) {
                const pl = layerOf.get(p)!;
                if (pl > maxPred) maxPred = pl;
            }
            layerOf.set(id, maxPred + 1);
        }
    }

    for (const n of nodes) {
        if (!layerOf.has(n.id)) {
            layerOf.set(n.id, 0);
        }
    }

    let maxLayer = 0;
    for (const l of layerOf.values()) {
        if (l > maxLayer) maxLayer = l;
    }

    const layers: string[][] = [];
    for (let i = 0; i <= maxLayer; i++) {
        layers.push([]);
    }
    for (const [id, l] of layerOf) {
        layers[l]!.push(id);
    }

    return layers;
}

function reduceCrossings(
    layers: Layers,
    forwardEdges: readonly LayoutEdge[],
): Layers {
    if (layers.length <= 1) {
        return layers.map(l => [...l]);
    }

    const layerOf = new Map<string, number>();
    layers.forEach((l, i) => {
        for (const id of l) {
            layerOf.set(id, i);
        }
    });

    const upN = new Map<string, string[]>();
    const downN = new Map<string, string[]>();
    for (const l of layers) {
        for (const id of l) {
            upN.set(id, []);
            downN.set(id, []);
        }
    }
    for (const e of forwardEdges) {
        const fl = layerOf.get(e.fromId);
        const tl = layerOf.get(e.toId);
        if (fl === undefined) continue;
        if (tl === undefined) continue;
        if (tl - fl !== 1) continue;
        downN.get(e.fromId)!.push(e.toId);
        upN.get(e.toId)!.push(e.fromId);
    }

    // Sugiyama barycenter heuristic for crossing reduction.
    const barycenter = (
        ids: readonly string[],
        neighborPos: Map<string, number>,
        neighbors: Map<string, string[]>,
    ): string[] => {
        const withBary = ids.map((id, idx) => {
            const ns = neighbors.get(id)!;
            if (ns.length === 0) {
                return { id, bary: idx };
            }
            let sum = 0;
            for (const n of ns) {
                sum += neighborPos.get(n)!;
            }
            return { id, bary: sum / ns.length };
        });
        return withBary
            .toSorted((a, b) => a.bary - b.bary)
            .map(b => b.id);
    };

    const sweepDown = (
        ord: readonly (readonly string[])[],
    ): string[][] => {
        const result: string[][] = ord.map(l => [...l]);
        for (let l = 1; l < result.length; l++) {
            const prev = result[l - 1]!;
            const prevPos = new Map<string, number>();
            prev.forEach((id, i) => {
                prevPos.set(id, i);
            });
            result[l] = barycenter(
                result[l]!,
                prevPos,
                upN,
            );
        }
        return result;
    };

    const sweepUp = (
        ord: readonly (readonly string[])[],
    ): string[][] => {
        const result: string[][] = ord.map(l => [...l]);
        for (
            let l = result.length - 2;
            l >= 0;
            l--
        ) {
            const next = result[l + 1]!;
            const nextPos = new Map<string, number>();
            next.forEach((id, i) => {
                nextPos.set(id, i);
            });
            result[l] = barycenter(
                result[l]!,
                nextPos,
                downN,
            );
        }
        return result;
    };

    const countCrossings = (
        ord: readonly (readonly string[])[],
    ): number => {
        let total = 0;
        for (let l = 0; l < ord.length - 1; l++) {
            const top = ord[l]!;
            const bot = ord[l + 1]!;
            const botPos = new Map<string, number>();
            bot.forEach((id, i) => {
                botPos.set(id, i);
            });
            const pairs: [number, number][] = [];
            top.forEach((t, ti) => {
                const ns = downN.get(t)!;
                for (const d of ns) {
                    const bi = botPos.get(d);
                    if (bi !== undefined) {
                        pairs.push([ti, bi]);
                    }
                }
            });
            total += countPairInversions(pairs);
        }
        return total;
    };

    let current: readonly (readonly string[])[] =
        layers.map(l => [...l]);
    let best: readonly (readonly string[])[] = current;
    let bestCount = countCrossings(current);

    for (let i = 0; i < CROSSING_SWEEP_COUNT; i++) {
        current = sweepDown(current);
        const dc = countCrossings(current);
        if (dc < bestCount) {
            bestCount = dc;
            best = current.map(l => [...l]);
        }
        current = sweepUp(current);
        const uc = countCrossings(current);
        if (uc < bestCount) {
            bestCount = uc;
            best = current.map(l => [...l]);
        }
        if (bestCount === 0) break;
    }

    return best;
}

function assignCoordinates(
    orderedLayers: Layers,
    forwardEdges: readonly LayoutEdge[],
): Map<string, Position> {
    const positions = new Map<string, Position>();
    if (orderedLayers.length === 0) return positions;

    const layerOf = new Map<string, number>();
    orderedLayers.forEach((l, i) => {
        for (const id of l) {
            layerOf.set(id, i);
        }
    });

    const upN = new Map<string, string[]>();
    const downN = new Map<string, string[]>();
    for (const l of orderedLayers) {
        for (const id of l) {
            upN.set(id, []);
            downN.set(id, []);
        }
    }
    for (const e of forwardEdges) {
        const fl = layerOf.get(e.fromId);
        const tl = layerOf.get(e.toId);
        if (fl === undefined) continue;
        if (tl === undefined) continue;
        if (tl - fl !== 1) continue;
        upN.get(e.toId)!.push(e.fromId);
        downN.get(e.fromId)!.push(e.toId);
    }

    const ys = new Map<string, number>();

    const first = orderedLayers[0];
    if (first) {
        const n = first.length;
        const span = (n - 1) * SIBLING_STEP;
        first.forEach((id, i) => {
            ys.set(id, i * SIBLING_STEP - span / 2);
        });
    }

    for (let l = 1; l < orderedLayers.length; l++) {
        forwardPassLayer(
            orderedLayers[l]!, upN, ys,
        );
    }

    const fanOwned = computeFanOwned(
        orderedLayers, upN,
    );

    for (let it = 0; it < COORD_ITERATIONS; it++) {
        for (
            let l = orderedLayers.length - 2;
            l >= 0;
            l--
        ) {
            backwardPassLayer(
                orderedLayers[l]!, downN, ys, fanOwned,
            );
        }
        for (let l = 1; l < orderedLayers.length; l++) {
            forwardPassLayer(
                orderedLayers[l]!, upN, ys,
            );
        }
    }

    const maxLabelByLayer = new Array<number>(
        orderedLayers.length,
    ).fill(0);
    for (const e of forwardEdges) {
        const fl = layerOf.get(e.fromId);
        if (fl === undefined) continue;
        if (fl >= orderedLayers.length) {
            continue;
        }
        const w = maxLabelByLayer[fl]!;
        if (e.labelWidth > w) {
            maxLabelByLayer[fl] =
                e.labelWidth;
        }
    }

    const xByLayer = new Array<number>(
        orderedLayers.length,
    );
    xByLayer[0] = 0;
    for (
        let l = 1;
        l < orderedLayers.length;
        l++
    ) {
        const labelW =
            maxLabelByLayer[l - 1]!;
        const needed = NODE_WIDTH
            + labelW
            + LABEL_SAFETY_MARGIN;
        const step = Math.max(
            MIN_LAYER_STEP, needed,
        );
        xByLayer[l] =
            xByLayer[l - 1]! + step;
    }

    orderedLayers.forEach((layer, l) => {
        const x = xByLayer[l]!;
        for (const id of layer) {
            positions.set(id, {
                x,
                y: ys.get(id)!,
            });
        }
    });

    return positions;
}

function medianY(
    ids: readonly string[],
    ys: Map<string, number>,
): number {
    if (ids.length === 0) return 0;
    const vals = ids
        .map(id => ys.get(id)!)
        .toSorted((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    if (vals.length % 2 === 1) {
        return vals[mid]!;
    }
    return (vals[mid - 1]! + vals[mid]!) / 2;
}

function centerGroupAround(
    group: readonly string[],
    centerY: number,
    ys: Map<string, number>,
): void {
    const k = group.length;
    group.forEach((id, i) => {
        const offset =
            (i - (k - 1) / 2) * SIBLING_STEP;
        ys.set(id, centerY + offset);
    });
}

function forwardPassLayer(
    layer: readonly string[],
    upN: Map<string, string[]>,
    ys: Map<string, number>,
): void {
    let i = 0;
    while (i < layer.length) {
        const id = layer[i]!;
        const ps = upN.get(id)!;
        if (ps.length !== 1) {
            ys.set(id, medianY(ps, ys));
            i++;
            continue;
        }
        const pred = ps[0]!;
        let j = i + 1;
        while (j < layer.length) {
            const nid = layer[j]!;
            const nps = upN.get(nid)!;
            if (
                nps.length === 1
                && nps[0] === pred
            ) {
                j++;
            } else {
                break;
            }
        }
        const group = layer.slice(i, j);
        centerGroupAround(
            group, ys.get(pred)!, ys,
        );
        i = j;
    }
    enforceSpacing(layer, ys);
}

function backwardPassLayer(
    layer: readonly string[],
    downN: Map<string, string[]>,
    ys: Map<string, number>,
    fanOwned: ReadonlySet<string>,
): void {
    for (const id of layer) {
        if (fanOwned.has(id)) continue;
        const succs = downN.get(id)!;
        if (succs.length === 0) continue;
        ys.set(id, medianY(succs, ys));
    }
    enforceSpacing(layer, ys);
}

function computeFanOwned(
    orderedLayers: Layers,
    upN: Map<string, string[]>,
): ReadonlySet<string> {
    const fanOwned = new Set<string>();
    for (const layer of orderedLayers) {
        for (const id of layer) {
            const ps = upN.get(id)!;
            if (ps.length === 1 && fanOwned.has(ps[0]!)) {
                fanOwned.add(id);
            }
        }
        let i = 0;
        while (i < layer.length) {
            const ps = upN.get(layer[i]!)!;
            if (ps.length !== 1) {
                i++;
                continue;
            }
            const pred = ps[0]!;
            let j = i + 1;
            while (j < layer.length) {
                const nps = upN.get(layer[j]!)!;
                if (
                    nps.length === 1
                    && nps[0] === pred
                ) {
                    j++;
                } else {
                    break;
                }
            }
            if (j - i >= 2) {
                for (let k = i; k < j; k++) {
                    fanOwned.add(layer[k]!);
                }
            }
            i = j;
        }
    }
    return fanOwned;
}

function enforceSpacing(
    layer: readonly string[],
    ys: Map<string, number>,
): void {
    for (let i = 1; i < layer.length; i++) {
        const prev = ys.get(layer[i - 1]!)!;
        const cur = ys.get(layer[i]!)!;
        if (cur - prev < SIBLING_STEP) {
            ys.set(layer[i]!, prev + SIBLING_STEP);
        }
    }
}

function fitToCanvas(
    positions: Map<string, Position>,
    canvasW: number,
    canvasH: number,
    nodes: readonly LayoutInput[],
): Map<string, Position> {
    if (positions.size === 0) return new Map();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    const natW = maxX - minX;
    const natH = maxY - minY;
    const posCx = (minX + maxX) / 2;
    const posCy = (minY + maxY) / 2;

    const graphLandscape =
        (natW + NODE_WIDTH) >= (natH + NODE_HEIGHT);
    const canvasLandscape = canvasW >= canvasH;
    const rotate =
        canvasW > 0
        && canvasH > 0
        && graphLandscape !== canvasLandscape;

    const rotW = rotate ? natH : natW;
    const rotH = rotate ? natW : natH;

    let scaleX = 1;
    let scaleY = 1;
    if (canvasW > 0 && canvasH > 0) {
        const tW = canvasW - NODE_WIDTH;
        const tH = canvasH - NODE_HEIGHT;
        let sX = Infinity;
        let sY = Infinity;
        if (rotW > 0 && tW > 0) sX = tW / rotW;
        if (rotH > 0 && tH > 0) sY = tH / rotH;
        if (isFinite(sX) && isFinite(sY)) {
            const sSmall = Math.min(sX, sY);
            const sBig = Math.max(sX, sY);
            const cappedBig = Math.min(
                sBig,
                sSmall * MAX_ASPECT_STRETCH,
            );
            const isXBigger = sX >= sY;
            scaleX = isXBigger
                ? cappedBig
                : sSmall;
            scaleY = isXBigger
                ? sSmall
                : cappedBig;
            scaleX = Math.max(scaleX, 1);
            scaleY = Math.max(scaleY, 0.4);
        }
    }

    const halfW = NODE_WIDTH / 2;
    const halfH = NODE_HEIGHT / 2;

    const result = new Map<string, Position>();
    for (const [id, p] of positions) {
        const cx_p = p.x - posCx;
        const cy_p = p.y - posCy;
        const rx = rotate ? -cy_p : cx_p;
        const ry = rotate ? cx_p : cy_p;
        result.set(id, {
            x: rx * scaleX - halfW,
            y: ry * scaleY - halfH,
        });
    }

    const startId = nodes.find(
        n => n.isStart,
    )?.id;
    const endId = nodes.find(
        n => n.isComplete,
    )?.id;
    if (
        startId && endId
        && startId !== endId
    ) {
        const sp = result.get(startId);
        const ep = result.get(endId);
        if (sp && ep) {
            const flipX = sp.x > ep.x;
            const flipY = sp.y > ep.y;
            if (flipX || flipY) {
                let rMinX = Infinity;
                let rMaxX = -Infinity;
                let rMinY = Infinity;
                let rMaxY = -Infinity;
                for (
                    const rp
                    of result.values()
                ) {
                    if (rp.x < rMinX) {
                        rMinX = rp.x;
                    }
                    if (rp.x > rMaxX) {
                        rMaxX = rp.x;
                    }
                    if (rp.y < rMinY) {
                        rMinY = rp.y;
                    }
                    if (rp.y > rMaxY) {
                        rMaxY = rp.y;
                    }
                }
                for (
                    const [, rp] of result
                ) {
                    if (flipX) {
                        rp.x =
                            rMinX + rMaxX
                            - rp.x;
                    }
                    if (flipY) {
                        rp.y =
                            rMinY + rMaxY
                            - rp.y;
                    }
                }
            }
        }
    }

    return result;
}

function computeSnakeWrap(
    nodeCount: number,
    _canvasW: number,
    canvasH: number,
): number {
    if (nodeCount < MIN_SNAKE_NODES) return 0;
    if (canvasH <= 0) return 0;

    const cellH = NODE_HEIGHT + VERTICAL_GAP;
    const targetH = canvasH - NODE_HEIGHT;
    if (targetH <= 0) return 0;
    const numRows = Math.max(
        2, Math.floor(targetH / cellH),
    );
    const k = Math.max(
        2,
        Math.min(
            Math.ceil(nodeCount / numRows),
            nodeCount - 1,
        ),
    );
    return k;
}

function computeBboxAspect(
    positions: ReadonlyMap<string, Position>,
): number {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX + NODE_WIDTH;
    const h = maxY - minY + NODE_HEIGHT;
    if (h <= 0) return Infinity;
    return w / h;
}

function snakeColRow(
    i: number,
    k: number,
): { col: number; row: number } {
    const row = Math.floor(i / k);
    const rowEven = row % 2 === 0;
    const colInRow = i % k;
    const col = rowEven
        ? colInRow
        : (k - 1 - colInRow);
    return { col, row };
}

function computeAspectMismatch(
    aspect: number,
    canvasAspect: number,
): number {
    return Math.max(aspect, canvasAspect)
        / Math.min(aspect, canvasAspect);
}

function computeTopoSnake(
    topo: readonly string[],
    k: number,
    forwardEdges: readonly LayoutEdge[],
    canvasW: number,
    canvasH: number,
): Map<string, Position> {
    const numRows = Math.ceil(topo.length / k);

    const edgeLabel = new Map<string, number>();
    for (const e of forwardEdges) {
        const key = e.fromId + '\0' + e.toId;
        const cur = edgeLabel.get(key) ?? 0;
        if (e.labelWidth > cur) {
            edgeLabel.set(key, e.labelWidth);
        }
    }

    const colGap = new Array<number>(
        Math.max(0, k - 1),
    ).fill(HORIZONTAL_GAP);
    for (let i = 0; i < topo.length - 1; i++) {
        const a = snakeColRow(i, k);
        const b = snakeColRow(i + 1, k);
        if (a.row !== b.row) continue;
        const g = Math.min(a.col, b.col);
        const fwd =
            topo[i]! + '\0' + topo[i + 1]!;
        const rev =
            topo[i + 1]! + '\0' + topo[i]!;
        const labelW = Math.max(
            edgeLabel.get(fwd) ?? 0,
            edgeLabel.get(rev) ?? 0,
        );
        const need = labelW + LABEL_SAFETY_MARGIN;
        if (need > colGap[g]!) colGap[g] = need;
    }

    const colX = new Array<number>(k);
    colX[0] = 0;
    for (let c = 1; c < k; c++) {
        const step = Math.max(
            MIN_LAYER_STEP,
            NODE_WIDTH + colGap[c - 1]!,
        );
        colX[c] = colX[c - 1]! + step;
    }

    const lastCol = colX[k - 1]!;
    const targetW = canvasW - NODE_WIDTH;
    if (
        k > 1
        && lastCol > 0
        && targetW > lastCol
    ) {
        const scale = targetW / lastCol;
        for (let c = 1; c < k; c++) {
            colX[c] = colX[c]! * scale;
        }
    }

    const rowY = new Array<number>(numRows);
    rowY[0] = 0;
    if (numRows > 1) {
        const span = canvasH - NODE_HEIGHT;
        const step = span / (numRows - 1);
        for (let r = 1; r < numRows; r++) {
            rowY[r] = r * step;
        }
    }

    const positions = new Map<string, Position>();
    for (let i = 0; i < topo.length; i++) {
        const { col, row } = snakeColRow(i, k);
        positions.set(topo[i]!, {
            x: colX[col]!,
            y: rowY[row]!,
        });
    }

    return positions;
}
