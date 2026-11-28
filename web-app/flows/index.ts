import {
    $$,
    $required,
    getRequiredAttribute,
} from '../app/dom.ts';
import {
    html,
    setHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { subscribeOnce } from '../../client/channels.ts';
import { handlePageLoadError } from '../app/page-loader.ts';
import {
    ICON_SIZE,
    iconGitBranch,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    getHref,
    putAddress,
    subscribeResize,
} from '../app/adapters/index.ts';
import { flowAddress } from '../app/flow-address.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    subscribeFlowChanges,
    getFlowsWithProjectNames,
    getRecordEntities,
    getRecordForFlow,
    type FlowWithProjectName,
} from '../../client/index.ts';
import type { FlowGraph } from '../../client/flow-queries.ts';
import { sessionContext } from '../app/client.ts';
import { getRenderableFlowGraph } from '../app/flow-graph-layout.ts';
import { arrangeFlow } from '../app/flow-arrangement.ts';
import { buildGraphSvg } from '../app/flow-graph.ts';
import { validateFlowForCreation } from '../app/flow-publish.ts';
import { nodeBoundsBox } from '../app/flow-interactions.ts';
import {
    FlowPresenter,
    buildFlowPanel,
    type FlowPanelProblem,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';
// Room around the states for the curves and labels that
// reach past them.
const PREVIEW_MARGIN = 48;

// What the page holds: the flows as listed, the records by
// id (for the bound record's name), and the flow the panel
// shows, with the graph its drawing is painted from.
let flows: readonly FlowWithProjectName[] = [];
let recordNames = new Map<string, string>();
let openId: string | null = null;
let openGraph: FlowGraph | null = null;
let listEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let stopPreviewResize: (() => void) | null = null;

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const flowListEl = $required(
        '#flow-list', document,
    );
    panelEl = $required('#flow-panel', document);
    // The named flow's read, so the page is ready once both
    // sides have painted.
    let opened: Promise<void> = Promise.resolve();

    const ctx = sessionContext();
    await loadInto({
        container: flowListEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => getFlowsWithProjectNames(ctx),
        retry: () => void init(params),
        emptyState: {
            icon: iconGitBranch(ICON_SIZE['2xl'], ''),
            title: 'No Flows Yet',
            description:
                'Flows are created'
                + ' from the project'
                + ' detail page.',
            action: {
                label: 'View Projects',
                href:
                    '../projects/'
                    + 'index.html',
            },
            onEmpty: () => {
                panelEl?.classList.add('hidden');
                subscribeOnce(
                    subscribeFlowChanges, init,
                    err => handlePageLoadError('flows', err),
                );
            },
        },
        onData: result => {
            opened = onFlowsLoaded(
                result, flowListEl, params,
            );
        },
    });
    await opened;
}

// The address names the flow to open; with none named, or
// one no longer listed, the first one listed opens.
async function onFlowsLoaded(
    result: FlowWithProjectName[],
    flowListEl: HTMLElement,
    params: Record<string, string> | undefined,
): Promise<void> {
    flows = result;
    listEl = flowListEl;
    panelEl?.classList.remove('hidden');
    renderList();

    flowListEl.addEventListener(
        'click', onListClick, { signal },
    );
    panelEl?.addEventListener(
        'click', onPanelClick, { signal },
    );
    subscribeFlowChanges(() => void refresh());

    // A record's name is a label here, never a reason the
    // flow cannot open: an unreadable list names none.
    recordNames = await getRecordEntities(sessionContext())
        .then(rows => new Map(rows.map((m) => {
            const r = m.body().toValue();
            return [r.id, r.name];
        })))
        .catch(() => new Map<string, string>());

    const named = params?.id;
    const id = named !== undefined && isListed(named)
        ? named
        : flows[0]?.summary.id;
    if (id === undefined) return;
    await openFlow(id);
}

function isListed(id: string): boolean {
    return flows.some(f => f.summary.id === id);
}

function renderList(): void {
    if (!listEl) return;
    setHtml(
        listEl,
        html`${flows.map(({ summary, projectName }) =>
            new FlowPresenter(summary, projectName).render())}`,
    );
    markOpenFlow();
}

// The card whose flow the panel holds carries aria-current;
// no other card does.
function markOpenFlow(): void {
    if (!listEl) return;
    for (const card of $$('[data-flow-card]', listEl)) {
        if (card.getAttribute('data-flow-card') === openId) {
            card.setAttribute('aria-current', 'true');
        } else {
            card.removeAttribute('aria-current');
        }
    }
}

