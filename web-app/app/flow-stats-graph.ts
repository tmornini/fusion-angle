// Read-only SVG renderer for the flow-stats canvas.
// Sibling to flow-graph.ts's buildGraphSvg — shares
// geometry constants and pure helpers, but has no
// editor affordances (no role=button, tabindex, ports,
// animate filters, or aria-current).
import type { SafeHtml } from './safe-html.ts';
import { trusted, escapeForHtml } from './safe-html.ts';
import type {
    GraphEdge,
} from './adapters/flows.ts';
import {
    NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout.ts';
import {
    NODE_RADIUS, GRID_CELL,
    perimeterPoint, whichEdge, controlOffset,
} from './flow-graph.ts';
import { findCycleEdgeIds } from './flow-cycle-edges.ts';
import {
    iconAlertTriangle,
    iconNoEntry,
} from './icons.ts';
import { formatMinAscending } from './duration-units.ts';
import { DISPLAY_ABSENT } from './format.ts';
import type {
    FlowStatsModel, NodeStat,
} from './flow-stats-aggregate.ts';

// --- local geometry constants -------------------------
// Geometry only. Every paint property — edge/arrowhead
// stroke & dash, node text size/anchor/fill/halo, grid
// colours — live in pages-flow-stats.css; this renderer
// emits structure (d, transform, x/y, class, data-*),
// nothing presentational.

const GRID_DOT_RADIUS = 0.7;

// Arrowhead: a fixed size in user units (markerUnits=
// userSpaceOnUse below) so it doesn't balloon with the
// edge's stroke-width when a path is highlighted.
const ARROW_VIEWBOX  = 10;
const ARROW_MIDPOINT = 5;
const ARROW_MARKER   = 12;

// Node text layout — y is an SVG unit relative to the
// top-left of the node rect (NODE_HEIGHT=64); x and
// text-anchor are set in CSS.
const NODE_NAME_Y = 28;
const NODE_FACE_Y = 46;

// Hazard glyph sits in the bottom-left of the node rect.
const HAZARD_ICON_SIZE = 16;
const HAZARD_X = 6;
const HAZARD_Y = 42;

// --- public types -------------------------------------

interface ViewBox {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

// Highlight set: when non-null, nodes/edges NOT in the
// set get data-dim="true"; those IN the set get
// data-on-path="true". When null, neither attribute
// is emitted (no highlight active).
interface Highlight {
    readonly nodeIds: ReadonlySet<string>;
    readonly edgeIds: ReadonlySet<string>;
}

// --- helpers ------------------------------------------

// Stats-canvas defs: dotted grid + one arrowhead marker.
// No animated glow filter — this canvas is static.
function buildDefs(patternId: string): string {
    const gridCenter = GRID_CELL / 2;
    const halfCell   = GRID_CELL / 2;
    const arrowPath  =
        'M 0 0 L ' + String(ARROW_VIEWBOX)
        + ' ' + String(ARROW_MIDPOINT)
        + ' L 0 ' + String(ARROW_VIEWBOX) + ' z';
    const markerAttrs =
        ' viewBox="0 0'
        + ' ' + String(ARROW_VIEWBOX)
        + ' ' + String(ARROW_VIEWBOX) + '"'
        + ' refX="' + String(ARROW_VIEWBOX) + '"'
        + ' refY="' + String(ARROW_MIDPOINT) + '"'
        + ' markerWidth="' + String(ARROW_MARKER) + '"'
        + ' markerHeight="' + String(ARROW_MARKER) + '"'
        + ' markerUnits="userSpaceOnUse"'
        + ' orient="auto-start-reverse">';
    return '<defs>'
        + '<pattern id="' + patternId + '"'
        + ' width="' + String(GRID_CELL) + '"'
        + ' height="' + String(GRID_CELL) + '"'
        + ' patternUnits="userSpaceOnUse"'
        + ' patternTransform="translate('
        + String(-halfCell) + ', '
        + String(-halfCell) + ')">'
        + '<circle class="flow-stats-grid-dot"'
        + ' cx="' + String(gridCenter) + '"'
        + ' cy="' + String(gridCenter) + '"'
        + ' r="' + String(GRID_DOT_RADIUS) + '"/>'
        + '</pattern>'
        + '<marker id="stats-arrow"'
        + markerAttrs
        + '<path d="' + arrowPath + '"'
        + ' class="flow-stats-arrowhead"/>'
        + '</marker>'
        + '</defs>';
}

function buildGrid(
    vb: ViewBox,
    patternId: string,
): string {
    return '<rect'
        + ' class="flow-stats-grid-bg"'
        + ' x="' + String(vb.x) + '"'
        + ' y="' + String(vb.y) + '"'
        + ' width="' + String(vb.w) + '"'
        + ' height="' + String(vb.h) + '"/>'
        + '<rect'
        + ' x="' + String(vb.x) + '"'
        + ' y="' + String(vb.y) + '"'
        + ' width="' + String(vb.w) + '"'
        + ' height="' + String(vb.h) + '"'
        + ' fill="url(#' + patternId + ')"/>';
}

function buildEdge(
    edge: GraphEdge,
    fromStat: NodeStat,
    toStat:   NodeStat,
    highlight: Highlight | null,
    isCycle: boolean,
): string {
    const fromCx = fromStat.positionX + NODE_WIDTH / 2;
    const fromCy = fromStat.positionY + NODE_HEIGHT / 2;
    const toCx   = toStat.positionX + NODE_WIDTH / 2;
    const toCy   = toStat.positionY + NODE_HEIGHT / 2;

    const startPt = perimeterPoint(
        fromStat.positionX, fromStat.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        toCx, toCy,
    );
    const endPt = perimeterPoint(
        toStat.positionX, toStat.positionY,
        NODE_WIDTH, NODE_HEIGHT,
        fromCx, fromCy,
    );
    const dist = Math.hypot(
        endPt.x - startPt.x,
        endPt.y - startPt.y,
    );
    const startEdge = whichEdge(
        startPt.x, startPt.y,
        fromStat.positionX, fromStat.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const endEdge = whichEdge(
        endPt.x, endPt.y,
        toStat.positionX, toStat.positionY,
        NODE_WIDTH, NODE_HEIGHT,
    );
    const cp1 = controlOffset(startEdge, dist);
    const cp2 = controlOffset(endEdge, dist);
    const pathD = 'M '
        + String(startPt.x) + ' '
        + String(startPt.y)
        + ' C '
        + String(startPt.x + cp1.dx) + ' '
        + String(startPt.y + cp1.dy) + ', '
        + String(endPt.x + cp2.dx) + ' '
        + String(endPt.y + cp2.dy) + ', '
        + String(endPt.x) + ' '
        + String(endPt.y);

    // Compute highlight attributes: dim/on-path are
    // mutually exclusive; when highlight is null, omit
    // both (no-highlight state, not the same as dim).
    const dim =
        highlight !== null
        && !highlight.edgeIds.has(edge.id);
    const onPath =
        highlight !== null
        && highlight.edgeIds.has(edge.id);
    const dimAttr    = dim    ? ' data-dim="true"'     : '';
    const onPathAttr = onPath ? ' data-on-path="true"' : '';
    const cycleAttr  = isCycle ? ' data-cycle="true"'  : '';

    const idEsc = escapeForHtml(edge.id);
    return '<g'
        + ' class="flow-stats-edge"'
        + ' data-edge-id="' + idEsc + '"'
        + cycleAttr
        + dimAttr + onPathAttr + '>'
        + '<path'
        + ' class="flow-stats-edge-path"'
        + ' d="' + pathD + '"/>'
        + '</g>';
}

function buildNode(
    n: NodeStat,
    highlight: Highlight | null,
): string {
    const halfW = NODE_WIDTH / 2;

    const displayName = n.displayName;
    const nameEsc = escapeForHtml(displayName);

    // Face stat: avg sojourn for regular nodes with
    // data; em-dash for start/complete/no-data.
    const isSpecial = n.isCreate || n.isArchive;
    const face = (!isSpecial && n.avgSeconds !== null)
        ? formatMinAscending(n.avgSeconds)
        : DISPLAY_ABSENT;
    const faceEsc = escapeForHtml(face);

    let inner = '';

    inner += '<rect'
        + ' class="flow-stats-node-rect"'
        + ' width="' + String(NODE_WIDTH) + '"'
        + ' height="' + String(NODE_HEIGHT) + '"'
        + ' rx="' + String(NODE_RADIUS) + '"'
        + ' ry="' + String(NODE_RADIUS) + '"/>';

    inner += '<text'
        + ' class="flow-stats-node-name"'
        + ' x="' + String(halfW) + '"'
        + ' y="' + String(NODE_NAME_Y) + '">'
        + nameEsc + '</text>';

    inner += '<text'
        + ' class="flow-stats-node-face"'
        + ' x="' + String(halfW) + '"'
        + ' y="' + String(NODE_FACE_Y) + '">'
        + faceEsc + '</text>';

    if (n.workerHazard === 'warning') {
        inner += '<g'
            + ' class="flow-stats-node-warning"'
            + ' transform="translate('
            + String(HAZARD_X) + ', '
            + String(HAZARD_Y) + ')">'
            + '<title>'
            + 'Single worker assigned (no backup)'
            + '</title>'
            + iconAlertTriangle(HAZARD_ICON_SIZE, '')
                .toString()
            + '</g>';
    } else if (n.workerHazard === 'danger') {
        // Dead-end is the only danger variant the
        // stats canvas can self-disambiguate
        // (NodeStat carries outgoingEdgeIds but
        // not workerIds); zero-workers falls
        // through to the same generic title.
        const dangerTitle =
            n.outgoingEdgeIds.length === 0
                ? 'Dead end (no outgoing edges)'
                : 'Workers required';
        inner += '<g'
            + ' class="flow-stats-node-danger"'
            + ' transform="translate('
            + String(HAZARD_X) + ', '
            + String(HAZARD_Y) + ')">'
            + '<title>'
            + dangerTitle
            + '</title>'
            + iconNoEntry(HAZARD_ICON_SIZE, '')
                .toString()
            + '</g>';
    }

    // Highlight attributes: same semantics as edges —
    // omit both when highlight is null.
    const dim =
        highlight !== null
        && !highlight.nodeIds.has(n.id);
    const onPath =
        highlight !== null
        && highlight.nodeIds.has(n.id);
    const dimAttr    = dim    ? ' data-dim="true"'     : '';
    const onPathAttr = onPath ? ' data-on-path="true"' : '';

    // data-special only on start/complete nodes.
    const specialAttr = n.isCreate
        ? ' data-special="start"'
        : n.isArchive
        ? ' data-special="archive"'
        : '';

    const idEsc = escapeForHtml(n.id);
    // Attribute order keeps test regexes happy:
    // class → data-node-id → style → transform →
    // data-special? → data-dim? → data-on-path?
    return '<g'
        + ' class="flow-stats-node"'
        + ' data-node-id="' + idEsc + '"'
        + ' style="--heat-t: '
        + n.heatT.toFixed(2) + '"'
        + ' transform="translate('
        + String(n.positionX) + ', '
        + String(n.positionY) + ')"'
        + specialAttr
        + dimAttr + onPathAttr + '>'
        + inner
        + '</g>';
}

// --- public API ---------------------------------------

export function buildStatsGraphSvg(
    model: FlowStatsModel,
    viewBox: ViewBox,
    highlight: Highlight | null,
): SafeHtml {
    // Deduplicate the grid pattern id so multiple
    // instances on the same page don't collide.
    const patternId = 'stats-grid';

    const nodeById = new Map(
        model.nodes.map(n => [n.id, n]),
    );
    const cycleEdgeIds = findCycleEdgeIds(
        model.nodes, model.edges,
    );

    let edgeMarkup = '';
    for (const edge of model.edges) {
        const from = nodeById.get(edge.fromNodeId);
        const to   = nodeById.get(edge.toNodeId);
        if (!from || !to) continue;
        edgeMarkup += buildEdge(
            edge, from, to, highlight,
            cycleEdgeIds.has(edge.id),
        );
    }

    let nodeMarkup = '';
    for (const n of model.nodes) {
        nodeMarkup += buildNode(n, highlight);
    }

    const vbStr = String(viewBox.x)
        + ' ' + String(viewBox.y)
        + ' ' + String(viewBox.w)
        + ' ' + String(viewBox.h);

    const stateLabel = model.nodes.length === 1
        ? '1 state'
        : String(model.nodes.length) + ' states';
    const transLabel = model.edges.length === 1
        ? '1 transition'
        : String(model.edges.length) + ' transitions';
    const canvasLabel =
        'Flow statistics canvas: '
        + stateLabel + ', ' + transLabel;

    return trusted(
        '<svg'
        + ' xmlns="http://www.w3.org/2000/svg"'
        + ' class="flow-stats-canvas"'
        + ' role="img"'
        + ' aria-label="' + escapeForHtml(canvasLabel) + '"'
        + ' viewBox="' + vbStr + '"'
        + ' preserveAspectRatio="xMidYMid meet"'
        + ' width="100%"'
        + ' height="100%">'
        + buildDefs(patternId)
        + buildGrid(viewBox, patternId)
        + edgeMarkup
        + nodeMarkup
        + '</svg>',
    );
}
