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
} from './flow-layout';
import { pluralize } from './format';

export const BLUE = '#4B6CA1';
const WARN = '#d97706';
const GREEN = '#16a34a';
const RED = '#b91c1c';

const GRID_CELL = 24;
const GRID_DOT_RADIUS = 0.7;

const ARROW_VIEWBOX = 10;
const ARROW_MIDPOINT = 5;
const ARROW_MARKER = 8;


const STROKE_NORMAL = 2;
const STROKE_START = 2.5;
const STROKE_COMPLETE = 3;

const NODE_RADIUS = 10;

const PORT_RADIUS = 5;
const PORT_STROKE = 2;

const NODE_LABEL_Y = 26;
const NODE_LABEL_Y_CENTERED = 38;
const NODE_LABEL_FONT = 13;
const NODE_META_Y = 45;
const NODE_META_FONT = 11;
const NODE_MAX_CHARS = 18;
const LABEL_MAX_WIDTH = 140;

const EDGE_STROKE = 2;
const HIT_TARGET_WIDTH = 12;
const CURVE_TENSION = 0.25;
const MAX_CONTROL_ARM = 50;
const BEZIER_MIDPOINT = 0.5;
const BIDI_SPREAD_FRAC = 0.08;
const BIDI_SPREAD_MIN = 20;
const BIDI_SPREAD_MAX = 80;
const BIDI_LABEL_T = 0.47;
const BIDI_LABEL_OFFSET = 12;

const CYCLE_DASH = '6 3';

const LABEL_CHAR_WIDTH = 7;
const LABEL_PADDING = 12;
const LABEL_MIN_WIDTH = 36;
const LABEL_HEIGHT = 20;
const LABEL_RADIUS = 4;
const LABEL_BG_OPACITY = 0.9;
const LABEL_TEXT_OFFSET_Y = 4;
const LABEL_FONT = 11;

const BEZIER_ORIGIN = 0;

const NODE_ROLE = 'button';
const EDGE_ROLE = 'button';
const FOCUSABLE_TABINDEX = '0';

export type RectEdge =
    'right' | 'left' | 'top' | 'bottom';

function getOtherNodeId(
    edge: GraphEdge,
    nodeId: string,
): string | null {
    if (edge.fromNodeId === nodeId) {
        return edge.toNodeId;
    }
    if (edge.toNodeId === nodeId) {
        return edge.fromNodeId;
    }
    return null;
}