// Open a flow in the panel: its graph for the readiness and
// the drawing, and its bound record. A slower answer for a
// flow since left behind is dropped.
async function openFlow(id: string): Promise<void> {
    const panel = panelEl;
    if (!panel) return;
    openId = id;
    openGraph = null;
    markOpenFlow();
    const listed = flows.find(f => f.summary.id === id);
    if (!listed) return;
    const ctx = sessionContext();
    await loadInto({
        container: panel,
        skeleton: buildSkeleton('detail', 1),
        fetch: () => Promise.all([
            getRenderableFlowGraph(ctx, id),
            getRecordForFlow(ctx, id),
        ]),
        retry: () => void openFlow(id),
        onData: ([graph, recordId]) => {
            if (openId !== id) return;
            openGraph = graph;
            setHtml(panel, buildFlowPanel({
                id,
                name: graph.name,
                projectName: listed.projectName,
                nodeCount: graph.nodes.length,
                edgeCount: graph.edges.length,
                recordName: recordId === null
                    ? null
                    : recordNames.get(recordId) ?? null,
                problems: problemsOf(graph),
            }));
            paintPreview();
            stopPreviewResize?.();
            const preview = panel.querySelector('#flow-preview');
            stopPreviewResize = preview === null
                ? null
                : subscribeResize(preview, paintPreview);
        },
    });
}

// The designer's readiness rule (flow-publish.ts), with each
// problem's state named rather than numbered.
function problemsOf(graph: FlowGraph): FlowPanelProblem[] {
    const names = new Map(graph.nodes.map(n => [n.id, n.name]));
    return validateFlowForCreation(graph.message).problems
        .map(p => ({
            kind: p.kind,
            stateName: names.get(p.nodeId) ?? p.nodeId,
        }));
}

// Draw the open flow to fit its box, read-only: the
// designer's own renderer with nothing selected, inside an
// inert wrapper so none of it takes focus. Drawn unlocked so
// it wears the designer's usual colours; its connection
// ports are hidden (pages-flows.css).
function paintPreview(): void {
    const graph = openGraph;
    const host = panelEl?.querySelector<HTMLElement>(
        '.flow-preview-canvas',
    );
    if (!graph || !host) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w <= 0 || h <= 0) return;
    const arranged = arrangeFlow(
        graph, { kind: 'measured', w, h },
    );
    const box = nodeBoundsBox(arranged.nodes.map(n => ({
        x: n.positionX, y: n.positionY,
    })));
    if (box === null) {
        setHtml(host, html``);
        return;
    }
    setHtml(host, buildGraphSvg(
        [...arranged.nodes],
        graph.edges,
        box.minX - PREVIEW_MARGIN,
        box.minY - PREVIEW_MARGIN,
        box.maxX - box.minX + 2 * PREVIEW_MARGIN,
        box.maxY - box.minY + 2 * PREVIEW_MARGIN,
        { kind: 'none' },
        false,
        false,
        null,
        arranged.edgeWaypoints,
        '',
    ));
    fitToDrawing(host);
}

// Widen the view to what was actually drawn — loop-backs
// and labels can reach past the states' box.
function fitToDrawing(host: HTMLElement): void {
    const svg = host.querySelector('svg');
    const content = host.querySelector('.flow-content');
    if (
        !(svg instanceof SVGSVGElement)
        || !(content instanceof SVGGraphicsElement)
    ) return;
    const b = content.getBBox();
    if (b.width <= 0 || b.height <= 0) return;
    svg.setAttribute('viewBox', [
        b.x - PREVIEW_MARGIN / 2,
        b.y - PREVIEW_MARGIN / 2,
        b.width + PREVIEW_MARGIN,
        b.height + PREVIEW_MARGIN,
    ].join(' '));
}

// A plain click on a card opens its flow in the panel; a
// modified click on its title follows the link, as any link
// does. The card's statistics button goes to statistics.
function onListClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    const stats = e.target.closest<HTMLElement>('[data-flow-stats]');
    if (stats) {
        navigateTo('flow-stats', {
            flowId: getRequiredAttribute(stats, 'data-flow-stats'),
        });
        return;
    }
    const card = e.target.closest<HTMLElement>('[data-flow-card]');
    if (!card) return;
    if (e.target.closest('a[href]') && isModified(e)) return;
    e.preventDefault();
    selectFlow(getRequiredAttribute(card, 'data-flow-card'));
}

function onPanelClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    const stats = e.target.closest<HTMLElement>('[data-flow-stats]');
    if (!stats) return;
    navigateTo('flow-stats', {
        flowId: getRequiredAttribute(stats, 'data-flow-stats'),
    });
}

function selectFlow(id: string): void {
    if (id !== openId) {
        void openFlow(id);
        putAddress(flowAddress(getHref(), id));
    }
    if (matchMedia(MOBILE_MEDIA_QUERY).matches) {
        panelEl?.scrollIntoView({ block: 'start' });
    }
}

// Another tab changed a flow: list again, and reopen the
// open one if it is still listed, else the first.
async function refresh(): Promise<void> {
    flows = await getFlowsWithProjectNames(sessionContext());
    renderList();
    const id = openId !== null && isListed(openId)
        ? openId
        : flows[0]?.summary.id;
    if (id === undefined) {
        openId = null;
        if (panelEl) setHtml(panelEl, html``);
        return;
    }
    await openFlow(id);
}

function isModified(e: MouseEvent): boolean {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}
