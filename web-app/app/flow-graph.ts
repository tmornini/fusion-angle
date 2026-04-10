import type { SafeHtml } from './safe-html';
import { trusted, html, escapeForHtml } from './safe-html';
import type {
    GraphNode, GraphEdge,
} from './adapters/flows';
import type {
    Selection,
} from './flow-interactions';
import {
    NODE_WIDTH, NODE_HEIGHT,
    buildAdjacency, isReachable,
} from './flow-layout';

const BLUE = '#4B6CA1';
const WARN = '#d97706';
const GREEN = '#16a34a';

const GRID_CELL = 24;
const GRID_DOT_RADIUS = 0.7;

const ARROW_VIEWBOX = 10;
const ARROW_MIDPOINT = 5;
const ARROW_MARKER = 8;


const STROKE_NORMAL = 2;
const STROKE_START = 2.5;
const STROKE_COMPLETE = 3;

const NODE_RADIUS = 10;
const COMPLETE_INSET = 4;
const COMPLETE_INNER_RADIUS = 7;
const COMPLETE_INNER_STROKE = 1.5;

const PORT_RADIUS = 5;
const PORT_STROKE = 2;

const NODE_LABEL_Y = 26;
const NODE_LABEL_FONT = 13;
const NODE_META_Y = 45;
const NODE_META_FONT = 11;
const NODE_MAX_CHARS = 18;
const LABEL_MAX_WIDTH = 140;

const EDGE_STROKE = 2;
const HIT_TARGET_WIDTH = 12;
const CURVE_TENSION = 0.4;
const BEZIER_MIDPOINT = 0.5;
const BIDI_SPREAD = 40;
const BIDI_LABEL_T_FWD = 0.35;
const BIDI_LABEL_T_REV = 0.65;

const CYCLE_DASH = '6 3';

const LABEL_CHAR_WIDTH = 7;
const LABEL_PADDING = 12;
const LABEL_MIN_WIDTH = 36;
const LABEL_HEIGHT = 20;
const LABEL_RADIUS = 4;
const LABEL_BG_OPACITY = 0.9;
const LABEL_TEXT_OFFSET_Y = 4;
const LABEL_FONT = 11;

export type RectEdge =
    'right' | 'left' | 'top' | 'bottom';

export function perimeterPoint(
    rx: number, ry: number,
    rw: number, rh: number,
    fx: number, fy: number,
): { x: number; y: number } {
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const dx = fx - cx;
    const dy = fy - cy;
    if (dx === 0 && dy === 0) {
        return { x: rx + rw, y: cy };
    }
    const sx = dx !== 0
        ? (rw / 2) / Math.abs(dx)
        : Infinity;
    const sy = dy !== 0
        ? (rh / 2) / Math.abs(dy)
        : Infinity;
    const s = Math.min(sx, sy);
    return {
        x: cx + dx * s,
        y: cy + dy * s,
    };
}

function perimToXy(
    t: number,
): { x: number; y: number } {
    const w = NODE_WIDTH;
    const h = NODE_HEIGHT;
    if (t < w) return { x: t, y: 0 };
    if (t < w + h) {
        return { x: w, y: t - w };
    }
    if (t < 2 * w + h) {
        return {
            x: w - (t - w - h), y: h,
        };
    }
    return {
        x: 0, y: h - (t - 2 * w - h),
    };
}

function xyToPerim(
    px: number, py: number,
): number {
    const w = NODE_WIDTH;
    const h = NODE_HEIGHT;
    const dT = Math.abs(py);
    const dR = Math.abs(px - w);
    const dB = Math.abs(py - h);
    const dL = Math.abs(px);
    const min = Math.min(
        dT, dR, dB, dL,
    );
    if (min === dT) return px;
    if (min === dR) return w + py;
    if (min === dB) {
        return w + h + (w - px);
    }
    return 2 * w + h + (h - py);
}

