import type { SafeHtml } from './safe-html.ts';
import { trusted, escapeForHtml } from './safe-html.ts';
import type {
    GraphNode, GraphEdge,
} from './adapters/flows.ts';
import type {
    Selection,
    ConnectMode,
} from './flow-interactions.ts';
import {
    NODE_WIDTH, NODE_HEIGHT,
    wouldBeCycle,
} from './flow-layout.ts';
import { pluralize } from './format.ts';
import { findCycleEdgeIds } from './flow-cycle-edges.ts';
import {
    iconAlertTriangle,
    iconNoEntry,
} from './icons.ts';

function nodeHasConnections(
    nodeId: string,
    edges: readonly GraphEdge[],
): boolean {
    return edges.some(
        e =>
            e.fromNodeId === nodeId
            || e.toNodeId === nodeId,
    );
}

function canShowPort(
    isLocked: boolean,
    isSpecial: boolean,
    hasConnections: boolean,
): boolean {
    return !isLocked
        && (!isSpecial || !hasConnections);
}

// Flow-canvas palette, centralized so one edit reskins the
// whole SVG. hsl(var(--token)) resolves inside SVG exactly as
// in CSS — theme-reactive, no raw hex. BLUE stays exported for
// the designer presenter.
export const BLUE = 'hsl(var(--primary))';
const WARN = 'hsl(var(--warning))';
const GREEN = 'hsl(var(--success))';
const RED = 'hsl(var(--error))';
const SURFACE = 'hsl(var(--background))';
const FOREGROUND = 'hsl(var(--foreground))';
const MUTED = 'hsl(var(--muted-foreground))';

export const GRID_CELL = 24;
const GRID_DOT_RADIUS = 0.7;

// Glow filter on highlighted edges. Filter
// region overflows the source by 30% on
// each side (160% total) so the blur
// doesn't clip. stdDeviation animates
// between min (resting) and peak (pulse)
// to give the glow a breathing motion.
const GLOW_FILTER_OVERFLOW_PCT = 30;
const GLOW_FILTER_SCALE_PCT = 160;
const GLOW_BLUR_MIN = 4;
const GLOW_BLUR_PEAK = 12;
const GLOW_ANIMATION_DURATION = '1.5s';

const ARROW_VIEWBOX = 10;
const ARROW_MIDPOINT = 5;
const ARROW_MARKER = 8;


const STROKE_NORMAL = 2;
const STROKE_START = 2.5;
const STROKE_COMPLETE = 3;

export const NODE_RADIUS = 10;

const PORT_RADIUS = 5;
const PORT_STROKE = 2;

// Node text geometry. Coordinates are
// SVG units relative to a 64-px-tall
// node rectangle. NODE_LABEL_Y is the
// baseline for two-line labels;
// NODE_LABEL_Y_CENTERED is the baseline
// for single-line labels (offset down
// for vertical centering). NODE_META_Y
// is the optional second line (status
// text) below the label.
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

// Exported: the design-system showcase renders edge
// labels with the same geometry — one source, no copy
// to desynchronize.
export const CYCLE_DASH = '6 3';

