import {
    $, $required, getRequiredAttribute,
} from '../app/dom.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    sessionContext,
    getFlowStats,
    subscribeFlowChanges,
} from '../app/adapters/index.ts';
import {
    FlowStatsPresenter,
    type FlowStatsUi,
} from '../app/presenters/index.ts';
import {
    NODE_WIDTH, NODE_HEIGHT,
} from '../app/flow-layout.ts';
import type { GraphNode } from '../../api/types.ts';

// Empty canvas fallback when no nodes exist.
const EMPTY_W = 200;
const EMPTY_H = 200;

// Uniform whitespace around the stats canvas.
const STATS_VIEW_PADDING_PX = 40;

// Smallest enclosing box for all node rects
// plus uniform padding on all sides.
function boundingViewBox(
    nodes: GraphNode[],
    padding: number,
): { x: number; y: number; w: number; h: number } {
    if (nodes.length === 0) {
        return {
            x: 0, y: 0,
            w: EMPTY_W, h: EMPTY_H,
        };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.positionX);
        minY = Math.min(minY, n.positionY);
        maxX = Math.max(
            maxX, n.positionX + NODE_WIDTH,
        );
        maxY = Math.max(
            maxY, n.positionY + NODE_HEIGHT,
        );
    }
    return {
        x: minX - padding,
        y: minY - padding,
        w: maxX - minX + padding * 2,
        h: maxY - minY + padding * 2,
    };
}

// Anchor the hover/pin card beside a node
// using CSS custom properties so CSS handles
// all positioning math without inline style
// carrying semantic styling.
function anchorCardTo(
    host: HTMLElement,
    g: Element,
): void {
    const area = $(
        '.flow-stats-canvas-area', host,
    );
    const card = $('#flow-stats-card', host);
    if (
        !(area instanceof HTMLElement)
        || !(card instanceof HTMLElement)
    ) return;
    const areaRect = area.getBoundingClientRect();
    const gRect = g.getBoundingClientRect();
    const cx = Math.round(
        gRect.left + gRect.width / 2
        - areaRect.left,
    );
    const cy = Math.round(
        gRect.top + gRect.height / 2
        - areaRect.top,
    );
    card.style.setProperty('--card-x', String(cx));
    card.style.setProperty('--card-y', String(cy));
}

// The page's identity, set once by init and read by every
// load — a bell re-runs load(host) for the same flow.
let flowId = '';
let projectId: string | undefined;

// The hover/click listeners of the CURRENT render; each load
// aborts the last so a re-render never doubles them.
let cardListeners: AbortController | null = null;

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const id = params?.flowId;
    if (!id) {
        navigateTo('flows');
        return;
    }
    flowId = id;
    projectId = params?.projectId;
    const host = $required(
        '#flow-stats', document,
    );

    await load(host);
    // Cross-tab flow edits ring the same flowChanges bell
    // the designer trusts. This page has no edit mode to
    // protect, so a re-load from the server is the whole
    // response — the selected path and pinned node reset
    // with it.
    subscribeFlowChanges(() => {
        void load(host);
    });
}

async function load(host: HTMLElement): Promise<void> {
    await loadInto({
        container: host,
        skeleton: buildSkeleton('detail', 1),
        fetch: () => getFlowStats(
            sessionContext(), flowId, Date.now(),
        ),
        onData: ({ model, graph }) => {
            const viewBox = boundingViewBox(
                graph.nodes,
                STATS_VIEW_PADDING_PX,
            );
            const presenter =
                new FlowStatsPresenter(
                    model, viewBox,
                );
            presenter.renderShell(host);

            // Presenter is deliberately name-agnostic;
            // page module writes the graph's own values
            // so the header reflects the live flow name.
            const nameEl = $(
                '.flow-stats-flow-name', host,
            );
            if (nameEl) {
                nameEl.textContent = graph.name;
            }

            const ui: FlowStatsUi = {
                selectedPathIndex: 0,
                pinnedNodeId: null,
                hoveredNodeId: null,
            };
            presenter.renderUpdate(host, ui);

            cardListeners?.abort();
            cardListeners = new AbortController();
            const { signal } = cardListeners;

            host.addEventListener(
                'mouseover',
                (e) => {
                    if (
                        !(e.target instanceof Element)
                    ) return;
                    const g = e.target.closest(
                        '[data-node-id]',
                    );
                    if (!g) return;
                    ui.hoveredNodeId =
                        getRequiredAttribute(
                            g, 'data-node-id',
                        );
                    anchorCardTo(host, g);
                    presenter.renderCard(
                        host,
                        ui.pinnedNodeId
                            ?? ui.hoveredNodeId,
                    );
                },
                { signal },
            );

            host.addEventListener(
                'mouseout',
                (e) => {
                    if (
                        !(e.target instanceof Element)
                    ) return;
                    const g = e.target.closest(
                        '[data-node-id]',
                    );
                    if (!g) return;
                    ui.hoveredNodeId = null;
                    presenter.renderCard(
                        host, ui.pinnedNodeId,
                    );
                },
                { signal },
            );

            const stepPathSelection = (
                stepper: Element,
            ): void => {
                const dir = stepper.getAttribute(
                    'data-stepper',
                );
                const max = Math.max(
                    0,
                    model.pathEntries.length - 1,
                );
                if (dir === 'next') {
                    ui.selectedPathIndex = Math.min(
                        ui.selectedPathIndex + 1,
                        max,
                    );
                } else if (dir === 'prev') {
                    ui.selectedPathIndex = Math.max(
                        ui.selectedPathIndex - 1,
                        0,
                    );
                }
                presenter.renderUpdate(host, ui);
            };

            host.addEventListener(
                'click',
                (e) => {
                    if (
                        !(e.target instanceof Element)
                    ) return;
                    const stepper = e.target.closest(
                        '[data-stepper]',
                    );
                    if (stepper) {
                        stepPathSelection(stepper);
                        return;
                    }
                    const backBtn = e.target.closest(
                        '#flow-stats-back',
                    );
                    if (backBtn) {
                        navigateTo(
                            'flow-detail',
                            {
                                flowId,
                                ...(projectId
                                    ? { projectId }
                                    : {}),
                            },
                        );
                        return;
                    }
                    const nodeEl = e.target.closest(
                        '[data-node-id]',
                    );
                    if (nodeEl) {
                        const nodeId =
                            getRequiredAttribute(
                                nodeEl,
                                'data-node-id',
                            );
                        // Toggle: clicking a pinned
                        // node unpins it.
                        ui.pinnedNodeId =
                            ui.pinnedNodeId === nodeId
                                ? null
                                : nodeId;
                        presenter.renderCard(
                            host,
                            ui.pinnedNodeId
                                ?? ui.hoveredNodeId,
                        );
                        return;
                    }
                    const canvas = e.target.closest(
                        '.flow-stats-canvas-area',
                    );
                    if (canvas) {
                        ui.pinnedNodeId = null;
                        presenter.renderCard(
                            host, null,
                        );
                    }
                },
                { signal },
            );
        },
    });
}