function computePortPos(
    node: GraphNode,
    edges: GraphEdge[],
    nodeMap: Map<string, GraphNode>,
): { x: number; y: number } {
    const w = NODE_WIDTH;
    const h = NODE_HEIGHT;
    const perim = 2 * (w + h);
    const params: number[] = [];
    for (const e of edges) {
        let otherId: string | null = null;
        if (e.fromNodeId === node.id) {
            otherId = e.toNodeId;
        } else if (
            e.toNodeId === node.id
        ) {
            otherId = e.fromNodeId;
        }
        if (!otherId) continue;
        const other = nodeMap.get(otherId);
        if (!other) continue;
        const pt = perimeterPoint(
            node.positionX,
            node.positionY,
            w, h,
            other.positionX + w / 2,
            other.positionY + h / 2,
        );
        const localX =
            pt.x - node.positionX;
        const localY =
            pt.y - node.positionY;
        params.push(
            xyToPerim(localX, localY),
        );
    }
    if (params.length === 0) {
        return { x: w, y: h / 2 };
    }
    params.sort((a, b) => a - b);
    let bestGap = 0;
    let bestMid = w + h / 2;
    for (let i = 0;
        i < params.length; i++
    ) {
        const next =
            params[(i + 1)
                % params.length]!;
        const cur = params[i]!;
        const gap = i < params.length - 1
            ? next - cur
            : perim - cur + next;
        if (gap > bestGap) {
            bestGap = gap;
            const mid =
                (cur + gap / 2) % perim;
            bestMid = mid;
        }
    }
    return perimToXy(bestMid);
}

export function whichEdge(
    px: number, py: number,
    rx: number, ry: number,
    rw: number, rh: number,
): RectEdge {
    const dL = Math.abs(px - rx);
    const dR = Math.abs(px - rx - rw);
    const dT = Math.abs(py - ry);
    const dB = Math.abs(py - ry - rh);
    const min = Math.min(
        dL, dR, dT, dB,
    );
    if (min === dR) return 'right';
    if (min === dL) return 'left';
    if (min === dT) return 'top';
    return 'bottom';
}

export function controlOffset(
    edge: RectEdge,
    dist: number,
): { dx: number; dy: number } {
    const d = dist * CURVE_TENSION;
    switch (edge) {
        case 'right':
            return { dx: d, dy: 0 };
        case 'left':
            return { dx: -d, dy: 0 };
        case 'top':
            return { dx: 0, dy: -d };
        case 'bottom':
            return { dx: 0, dy: d };
    }
}

function buildDefs(): string {
    const gridCenter = GRID_CELL / 2;
    const arrowPath =
        `M 0 0 L ${ARROW_VIEWBOX}`
        + ` ${ARROW_MIDPOINT}`
        + ` L 0 ${ARROW_VIEWBOX} z`;
    const markerAttrs =
        ` viewBox="0 0`
        + ` ${ARROW_VIEWBOX}`
        + ` ${ARROW_VIEWBOX}"`
        + ` refX="${ARROW_VIEWBOX}"`
        + ` refY="${ARROW_MIDPOINT}"`
        + ` markerWidth="${ARROW_MARKER}"`
        + ` markerHeight="${ARROW_MARKER}"`
        + ' orient="auto-start-reverse">';
    const halfCell = GRID_CELL / 2;
    return '<defs>'
        + '<pattern id="wf-grid"'
        + ` width="${GRID_CELL}"`
        + ` height="${GRID_CELL}"`
        + ' patternUnits='
        + '"userSpaceOnUse"'
        + ` patternTransform="translate(`
        + `${-halfCell}, ${-halfCell})">`
        + `<circle cx="${gridCenter}"`
        + ` cy="${gridCenter}"`
        + ` r="${GRID_DOT_RADIUS}"`
        + ' fill="var('
        + '--color-muted-foreground,'
        + ' #5a6480)"/>'
        + '</pattern>'
        + '<marker id="wf-arrow"'
        + markerAttrs
        + `<path d="${arrowPath}"`
        + ` fill="${BLUE}"/>`
        + '</marker>'
        + '<marker id="wf-arrow-warn"'
        + markerAttrs
        + `<path d="${arrowPath}"`
        + ` fill="${WARN}"/>`
        + '</marker>'
        + '<filter id="wf-glow"'
        + ' x="-30%" y="-30%"'
        + ' width="160%"'
        + ' height="160%">'
        + '<feGaussianBlur'
        + ' in="SourceGraphic"'
        + ' stdDeviation="4"'
        + ' result="blur">'
        + '<animate'
        + ' attributeName='
        + '"stdDeviation"'
        + ' values="4;12;4"'
        + ' dur="1.5s"'
        + ' repeatCount='
        + '"indefinite"/>'
        + '</feGaussianBlur>'
        + '<feFlood'
        + ` flood-color="${BLUE}"`
        + ' flood-opacity="0.8"'
        + ' result="color"/>'
        + '<feComposite'
        + ' in="color"'
        + ' in2="blur"'
        + ' operator="in"'
        + ' result="glow"/>'
        + '<feMerge>'
        + '<feMergeNode'
        + ' in="glow"/>'
        + '<feMergeNode'
        + ' in="SourceGraphic"/>'
        + '</feMerge>'
        + '</filter>'
        + '</defs>';
}