export const LABEL_CHAR_WIDTH = 7;
export const LABEL_PADDING = 12;
const LABEL_MIN_WIDTH = 36;
export const LABEL_HEIGHT = 20;
const LABEL_RADIUS = 4;
const LABEL_BG_OPACITY = 0.9;
export const LABEL_TEXT_OFFSET_Y = 4;
const LABEL_FONT = 11;

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
    const perimeterDistances = edges.flatMap(e => {
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
    if (perimeterDistances.length === 0) {
        return { x: w, y: h / 2 };
    }
    let bestGap = 0;
    let bestMid = w + h / 2;
    for (let i = 0;
        i < perimeterDistances.length; i++
    ) {
        const next =
            perimeterDistances[(i + 1)
                % perimeterDistances.length]!;
        const cur = perimeterDistances[i]!;
        const gap = i < perimeterDistances.length - 1
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
        + ` fill="${MUTED}"/>`
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
        + ` x="-${GLOW_FILTER_OVERFLOW_PCT}%"`
        + ` y="-${GLOW_FILTER_OVERFLOW_PCT}%"`
        + ` width="${GLOW_FILTER_SCALE_PCT}%"`
        + ` height="${GLOW_FILTER_SCALE_PCT}%">`
        + '<feGaussianBlur'
        + ' in="SourceGraphic"'
        + ` stdDeviation="${GLOW_BLUR_MIN}"`
        + ' result="blur">'
        + '<animate'
        + ' attributeName='
        + '"stdDeviation"'
        + ` values="${GLOW_BLUR_MIN};`
        + `${GLOW_BLUR_PEAK};`
        + `${GLOW_BLUR_MIN}"`
        + ` dur="${GLOW_ANIMATION_DURATION}"`
        + ' repeatCount='
        + '"indefinite"/>'
        + '</feGaussianBlur>'
        + '<feFlood'
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
        + ` fill="${SURFACE}"/>`
        + '<rect'
        + ' class="flow-grid-dots"'
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
            + '…'
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

export type MemberHazardLevel = 'warning' | 'danger';

export function shouldShowMemberHazard(
    node: GraphNode,
    allEdges: readonly GraphEdge[],
): MemberHazardLevel | null {
    if (node.isCreate || node.isArchive) return null;
    const outCount = allEdges
        .filter(e => e.fromNodeId === node.id)
        .length;
    if (node.memberIds.length === 0) return 'danger';
    if (outCount === 0) return 'danger';
    if (node.memberIds.length === 1) return 'warning';
    return null;
}

function buildNode(
    node: GraphNode,
    edges: readonly GraphEdge[],
    isSelected: boolean,
    portPos: {
        x: number; y: number;
    } | null,
): SafeHtml {
    const { positionX, positionY } = node;
    const halfW = NODE_WIDTH / 2;

    let borderColor = BLUE;
    let strokeW = STROKE_NORMAL;
    if (node.isCreate) {
        borderColor = GREEN;
        strokeW = STROKE_START;
    } else if (node.isArchive) {
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
        node.isCreate || node.isArchive;
    const labelY = isSpecial
        ? NODE_LABEL_Y_CENTERED
        : NODE_LABEL_Y;

    const displayName = node.name;
    const nameEsc = escapeForHtml(
        truncateLabel(
            displayName, NODE_MAX_CHARS,
        ),
    );
    inner += '<text'
        + ` x="${halfW}"`
        + ` y="${labelY}"`
        + ' text-anchor="middle"'
        + ` font-size="${NODE_LABEL_FONT}"`
        + ' font-weight="600"'
        + ` fill="${FOREGROUND}">`
        + nameEsc + '</text>';

    if (!isSpecial) {
        const meta =
            String(node.attributes.length)
            + ' '
            + pluralize(
                node.attributes.length,
                'attribute',
            );
        inner += '<text'
            + ` x="${halfW}"`
            + ` y="${NODE_META_Y}"`
            + ' text-anchor="middle"'
            + ` font-size="${NODE_META_FONT}"`
            + ` fill="${MUTED}">`
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

    const hazardLevel =
        shouldShowMemberHazard(node, edges);
    if (hazardLevel === 'warning') {
        inner += '<g'
            + ' class="flow-node-warning"'
            + ' transform="translate(6, 42)">'
            + '<title>'
            + 'Single member assigned (no backup)'
            + '</title>'
            + iconAlertTriangle(16, '')
                .toString()
            + '</g>';
    } else if (hazardLevel === 'danger') {
        const dangerTitle =
            node.memberIds.length === 0
                ? 'Members required'
                : 'Dead end (no outgoing edges)';
        inner += '<g'
            + ' class="flow-node-danger"'
            + ' transform="translate(6, 42)">'
            + '<title>'
            + dangerTitle
            + '</title>'
            + iconNoEntry(16, '')
                .toString()
            + '</g>';
    }

    const idEsc = escapeForHtml(node.id);
    const labelEsc = escapeForHtml(displayName);
    const ariaCurrent = isSelected
        ? ' aria-current="true"' : '';
    return trusted(
        '<g'
        + ` data-node-id="${idEsc}"`
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

// The drawable geometry of one edge: the routed path
// and the label anchor along it. Pure math shared by
// the full SVG rebuild (buildEdge) and the narrow
// in-gesture mutator (flow-gesture-render.ts) — one
// truth, so a dragged edge can never drift from its
// rebuilt form.
export interface EdgeGeometry {
    pathD: string;
    labelX: number;
    labelY: number;
}

export function computeEdgeGeometry(
    fromNode: GraphNode,
    toNode: GraphNode,
    aimOffset: number,
    waypoints: readonly {
        x: number;
        y: number;
    }[],
): EdgeGeometry {
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
    const startEdge = whichEdge(
        startPt.x, startPt.y,
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const endEdge = whichEdge(
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
        const startControl =
            controlOffset(startEdge, dist);
        const endControl =
            controlOffset(endEdge, dist);
        const cp1X =
            startPt.x + startControl.dx;
        const cp1Y =
            startPt.y + startControl.dy;
        const cp2X =
            endPt.x + endControl.dx;
        const cp2Y =
            endPt.y + endControl.dy;
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

    const labelT = aimOffset === 0
        ? BEZIER_MIDPOINT
        : BIDI_LABEL_T;
    // Base anchor on the routed path; the perpendicular offset
    // below is the INTENTIONAL nudge that keeps two-way edge
    // labels legible. A waypoint edge is a Q/T polyline, so
    // anchor along it — bezierAt is for the cubic case only.
    const mid = waypoints.length > 0
        ? pointAlongPolyline(
            [startPt, ...waypoints, endPt], labelT)
        : bezierAt(pathD, labelT);
    return {
        pathD,
        labelX: mid.x
            + perpX * BIDI_LABEL_OFFSET,
        labelY: mid.y
            + perpY * BIDI_LABEL_OFFSET,
    };
}

// aimOffset per edge id: 1 when the edge belongs to a
// two-way pair (each direction bows to its own side),
// else 0. One computation feeds both the full rebuild
// and the narrow in-gesture mutator.
export function computeEdgeAimOffsets(
    edges: readonly GraphEdge[],
): Map<string, number> {
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
    const offsets = new Map<string, number>();
    for (const edge of edges) {
        const k = canonicalEdgeKey(
            edge.fromNodeId,
            edge.toNodeId,
        );
        offsets.set(
            edge.id,
            (pairCounts.get(k) ?? 0) >= 2
                ? 1 : 0,
        );
    }
    return offsets;
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
    const geo = computeEdgeGeometry(
        fromNode, toNode, aimOffset, waypoints,
    );
    const pathD = geo.pathD;

    let color: string;
    let markerUrl: string;
    let dashAttr: string;

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

    const strokeWidth = EDGE_STROKE;

    // data-edge-ref marks BOTH edge group variants for the
    // narrow in-gesture mutator. The interaction layer keys
    // on data-edge-id alone, so the Create-node edge stays
    // non-interactive.
    const idEsc = escapeForHtml(edge.id);

    if (fromNode.isCreate) {
        return trusted(
            '<g'
            + ` data-edge-ref="${idEsc}"`
            + ' aria-hidden="true">'
            + '<path'
            + ` d="${pathD}"`
            + ' fill="none"'
            + ` stroke="${color}"`
            + ` stroke-width="${strokeWidth}"`
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
        + ` stroke-width="${strokeWidth}"`
        + dashAttr
        + ` marker-end="${markerUrl}"`;
    const visClose = '/>';

    const midX = geo.labelX;
    const midY = geo.labelY;
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
        + ` fill="${FOREGROUND}">`
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
        + ` data-edge-id="${idEsc}"`
        + ` data-edge-ref="${idEsc}"`
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

// The in-flight connection gesture's ghost markup: a
// would-be edge to a hovered target (Shift), a dangling
// line (Shift, no target), or a ghost "New State" node at
// the pointer. One string build serves the full canvas
// rebuild and the narrow in-gesture mutator, which
// re-renders only this layer per frame.
export function buildConnectPreview(
    connect: ConnectMode,
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
): string {
    if (connect.kind !== 'connecting') {
        return '';
    }
    const fromNode = nodes.find(
        n => n.id === connect.fromNodeId,
    );
    if (!fromNode) return '';
    const src = perimeterPoint(
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        connect.toX, connect.toY,
    );
    if (connect.isShift) {
        if (
            connect.target.kind === 'node'
        ) {
            const targetId =
                connect.target.id;
            const toNode = nodes.find(
                n => n.id === targetId,
            );
            if (toNode) {
                const isCycle =
                    wouldBeCycle(
                        connect.fromNodeId,
                        targetId,
                        edges.map(e => ({
                            fromId:
                                e.fromNodeId,
                            toId:
                                e.toNodeId,
                        })),
                    );
                return buildEdgePreviewPath(
                    fromNode,
                    toNode,
                    isCycle,
                );
            }
        }
        return '<line'
            + ` x1="${src.x}"`
            + ` y1="${src.y}"`
            + ` x2="${connect.toX}"`
            + ` y2="${connect.toY}"`
            + ' stroke='
            + '"var('
            + '--color-muted-foreground,'
            + ' #5a6480)"'
            + ' stroke-width="2"'
            + ' opacity="0.5"'
            + ' pointer-events="none"/>';
    }
    const gx =
        connect.toX - NODE_WIDTH / 2;
    const gy =
        connect.toY - NODE_HEIGHT / 2;
    const halfW = NODE_WIDTH / 2;
    const fromCx =
        fromNode.positionX + halfW;
    const fromCy =
        fromNode.positionY
        + NODE_HEIGHT / 2;
    const endPt = perimeterPoint(
        gx, gy,
        NODE_WIDTH, NODE_HEIGHT,
        fromCx, fromCy,
    );
    const dist = Math.hypot(
        endPt.x - src.x,
        endPt.y - src.y,
    );
    const se = whichEdge(
        src.x, src.y,
        fromNode.positionX,
        fromNode.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const ee = whichEdge(
        endPt.x, endPt.y,
        gx, gy,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const cp1 = controlOffset(
        se, dist,
    );
    const cp2 = controlOffset(
        ee, dist,
    );
    const pathD = 'M '
        + String(src.x) + ' '
        + String(src.y)
        + ' C '
        + String(src.x + cp1.dx)
        + ' '
        + String(src.y + cp1.dy)
        + ', '
        + String(endPt.x + cp2.dx)
        + ' '
        + String(endPt.y + cp2.dy)
        + ', '
        + String(endPt.x) + ' '
        + String(endPt.y);
    return '<path'
        + ' d="' + pathD + '"'
        + ' fill="none"'
        + ` stroke="${BLUE}"`
        + ' stroke-width="2"'
        + ' opacity="0.3"'
        + ' marker-end='
        + '"url(#flow-arrow)"'
        + ' pointer-events='
        + '"none"/>'
        + '<g transform="translate('
        + String(gx) + ', '
        + String(gy) + ')"'
        + ' opacity="0.3"'
        + ' pointer-events="none">'
        + '<rect'
        + ` width="${NODE_WIDTH}"`
        + ` height="${NODE_HEIGHT}"`
        + ' rx="10"'
        + ' fill="var('
        + '--color-card-bg)"'
        + ` stroke="${BLUE}"`
        + ' stroke-width="2"/>'
        + '<text'
        + ` x="${halfW}"`
        + ' y="22"'
        + ' text-anchor="middle"'
        + ' font-size="14"'
        + ' font-weight="600"'
        + ' fill="var('
        + '--color-foreground,'
        + ' #e0e4ef)">'
        + 'New State</text>'
        + '</g>';
}

// The point at fraction `t` of a polyline's arc length. A
// waypoint edge renders as a Q/T quadratic chain through these
// points; bezierAt (cubic) would misread its control numbers
// and float the label off the route, so waypoint labels are
// placed along the polyline instead — close to the rendered
// curve and, unlike the cubic misparse, always ON the path.
export function pointAlongPolyline(
    pts: readonly { x: number; y: number }[],
    t: number,
): { x: number; y: number } {
    const first = pts[0]!;
    const segLens: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(
            pts[i]!.x - pts[i - 1]!.x,
            pts[i]!.y - pts[i - 1]!.y,
        );
        segLens.push(len);
        total += len;
    }
    if (total === 0) return { x: first.x, y: first.y };
    let target = t * total;
    for (let i = 0; i < segLens.length; i++) {
        const len = segLens[i]!;
        if (target <= len || i === segLens.length - 1) {
            const frac = len === 0 ? 0 : target / len;
            const a = pts[i]!;
            const b = pts[i + 1]!;
            return {
                x: a.x + (b.x - a.x) * frac,
                y: a.y + (b.y - a.y) * frac,
            };
        }
        target -= len;
    }
    return { x: first.x, y: first.y };
}

// Cubic Bézier B(t) = u³P0 + 3u²t P1 + 3ut² P2 + t³P3
// where u = 1-t, P0..P3 are the control points. Places a
// CUBIC (no-waypoint) edge's label at parameter t along the
// curve we drew; waypoint edges use pointAlongPolyline. The
// SVG path mini-language separates numbers with commas or
// whitespace, so we split on /[,\s]+/. We don't validate path
// syntax because we only call this on paths we constructed.
function bezierAt(
    pathD: string,
    t: number,
): { x: number; y: number } {
    const parts = pathD.split(/[,\s]+/);
    const coords = parts
        .map(Number)
        .filter(n => !isNaN(n));
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
    connectPreview: string,
): SafeHtml {
    const nodeMap = new Map(
        nodes.map(n => [n.id, n]),
    );

    const cycleEdgeIds = findCycleEdgeIds(nodes, edges);

    const aimOffsets =
        computeEdgeAimOffsets(edges);

    let edgeMarkup = '';
    for (const edge of edges) {
        const fromNode =
            nodeMap.get(edge.fromNodeId);
        const toNode =
            nodeMap.get(edge.toNodeId);
        if (!fromNode || !toNode) continue;
        const aimOffset =
            aimOffsets.get(edge.id)!;
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
            node.isCreate
            || node.isArchive;
        const hasEdges = isSpecial
            && nodeHasConnections(
                node.id, edges,
            );
        const showPort = canShowPort(
            isLocked, isSpecial, hasEdges,
        );
        const portPos = showPort
            ? computePortPos(
                node, edges, nodeMap,
            )
            : null;
        nodeMarkup +=
            buildNode(
                node, edges, isSelected,
                portPos,
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
        + '<g class="flow-content">'
        + edgeMarkup
        + nodeMarkup
        + '</g>'
        + marqueeMarkup
        + '<g class="flow-connect-preview"'
        + ' pointer-events="none">'
        + connectPreview
        + '</g>'
        + '</svg>',
    );
}
