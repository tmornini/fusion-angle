import type { SafeHtml } from './safe-html';
import { trusted, html, escapeForHtml } from './safe-html';
import type {
    GraphNode, GraphEdge,
} from './adapters/flows';
import {
    NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout';

const BLUE = '#4B6CA1';
const WARN = '#d97706';
const GREEN = '#16a34a';

const GRID_CELL = 24;
const GRID_DOT_RADIUS = 0.7;

const ARROW_VIEWBOX = 10;
const ARROW_MIDPOINT = 5;
const ARROW_MARKER = 8;

const GLOW_SPREAD = 4;
const GLOW_OPACITY = 0.6;

const STROKE_NORMAL = 2;
const STROKE_START = 2.5;
const STROKE_COMPLETE = 3;

const NODE_RADIUS = 10;
const COMPLETE_INSET = 4;
const COMPLETE_INNER_RADIUS = 7;
const COMPLETE_INNER_STROKE = 1.5;

const NODE_LABEL_Y = 22;
const NODE_LABEL_FONT = 14;
const NODE_META_Y = 40;
const NODE_META_FONT = 11;

const EDGE_STROKE = 2;
const EDGE_STROKE_SELECTED = 3;
const HIT_TARGET_WIDTH = 12;
const CURVE_TENSION = 0.4;
const BEZIER_MIDPOINT = 0.5;

const CYCLE_DROP = 60;
const CYCLE_LEFT_OFFSET = 40;
const CYCLE_DASH = '6 3';

const LABEL_CHAR_WIDTH = 7;
const LABEL_PADDING = 12;
const LABEL_MIN_WIDTH = 36;
const LABEL_HEIGHT = 20;
const LABEL_RADIUS = 4;
const LABEL_BG_OPACITY = 0.9;
const LABEL_TEXT_OFFSET_Y = 4;
const LABEL_FONT = 11;

type RectEdge =
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

function whichEdge(
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

function controlOffset(
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
        + '<marker id="wf-arrow-ok"'
        + markerAttrs
        + `<path d="${arrowPath}"`
        + ` fill="${GREEN}"/>`
        + '</marker>'
        + '<filter id="wf-glow"'
        + ' x="-20%" y="-20%"'
        + ' width="140%" height="140%">'
        + '<feDropShadow'
        + ' dx="0" dy="0"'
        + ` stdDeviation="${GLOW_SPREAD}"`
        + ` flood-color="${BLUE}"`
        + ` flood-opacity="${GLOW_OPACITY}"/>`
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

function buildNode(
    node: GraphNode,
    isSelected: boolean,
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

    const filterAttr = isSelected
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

    const nameEsc = escapeForHtml(node.name);
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

    return trusted(
        '<g'
        + ` data-node-id="${node.id}"`
        + ' transform="translate('
        + String(positionX)
        + ', '
        + String(positionY)
        + ')"'
        + filterAttr
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

    const isCycle =
        toNode.positionX
            <= fromNode.positionX;

    let pathD: string;
    let color: string;
    let markerUrl: string;
    let dashAttr: string;

    if (isCycle) {
        const botPt = perimeterPoint(
            fromNode.positionX,
            fromNode.positionY,
            NODE_WIDTH, NODE_HEIGHT,
            fromCx,
            fromCy + NODE_HEIGHT * 2,
        );
        const leftPt = perimeterPoint(
            toNode.positionX,
            toNode.positionY,
            NODE_WIDTH, NODE_HEIGHT,
            toNode.positionX
                - NODE_WIDTH,
            toCy,
        );
        const dropY =
            Math.max(
                botPt.y, leftPt.y,
            ) + CYCLE_DROP;
        pathD = 'M '
            + String(botPt.x) + ' '
            + String(botPt.y)
            + ' C '
            + String(botPt.x) + ' '
            + String(dropY) + ', '
            + String(
                leftPt.x
                    - CYCLE_LEFT_OFFSET,
            ) + ' '
            + String(dropY) + ', '
            + String(leftPt.x) + ' '
            + String(leftPt.y);
        color = WARN;
        markerUrl =
            'url(#wf-arrow-warn)';
        dashAttr =
            ` stroke-dasharray="${
                CYCLE_DASH
            }"`;
    } else {
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
        color = BLUE;
        markerUrl = 'url(#wf-arrow)';
        dashAttr = '';
    }

    const sw = isSelected
        ? EDGE_STROKE_SELECTED
        : EDGE_STROKE;
    const opacity = isSelected
        ? ' opacity="1"' : '';

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
        + opacity
        + ` marker-end="${markerUrl}"`;
    const visClose = ' style='
        + '"cursor:pointer"'
        + '/>';

    const midX = computeMidpoint(
        pathD,
    );
    const midY = computeMidpointY(
        pathD,
    );
    const labelEsc =
        escapeForHtml(edge.name);
    const labelLen = edge.name.length;
    const labelW = Math.max(
        labelLen * LABEL_CHAR_WIDTH
            + LABEL_PADDING,
        LABEL_MIN_WIDTH,
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

    return trusted(
        '<g'
        + ` data-edge-id="${edge.id}"`
        + '>'
        + hitPath
        + visPath + visClose
        + labelBg
        + labelText
        + '</g>',
    );
}

function computeMidpoint(
    pathD: string,
): number {
    const parts = pathD.split(/[,\s]+/);
    const coords = parts
        .map(Number)
        .filter(n => !isNaN(n));
    if (coords.length < 8) {
        return (coords[0] ?? 0);
    }
    const p0x = coords[0]!;
    const cp1x = coords[2]!;
    const cp2x = coords[4]!;
    const p1x = coords[6]!;
    const t = BEZIER_MIDPOINT;
    const u = 1 - t;
    return u * u * u * p0x
        + 3 * u * u * t * cp1x
        + 3 * u * t * t * cp2x
        + t * t * t * p1x;
}

function computeMidpointY(
    pathD: string,
): number {
    const parts = pathD.split(/[,\s]+/);
    const coords = parts
        .map(Number)
        .filter(n => !isNaN(n));
    if (coords.length < 8) {
        return (coords[1] ?? 0);
    }
    const p0y = coords[1]!;
    const cp1y = coords[3]!;
    const cp2y = coords[5]!;
    const p1y = coords[7]!;
    const t = BEZIER_MIDPOINT;
    const u = 1 - t;
    return u * u * u * p0y
        + 3 * u * u * t * cp1y
        + 3 * u * t * t * cp2y
        + t * t * t * p1y;
}

export function buildGraphSvg(
    nodes: GraphNode[],
    edges: GraphEdge[],
    viewBoxX: number,
    viewBoxY: number,
    viewBoxW: number,
    viewBoxH: number,
    selectedNodeId: string | null,
    selectedEdgeId: string | null,
): SafeHtml {
    const nodeMap = new Map(
        nodes.map(n => [n.id, n]),
    );

    let edgeMarkup = '';
    for (const edge of edges) {
        const fromNode =
            nodeMap.get(edge.fromNodeId);
        const toNode =
            nodeMap.get(edge.toNodeId);
        if (!fromNode || !toNode) continue;
        const isSelected =
            edge.id === selectedEdgeId;
        edgeMarkup +=
            buildEdge(
                edge,
                fromNode,
                toNode,
                isSelected,
            ).toString();
    }

    let nodeMarkup = '';
    for (const node of nodes) {
        const isSelected =
            node.id === selectedNodeId;
        nodeMarkup +=
            buildNode(
                node, isSelected,
            ).toString();
    }

    const vb = String(viewBoxX)
        + ' ' + String(viewBoxY)
        + ' ' + String(viewBoxW)
        + ' ' + String(viewBoxH);

    return trusted(
        '<svg'
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ' class="wf-canvas"'
        + ` viewBox="${vb}"`
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