const GRID_MIN_W = 1600;
const GRID_MIN_H = 1000;

function buildGrid(
    vbX: number,
    vbY: number,
    vbW: number,
    vbH: number,
): string {
    const gx = Math.min(
        vbX, -GRID_MIN_W / 2,
    );
    const gy = Math.min(
        vbY, -GRID_MIN_H / 2,
    );
    const gw = Math.max(
        vbW, GRID_MIN_W,
        vbX + vbW - gx,
    );
    const gh = Math.max(
        vbH, GRID_MIN_H,
        vbY + vbH - gy,
    );
    return '<rect'
        + ` x="${gx}" y="${gy}"`
        + ` width="${gw}"`
        + ` height="${gh}"`
        + ' fill="var('
        + '--color-surface, #1a1f2e)"/>'
        + '<rect'
        + ` x="${gx}" y="${gy}"`
        + ` width="${gw}"`
        + ` height="${gh}"`
        + ' fill="url(#wf-grid)"/>';
}

function truncateLabel(
    text: string,
    maxChars: number,
): string {
    return text.length > maxChars
        ? text.slice(0, maxChars - 1)
            + '\u2026'
        : text;
}

function buildNode(
    node: GraphNode,
    isSelected: boolean,
    isLocked: boolean,
    portPos: {
        x: number; y: number;
    } | null,
): SafeHtml {
    const { positionX, positionY } = node;
    const halfH = NODE_HEIGHT / 2;
    const halfW = NODE_WIDTH / 2;

    let borderColor = BLUE;
    let strokeW = STROKE_NORMAL;
    if (node.isStart || node.isComplete) {
        borderColor = GREEN;
        strokeW = node.isComplete
            ? STROKE_COMPLETE
            : STROKE_START;
    }

    const selAttr = isSelected
        ? ' filter="url(#wf-glow)"'
        : '';

    let inner = '';

    inner += '<rect'
        + ` width="${NODE_WIDTH}"`
        + ` height="${NODE_HEIGHT}"`
        + ` rx="${NODE_RADIUS}"`
        + ' fill="var('
        + '--color-card-bg, #232940)"'
        + ` stroke="${borderColor}"`
        + ` stroke-width="${strokeW}"/>`;

    if (node.isComplete) {
        inner += '<rect'
            + ` x="${COMPLETE_INSET}"`
            + ` y="${COMPLETE_INSET}"`
            + ` width="${
                NODE_WIDTH
                - COMPLETE_INSET * 2
            }"`
            + ` height="${
                NODE_HEIGHT
                - COMPLETE_INSET * 2
            }"`
            + ` rx="${COMPLETE_INNER_RADIUS}"`
            + ' fill="none"'
            + ` stroke="${GREEN}"`
            + ` stroke-width="`
            + `${COMPLETE_INNER_STROKE}"/>`;
    }

    const meta = node.isStart
        ? 'Start state'
        : node.isComplete
            ? 'End state'
            : String(node.fields.length)
                + ' field'
                + (node.fields.length !== 1
                    ? 's' : '');

    const nameEsc = escapeForHtml(
        truncateLabel(
            node.name, NODE_MAX_CHARS,
        ),
    );
    inner += '<text'
        + ` x="${halfW}"`
        + ` y="${NODE_LABEL_Y}"`
        + ' text-anchor="middle"'
        + ` font-size="${NODE_LABEL_FONT}"`
        + ' font-weight="600"'
        + ' fill="var('
        + '--color-foreground, #e0e4ef)">'
        + nameEsc + '</text>';

    inner += '<text'
        + ` x="${halfW}"`
        + ` y="${NODE_META_Y}"`
        + ' text-anchor="middle"'
        + ` font-size="${NODE_META_FONT}"`
        + ' fill="var('
        + '--color-muted-foreground,'
        + ' #5a6480)">'
        + escapeForHtml(meta)
        + '</text>';

    if (portPos) {
        inner += '<circle'
            + ' data-connect-port="1"'
            + ` cx="${portPos.x}"`
            + ` cy="${portPos.y}"`
            + ` r="${PORT_RADIUS}"`
            + ` fill="${BLUE}"`
            + ' stroke="var('
            + '--color-card-bg, #232940)"'
            + ` stroke-width=`
            + `"${PORT_STROKE}"`
            + ' style='
            + '"cursor:crosshair">'
            + '<title>'
            + 'Click and drag to create'
            + ' a new node attached here.'
            + ' Hold Shift to connect'
            + ' to an existing node'
            + ' instead.'
            + '</title>'
            + '</circle>';
    }

    return trusted(
        '<g'
        + ` data-node-id="${node.id}"`
        + ' transform="translate('
        + String(positionX)
        + ', '
        + String(positionY)
        + ')"'
        + selAttr
        + ' style="cursor:pointer">'
        + inner
        + '</g>',
    );
}