function canonicalEdgeKey(
    a: string,
    b: string,
): string {
    return a < b
        ? a + ':' + b
        : b + ':' + a;
}

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
    const scale = Math.min(sx, sy);
    return {
        x: cx + dx * scale,
        y: cy + dy * scale,
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
    const params = edges.flatMap(e => {
        const otherId =
            getOtherNodeId(e, node.id);
        if (!otherId) return [];
        const other =
            nodeMap.get(otherId);
        if (!other) return [];
        const pt = perimeterPoint(
            node.positionX,
            node.positionY,
            w, h,
            other.positionX + w / 2,
            other.positionY + h / 2,
        );
        return [xyToPerim(
            pt.x - node.positionX,
            pt.y - node.positionY,
        )];
    }).toSorted((a, b) => a - b);
    if (params.length === 0) {
        return { x: w, y: h / 2 };
    }
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
    const d = Math.min(
        dist * CURVE_TENSION,
        MAX_CONTROL_ARM,
    );
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
        + '<pattern id="flow-grid"'
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
        + '<marker id="flow-arrow"'
        + markerAttrs
        + `<path d="${arrowPath}"`
        + ` fill="${BLUE}"/>`
        + '</marker>'
        + '<marker id="flow-arrow-warn"'
        + markerAttrs
        + `<path d="${arrowPath}"`
        + ` fill="${WARN}"/>`
        + '</marker>'
        + '<filter id="flow-glow"'
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

function buildGrid(
    vbX: number,
    vbY: number,
    vbW: number,
    vbH: number,
): string {
    return '<rect'
        + ' class="flow-grid-bg"'
        + ` x="${vbX}" y="${vbY}"`
        + ` width="${vbW}"`
        + ` height="${vbH}"`
        + ' fill="var('
        + '--color-surface, #1a1f2e)"/>'
        + '<rect'
        + ` x="${vbX}" y="${vbY}"`
        + ` width="${vbW}"`
        + ` height="${vbH}"`
        + ' fill="url(#flow-grid)"/>';
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

function truncateEdgeLabel(
    name: string,
): string {
    const maxChars = Math.floor(
        (LABEL_MAX_WIDTH - LABEL_PADDING)
        / LABEL_CHAR_WIDTH,
    );
    return truncateLabel(name, maxChars);
}

export function computeEdgeLabelWidth(
    name: string,
): number {
    const trunc = truncateEdgeLabel(name);
    return Math.min(
        Math.max(
            trunc.length * LABEL_CHAR_WIDTH
                + LABEL_PADDING,
            LABEL_MIN_WIDTH,
        ),
        LABEL_MAX_WIDTH,
    );
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
    if (node.isStart) {
        borderColor = GREEN;
        strokeW = STROKE_START;
    } else if (node.isComplete) {
        borderColor = RED;
        strokeW = STROKE_COMPLETE;
    }

    const selAttr = isSelected
        ? ' filter="url(#flow-glow)"'
        : '';

    let inner = '';

    inner += '<rect'
        + ` width="${NODE_WIDTH}"`
        + ` height="${NODE_HEIGHT}"`
        + ` rx="${NODE_RADIUS}"`
        + ' fill="var('
        + '--color-card-bg)"'
        + ` stroke="${borderColor}"`
        + ` stroke-width="${strokeW}"/>`;

    const isSpecial =
        node.isStart || node.isComplete;
    const labelY = isSpecial
        ? NODE_LABEL_Y_CENTERED
        : NODE_LABEL_Y;

    const nameEsc = escapeForHtml(
        truncateLabel(
            node.name, NODE_MAX_CHARS,
        ),
    );
    inner += '<text'
        + ` x="${halfW}"`
        + ` y="${labelY}"`
        + ' text-anchor="middle"'
        + ` font-size="${NODE_LABEL_FONT}"`
        + ' font-weight="600"'
        + ' fill="var('
        + '--color-foreground, #e0e4ef)">'
        + nameEsc + '</text>';

    if (!isSpecial) {
        const meta = String(node.fields.length)
            + ' '
            + pluralize(
                node.fields.length, 'field',
            );
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
    }

    if (portPos) {
        inner += '<circle'
            + ' data-connect-port="1"'
            + ` cx="${portPos.x}"`
            + ` cy="${portPos.y}"`
            + ` r="${PORT_RADIUS}"`
            + ` fill="${BLUE}"`
            + ' stroke="var('
            + '--color-card-bg)"'
            + ` stroke-width=`
            + `"${PORT_STROKE}">`
            + '<title>'
            + 'Click and drag to create'
            + ' a new node attached here.'
            + ' Hold Shift to connect'
            + ' to an existing node'
            + ' instead.'
            + '</title>'
            + '</circle>';
    }

    const labelEsc = escapeForHtml(node.name);
    const ariaCurrent = isSelected
        ? ' aria-current="true"' : '';
    return trusted(
        '<g'
        + ` data-node-id="${node.id}"`
        + ' class="flow-node"'
        + ` role="${NODE_ROLE}"`
        + ` tabindex="${FOCUSABLE_TABINDEX}"`
        + ` aria-label="${labelEsc}"`
        + ariaCurrent
        + ' transform="translate('
        + String(positionX)
        + ', '
        + String(positionY)
        + ')"'
        + selAttr
        + '>'
        + `<title>${labelEsc}</title>`
        + inner
        + '</g>',
    );
}

function buildWaypointPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    waypoints: readonly {
        x: number;
        y: number;
    }[],
): string {
    const pts = [start, ...waypoints, end];
    let d = 'M '
        + String(pts[0]!.x) + ' '
        + String(pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1]!;
        const curr = pts[i]!;
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        if (i === 1) {
            d += ' Q '
                + String(prev.x) + ' '
                + String(prev.y) + ' '
                + String(mx) + ' '
                + String(my);
        } else {
            d += ' T '
                + String(mx) + ' '
                + String(my);
        }
    }
    const last = pts[pts.length - 1]!;
    d += ' T '
        + String(last.x) + ' '
        + String(last.y);
    return d;
}

