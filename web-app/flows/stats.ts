import {
    $, $required, getRequiredAttribute,
} from '../app/dom.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { subscribeResize } from '../app/adapters/index.ts';
import { getFlowStats } from '../app/flow-stats.ts';
import {
    subscribeFlowChanges,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    FlowStatsPresenter,
    type FlowStatsUi,
} from '../app/presenters/index.ts';
import { arrangeFlow } from '../app/flow-arrangement.ts';
import {
    cameraZoomedToward,
    viewBoxResized,
    type Camera,
} from '../app/flow-camera.ts';
import { bindStatsPanZoom } from '../app/flow-stats-pan-zoom.ts';
import {
    nodeBoundsBox,
    type FitBox,
} from '../app/flow-interactions.ts';
import {
    connectionPortBox,
    statsFitCamera,
    statsOpeningCamera,
    unionFitBox,
} from '../app/flow-stats-camera.ts';

// The canvas's size in CSS pixels: what the designer
// reads from its own wrap to lay out and to frame.
interface CanvasSize {
    readonly w: number;
    readonly h: number;
}

function canvasSizeOf(wrap: HTMLElement): CanvasSize {
    return { w: wrap.clientWidth, h: wrap.clientHeight };
}

// A canvas with no width or no height has not measured:
// there is no size to lay a flow out for, or to fit it to.
function isMeasured(canvas: CanvasSize): boolean {
    return canvas.w > 0 && canvas.h > 0;
}

// The extent of the flow as drawn, in content coordinates:
// curves, waypoints, and labels, not the node rectangles
// alone. Null when what is drawn measures nothing.
function drawnBox(host: HTMLElement): FitBox | null {
    const content = host.querySelector('.flow-stats-content');
    if (!(content instanceof SVGGraphicsElement)) {
        throw new Error(
            'the stats canvas holds no content group',
        );
    }
    const bbox = content.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) return null;
    return {
        minX: bbox.x,
        minY: bbox.y,
        maxX: bbox.x + bbox.width,
        maxY: bbox.y + bbox.height,
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

// The listeners of the CURRENT render — hover, click, the
// canvas's resize, and its pan and zoom; each load aborts
// the last so a re-render never doubles them.
let renderListeners: AbortController | null = null;

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
            renderListeners?.abort();
            renderListeners = new AbortController();
            const { signal } = renderListeners;

            // The shell draws no state, so it renders —
            // and its canvas measures — before the flow
            // is arranged for that canvas, as the
            // designer's shell does.
            FlowStatsPresenter.renderShell(
                host, model, graph.isAutoFit,
            );

            // Presenter is deliberately name-agnostic;
            // page module writes the graph's own values
            // so the header reflects the live flow name.
            const nameEl = $(
                '.flow-stats-flow-name', host,
            );
            if (nameEl) {
                nameEl.textContent = graph.name;
            }

            const wrap = $required(
                '.flow-stats-canvas-wrap', host,
            );
            const canvas = canvasSizeOf(wrap);
            // Laid out once per load: a resize moves the
            // camera and leaves every state where it is.
            const arrangement = arrangeFlow(
                graph,
                isMeasured(canvas)
                    ? { kind: 'measured', ...canvas }
                    : { kind: 'unmeasured' },
            );
            const presenter = new FlowStatsPresenter(
                model, arrangement, graph.isAutoFit,
            );

            const nodeBox = nodeBoundsBox(
                arrangement.nodes.map(n => ({
                    x: n.positionX,
                    y: n.positionY,
                })),
            );
            const portBox = connectionPortBox(
                arrangement, graph.edges, graph.isLocked,
            );
            // The designer's first fit, over the node
            // bounds: all there is to fit before the flow
            // is drawn. An empty flow has nothing to fit.
            const fitToNodes = (
                size: CanvasSize,
            ): Camera => nodeBox === null
                ? statsOpeningCamera(size)
                : statsFitCamera(nodeBox, size);
            // The designer's second fit, over the flow as
            // drawn, with the ports it draws there and
            // stats does not. A flow that measures nothing
            // keeps the first fit.
            const fitToDrawn = (
                size: CanvasSize,
            ): Camera => {
                const drawn = drawnBox(host);
                return drawn === null
                    ? fitToNodes(size)
                    : statsFitCamera(
                        unionFitBox(drawn, portBox), size,
                    );
            };
            const fitsAtLoad =
                graph.isAutoFit && isMeasured(canvas);

            const ui: FlowStatsUi = {
                selectedPathIndex: 0,
                pinnedNodeId: null,
                hoveredNodeId: null,
                camera: fitsAtLoad
                    ? fitToNodes(canvas)
                    : statsOpeningCamera(canvas),
            };
            presenter.renderUpdate(host, ui);

            // The one place the camera moves: the svg takes
            // the view, and a pinned card stays beside its
            // state.
            const showCamera = (camera: Camera): void => {
                ui.camera = camera;
                presenter.renderCamera(host, camera.viewBox);
                if (ui.pinnedNodeId !== null) {
                    anchorCardTo(host, $required(
                        `[data-node-id="${ui.pinnedNodeId}"]`,
                        wrap,
                    ));
                }
            };
            if (fitsAtLoad) showCamera(fitToDrawn(canvas));

            // With Auto Fit off the reader moves the camera:
            // a drag, the wheel, the keys, and the gutter's
            // zoom buttons. With it on, nothing is bound.
            if (!graph.isAutoFit) {
                bindStatsPanZoom(
                    wrap, () => ui.camera, showCamera, signal,
                );
                $required('.flow-stats-gutter', host)
                    .addEventListener(
                        'click',
                        (e) => {
                            if (
                                !(e.target instanceof Element)
                            ) return;
                            const button = e.target.closest(
                                '[data-action="zoom-in"],'
                                + ' [data-action="zoom-out"]',
                            );
                            if (!button) return;
                            showCamera(cameraZoomedToward(
                                ui.camera,
                                getRequiredAttribute(
                                    button, 'data-action',
                                ) === 'zoom-in'
                                    ? 'in'
                                    : 'out',
                                null,
                            ));
                        },
                        { signal },
                    );
            }

            // A resize never lays out and never fetches:
            // with Auto Fit on the camera fits again; with
            // it off it keeps its centre and its zoom.
            const unsubscribeResize = subscribeResize(
                wrap,
                () => {
                    const size = canvasSizeOf(wrap);
                    if (!isMeasured(size)) return;
                    showCamera(graph.isAutoFit
                        ? fitToDrawn(size)
                        : {
                            zoom: ui.camera.zoom,
                            viewBox: viewBoxResized(
                                ui.camera.viewBox,
                                ui.camera.zoom,
                                size.w, size.h,
                            ),
                        });
                },
            );
            signal.addEventListener(
                'abort', unsubscribeResize,
            );

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