function buildEdge(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
    isSelected: boolean,
    aimOffset: number,
    isCycle: boolean,
): SafeHtml {
    const fromCx =
        fromNode.positionX
        + NODE_WIDTH / 2;
    const fromCy =
        fromNode.positionY
        + NODE_HEIGHT / 2;
    const toCx =
        toNode.positionX
        + NODE_WIDTH / 2;
    const toCy =
        toNode.positionY
        + NODE_HEIGHT / 2;

    let pathD: string;
    let color: string;
    let markerUrl: string;
    let dashAttr: string;

    let aimFromX = toCx;
    let aimFromY = toCy;
    let aimToX = fromCx;
    let aimToY = fromCy;

    if (aimOffset !== 0) {
        const dx = toCx - fromCx;
        const dy = toCy - fromCy;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            const px = -dy / len;
            const py = dx / len;
            const s =
                aimOffset * BIDI_SPREAD;
            aimFromX = toCx + px * s;
            aimFromY = toCy + py * s;
            aimToX = fromCx + px * s;
            aimToY = fromCy + py * s;
        }
    }

    const startPt = perimeterPoint(
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        aimFromX, aimFromY,
    );
    const endPt = perimeterPoint(
        toNode.positionX,
        toNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        aimToX, aimToY,
    );
    const dist = Math.hypot(
        endPt.x - startPt.x,
        endPt.y - startPt.y,
    );
    const se = whichEdge(
        startPt.x, startPt.y,
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const ee = whichEdge(
        endPt.x, endPt.y,
        toNode.positionX,
        toNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const cp1 =
        controlOffset(se, dist);
    const cp2 =
        controlOffset(ee, dist);
    pathD = 'M '
        + String(startPt.x) + ' '
        + String(startPt.y)
        + ' C '
        + String(
            startPt.x + cp1.dx,
        ) + ' '
        + String(
            startPt.y + cp1.dy,
        ) + ', '
        + String(
            endPt.x + cp2.dx,
        ) + ' '
        + String(
            endPt.y + cp2.dy,
        ) + ', '
        + String(endPt.x) + ' '
        + String(endPt.y);

    if (isCycle) {
        color = WARN;
        markerUrl =
            'url(#wf-arrow-warn)';
        dashAttr =
            ` stroke-dasharray="${
                CYCLE_DASH
            }"`;
    } else {
        color = BLUE;
        markerUrl = 'url(#wf-arrow)';
        dashAttr = '';
    }

    const sw = EDGE_STROKE;

    const hitPath = '<path'
        + ` d="${pathD}"`
        + ' fill="none"'
        + ' stroke="transparent"'
        + ` stroke-width="`
        + `${HIT_TARGET_WIDTH}"`
        + ' style="cursor:pointer"/>';

    const visPath = '<path'
        + ` d="${pathD}"`
        + ' fill="none"'
        + ` stroke="${color}"`
        + ` stroke-width="${sw}"`
        + dashAttr
        + ` marker-end="${markerUrl}"`;
    const visClose = ' style='
        + '"cursor:pointer"'
        + '/>';

    const labelT = aimOffset === 0
        ? BEZIER_MIDPOINT
        : edge.fromNodeId < edge.toNodeId
            ? BIDI_LABEL_T_FWD
            : BIDI_LABEL_T_REV;
    const mid = bezierAt(pathD, labelT);
    const midX = mid.x;
    const midY = mid.y;
    const edgeMaxChars = Math.floor(
        (LABEL_MAX_WIDTH - LABEL_PADDING)
        / LABEL_CHAR_WIDTH,
    );
    const truncEdge = truncateLabel(
        edge.name, edgeMaxChars,
    );
    const labelEsc =
        escapeForHtml(truncEdge);
    const labelLen = truncEdge.length;
    const labelW = Math.min(
        Math.max(
            labelLen * LABEL_CHAR_WIDTH
                + LABEL_PADDING,
            LABEL_MIN_WIDTH,
        ),
        LABEL_MAX_WIDTH,
    );

    const labelBg = '<rect'
        + ` x="${midX - labelW / 2}"`
        + ` y="${
            midY - LABEL_HEIGHT / 2
        }"`
        + ` width="${labelW}"`
        + ` height="${LABEL_HEIGHT}"`
        + ` rx="${LABEL_RADIUS}"`
        + ' fill="var('
        + '--color-card-bg, #232940)"'
        + ` stroke="${color}"`
        + ' stroke-width="1"'
        + ` opacity="${LABEL_BG_OPACITY}"/>`;

    const labelText = '<text'
        + ` x="${midX}"`
        + ` y="${
            midY + LABEL_TEXT_OFFSET_Y
        }"`
        + ' text-anchor="middle"'
        + ` font-size="${LABEL_FONT}"`
        + ' fill="var('
        + '--color-foreground,'
        + ' #e0e4ef)">'
        + labelEsc
        + '</text>';

    const edgeSelAttr = isSelected
        ? ' filter="url(#wf-glow)"'
        : '';
    return trusted(
        '<g'
        + ` data-edge-id="${edge.id}"`
        + edgeSelAttr
        + '>'
        + hitPath
        + visPath + visClose
        + labelBg
        + labelText
        + '</g>',
    );
}

export function buildEdgePreviewPath(
    fromNode: GraphNode,
    toNode: GraphNode,
    isCycle: boolean,
): string {
    const fromCx =
        fromNode.positionX
        + NODE_WIDTH / 2;
    const fromCy =
        fromNode.positionY
        + NODE_HEIGHT / 2;
    const toCx =
        toNode.positionX
        + NODE_WIDTH / 2;
    const toCy =
        toNode.positionY
        + NODE_HEIGHT / 2;
    const startPt = perimeterPoint(
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        toCx, toCy,
    );
    const endPt = perimeterPoint(
        toNode.positionX,
        toNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        fromCx, fromCy,
    );
    const dist = Math.hypot(
        endPt.x - startPt.x,
        endPt.y - startPt.y,
    );
    const se = whichEdge(
        startPt.x, startPt.y,
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const ee = whichEdge(
        endPt.x, endPt.y,
        toNode.positionX,
        toNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const cp1 = controlOffset(se, dist);
    const cp2 = controlOffset(ee, dist);
    const pathD = 'M '
        + String(startPt.x) + ' '
        + String(startPt.y)
        + ' C '
        + String(startPt.x + cp1.dx)
        + ' '
        + String(startPt.y + cp1.dy)
        + ', '
        + String(endPt.x + cp2.dx)
        + ' '
        + String(endPt.y + cp2.dy)
        + ', '
        + String(endPt.x) + ' '
        + String(endPt.y);
    const color = isCycle ? WARN : BLUE;
    const marker = isCycle
        ? 'url(#wf-arrow-warn)'
        : 'url(#wf-arrow)';
    const dashAttr = isCycle
        ? ' stroke-dasharray="'
            + CYCLE_DASH + '"'
        : '';
    return '<path'
        + ' d="' + pathD + '"'
        + ' fill="none"'
        + ` stroke="${color}"`
        + ` stroke-width="${EDGE_STROKE}"`
        + dashAttr
        + ` marker-end="${marker}"`
        + ' pointer-events="none"/>';
}

function bezierAt(
    pathD: string,
    t: number,
): { x: number; y: number } {
    const parts = pathD.split(/[,\s]+/);
    const coords = parts
        .map(Number)
        .filter(n => !isNaN(n));
    if (coords.length < 8) {
        return {
            x: coords[0] ?? 0,
            y: coords[1] ?? 0,
        };
    }
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: u3 * coords[0]!
            + 3 * u2 * t * coords[2]!
            + 3 * u * t2 * coords[4]!
            + t3 * coords[6]!,
        y: u3 * coords[1]!
            + 3 * u2 * t * coords[3]!
            + 3 * u * t2 * coords[5]!
            + t3 * coords[7]!,
    };
}

export function buildGraphSvg(
    nodes: GraphNode[],
    edges: GraphEdge[],
    viewBoxX: number,
    viewBoxY: number,
    viewBoxW: number,
    viewBoxH: number,
    selection: Selection,
    isLocked: boolean,
    isConnecting: boolean,
): SafeHtml {
    const nodeMap = new Map(
        nodes.map(n => [n.id, n]),
    );

    const adj = buildAdjacency(
        edges.map(e => ({
            fromId: e.fromNodeId,
            toId: e.toNodeId,
        })),
    );
    const cycleEdgeIds =
        new Set<string>();
    for (const edge of edges) {
        if (isReachable(
            edge.toNodeId,
            edge.fromNodeId,
            adj,
        )) {
            cycleEdgeIds.add(edge.id);
        }
    }

    const pairKey = (
        a: string, b: string,
    ): string =>
        a < b
            ? a + ':' + b
            : b + ':' + a;
    const pairCounts =
        new Map<string, number>();
    for (const edge of edges) {
        const k = pairKey(
            edge.fromNodeId,
            edge.toNodeId,
        );
        pairCounts.set(
            k,
            (pairCounts.get(k) ?? 0) + 1,
        );
    }
    const bidi = new Set<string>();
    for (const [k, c] of pairCounts) {
        if (c >= 2) bidi.add(k);
    }

    let edgeMarkup = '';
    for (const edge of edges) {
        const fromNode =
            nodeMap.get(edge.fromNodeId);
        const toNode =
            nodeMap.get(edge.toNodeId);
        if (!fromNode || !toNode) continue;
        const isSelected =
            selection.kind === 'edge'
            && edge.id
                === selection.edgeId;
        let aimOffset = 0;
        const k = pairKey(
            edge.fromNodeId,
            edge.toNodeId,
        );
        if (bidi.has(k)) {
            aimOffset = 1;
        }
        edgeMarkup +=
            buildEdge(
                edge,
                fromNode,
                toNode,
                isSelected,
                aimOffset,
                cycleEdgeIds.has(
                    edge.id,
                ),
            ).toString();
    }

    let nodeMarkup = '';
    for (const node of nodes) {
        const isSelected =
            selection.kind === 'node'
            && node.id
                === selection.nodeId;
        const isSpecial =
            node.isStart
            || node.isComplete;
        const hasEdges = isSpecial
            && edges.some(
                e =>
                    e.fromNodeId
                        === node.id
                    || e.toNodeId
                        === node.id,
            );
        const showPort = !isLocked
            && (!isSpecial || !hasEdges);
        const portPos = showPort
            ? computePortPos(
                node, edges, nodeMap,
            )
            : null;
        nodeMarkup +=
            buildNode(
                node, isSelected,
                isLocked, portPos,
            ).toString();
    }

    const vb = String(viewBoxX)
        + ' ' + String(viewBoxY)
        + ' ' + String(viewBoxW)
        + ' ' + String(viewBoxH);

    const svgCls = isConnecting
        ? 'wf-canvas wf-connecting'
        : 'wf-canvas';
    return trusted(
        '<svg'
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ` class="${svgCls}"`
        + ` viewBox="${vb}"`
        + ' preserveAspectRatio="none"'
        + ' width="100%"'
        + ' height="100%"'
        + ' style="display:block">'
        + buildDefs()
        + buildGrid(
            viewBoxX, viewBoxY,
            viewBoxW, viewBoxH,
        )
        + edgeMarkup
        + nodeMarkup
        + '</svg>',
    );
}