function buildEdge(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
    isSelected: boolean,
    aimOffset: number,
    isCycle: boolean,
    waypoints: readonly {
        x: number;
        y: number;
    }[],
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

    let perpX = 0;
    let perpY = 0;
    let spread = 0;

    if (aimOffset !== 0) {
        const dx = toCx - fromCx;
        const dy = toCy - fromCy;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            perpX = -dy / len;
            perpY = dx / len;
            spread =
                aimOffset * Math.min(
                    BIDI_SPREAD_MAX,
                    Math.max(
                        BIDI_SPREAD_MIN,
                        len * BIDI_SPREAD_FRAC,
                    ),
                );
            aimFromX = toCx + perpX * spread;
            aimFromY = toCy + perpY * spread;
            aimToX = fromCx + perpX * spread;
            aimToY = fromCy + perpY * spread;
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
    if (waypoints.length > 0) {
        pathD = buildWaypointPath(
            startPt, endPt, waypoints,
        );
    } else {
        const cp1 =
            controlOffset(se, dist);
        const cp2 =
            controlOffset(ee, dist);
        const cp1X = startPt.x + cp1.dx;
        const cp1Y = startPt.y + cp1.dy;
        const cp2X = endPt.x + cp2.dx;
        const cp2Y = endPt.y + cp2.dy;
        pathD = 'M '
            + String(startPt.x) + ' '
            + String(startPt.y)
            + ' C '
            + String(cp1X) + ' '
            + String(cp1Y) + ', '
            + String(cp2X) + ' '
            + String(cp2Y) + ', '
            + String(endPt.x) + ' '
            + String(endPt.y);
    }

    if (isCycle) {
        color = WARN;
        markerUrl =
            'url(#flow-arrow-warn)';
        dashAttr =
            ` stroke-dasharray="${
                CYCLE_DASH
            }"`;
    } else {
        color = BLUE;
        markerUrl = 'url(#flow-arrow)';
        dashAttr = '';
    }

    const sw = EDGE_STROKE;

    if (fromNode.isStart) {
        return trusted(
            '<g aria-hidden="true">'
            + '<path'
            + ` d="${pathD}"`
            + ' fill="none"'
            + ` stroke="${color}"`
            + ` stroke-width="${sw}"`
            + dashAttr
            + ` marker-end="${markerUrl}"/>`
            + '</g>',
        );
    }

    const hitPath = '<path'
        + ` d="${pathD}"`
        + ' fill="none"'
        + ' stroke="transparent"'
        + ` stroke-width="`
        + `${HIT_TARGET_WIDTH}"/>`;

    const visPath = '<path'
        + ` d="${pathD}"`
        + ' fill="none"'
        + ` stroke="${color}"`
        + ` stroke-width="${sw}"`
        + dashAttr
        + ` marker-end="${markerUrl}"`;
    const visClose = '/>';

    const labelT = aimOffset === 0
        ? BEZIER_MIDPOINT
        : BIDI_LABEL_T;
    const mid = bezierAt(pathD, labelT);
    const midX = mid.x
        + perpX * BIDI_LABEL_OFFSET;
    const midY = mid.y
        + perpY * BIDI_LABEL_OFFSET;
    const truncEdge =
        truncateEdgeLabel(edge.name);
    const labelEsc =
        escapeForHtml(truncEdge);
    const labelW =
        computeEdgeLabelWidth(edge.name);

    const labelBg = '<rect'
        + ` x="${midX - labelW / 2}"`
        + ` y="${
            midY - LABEL_HEIGHT / 2
        }"`
        + ` width="${labelW}"`
        + ` height="${LABEL_HEIGHT}"`
        + ` rx="${LABEL_RADIUS}"`
        + ' fill="var('
        + '--color-card-bg)"'
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
        ? ' filter="url(#flow-glow)"'
        : '';
    const ariaCurrent = isSelected
        ? ' aria-current="true"' : '';
    const ariaLabel =
        escapeForHtml(fromNode.name)
        + ' to '
        + escapeForHtml(toNode.name)
        + ': '
        + escapeForHtml(edge.name);
    return trusted(
        '<g'
        + ` data-edge-id="${edge.id}"`
        + ' class="flow-edge"'
        + ` role="${EDGE_ROLE}"`
        + ` tabindex="${FOCUSABLE_TABINDEX}"`
        + ` aria-label="${ariaLabel}"`
        + ariaCurrent
        + edgeSelAttr
        + '>'
        + `<title>${ariaLabel}</title>`
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
        ? 'url(#flow-arrow-warn)'
        : 'url(#flow-arrow)';
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

// Cubic Bézier B(t) = u³P0 + 3u²t P1 + 3ut² P2 + t³P3
// where u = 1-t, P0..P3 are the control points.
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
            x: coords[0] ?? BEZIER_ORIGIN,
            y: coords[1] ?? BEZIER_ORIGIN,
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
    marqueeRect: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null,
    edgeWaypoints: ReadonlyMap<
        string,
        readonly { x: number; y: number }[]
    >,
): SafeHtml {
    const nodeMap = new Map(
        nodes.map(n => [n.id, n]),
    );

    const outAdj = new Map<string, GraphEdge[]>();
    for (const n of nodes) {
        outAdj.set(n.id, []);
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
        const outs = outAdj.get(id) ?? [];
        for (const e of outs) {
            if (onStack.has(e.toNodeId)) {
                cycleEdgeIds.add(e.id);
            } else if (!visited.has(e.toNodeId)) {
                dfs(e.toNodeId);
            }
        }
        onStack.delete(id);
    };
    const startNode = nodes.find(n => n.isStart);
    if (startNode) dfs(startNode.id);
    for (const n of nodes) {
        if (!visited.has(n.id)) dfs(n.id);
    }

    const pairCounts =
        new Map<string, number>();
    for (const edge of edges) {
        const k = canonicalEdgeKey(
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
        let aimOffset = 0;
        const k = canonicalEdgeKey(
            edge.fromNodeId,
            edge.toNodeId,
        );
        if (bidi.has(k)) {
            aimOffset = 1;
        }
        const isSelected =
            selection.kind === 'edge'
            && edge.id === selection.edgeId;
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
                edgeWaypoints.get(edge.id)
                    ?? [],
            ).toString();
    }

    const selectedNodeIds =
        selection.kind === 'nodes'
            ? selection.nodeIds
            : new Set<string>();
    let nodeMarkup = '';
    for (const node of nodes) {
        const isSelected =
            selectedNodeIds.has(node.id);
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

    let svgCls = 'flow-canvas';
    if (isConnecting) {
        svgCls += ' flow-connecting';
    }
    if (isLocked) {
        svgCls += ' flow-canvas-locked';
    }

    let marqueeMarkup = '';
    if (marqueeRect) {
        marqueeMarkup = '<rect'
            + ` x="${marqueeRect.x}"`
            + ` y="${marqueeRect.y}"`
            + ` width="${marqueeRect.w}"`
            + ` height="${marqueeRect.h}"`
            + ' aria-hidden="true"'
            + ' class="flow-marquee"/>';
    }

    const stateLabel =
        nodes.length === 1
            ? '1 state' : `${nodes.length} states`;
    const transitionLabel =
        edges.length === 1
            ? '1 transition'
            : `${edges.length} transitions`;
    const canvasLabel =
        `Flow designer canvas: ${stateLabel}, `
        + transitionLabel;

    return trusted(
        '<svg'
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ` class="${svgCls}"`
        + ' role="application"'
        + ` aria-label="${canvasLabel}"`
        + ` viewBox="${vb}"`
        + ' preserveAspectRatio='
        + '"xMidYMid meet"'
        + ' width="100%"'
        + ' height="100%">'
        + buildDefs()
        + buildGrid(
            viewBoxX, viewBoxY,
            viewBoxW, viewBoxH,
        )
        + edgeMarkup
        + nodeMarkup
        + marqueeMarkup
        + '</svg>',
    );
}
