// Immutable presenter for the FlowStats page.
// build* methods return SafeHtml; render* methods
// touch the DOM via setHtml — never mixed.
import type {
    FlowStatsModel,
    NodeStat,
} from '../flow-stats-aggregate.ts';
import {
    html, trusted, setHtml, escapeForHtml,
    type SafeHtml,
} from '../safe-html.ts';
import { $, $required } from '../dom.ts';
import {
    ICON_SIZE, iconArrowLeft, iconMinus, iconPlus,
} from '../icons.ts';
import {
    buildStatsGraphSvg,
} from '../flow-stats-graph.ts';
import type { FlowArrangement } from '../flow-arrangement.ts';
import type { Camera } from '../flow-camera.ts';
import {
    DISPLAY_ABSENT,
} from '../format.ts';
import {
    formatMinAscending,
} from '../duration-units.ts';

// fmtDur guards both null and 0 (no data), showing the
// canonical absent-value marker.
function fmtDur(sec: number | null): string {
    return sec === null || sec === 0
        ? DISPLAY_ABSENT
        : formatMinAscending(sec);
}
// Throughput below 1/wk shown as "<1/wk" to
// avoid implying false precision.
function fmtThroughput(n: number): string {
    return n < 1
        ? '<1/wk'
        : `~${Math.round(n)}/wk`;
}

// One absence encoding: null means no pin / no hover. The
// fields are required, so no undefined shadow-absence exists.
// The camera is where the canvas looks; the page moves it.
export interface FlowStatsUi {
    selectedPathIndex: number;
    pinnedNodeId: string | null;
    hoveredNodeId: string | null;
    camera: Camera;
}

export class FlowStatsPresenter {
    readonly #model: FlowStatsModel;
    // Null only for the shell, which draws no flow.
    // The presenter that draws holds the arrangement
    // the page measured the canvas for.
    readonly #arrangement: FlowArrangement | null;
    readonly #isAutoFit: boolean;

    constructor(
        model: FlowStatsModel,
        arrangement: FlowArrangement | null,
        isAutoFit: boolean,
    ) {
        this.#model = model;
        this.#arrangement = arrangement;
        this.#isAutoFit = isAutoFit;
    }

    // The shell draws no flow, so it takes the model and
    // Auto Fit and no arrangement. The title is left
    // empty; the page writes the flow's name.
    static renderShell(
        container: HTMLElement,
        model: FlowStatsModel,
        isAutoFit: boolean,
    ): void {
        setHtml(
            container,
            new FlowStatsPresenter(
                model, null, isAutoFit,
            ).buildShell(),
        );
    }

    buildShell(): SafeHtml {
        const m = this.#model;
        const footnote =
            m.droppedNodeIds.size > 0
            ? html`<div class="${
                'flow-stats-footnote'
            }">${
                m.pathsWithDroppedStepsCount
            } work-order path${
                m.pathsWithDroppedStepsCount
                    === 1 ? '' : 's'
            } reference nodes omitted from this view.</div>`
            : trusted('');
        // The page opens on the most-travelled path;
        // renderUpdate redraws the bar for each selection.
        return html`<div class="flow-stats">
<div class="flow-stats-header">
    <button
        id="flow-stats-back"
        class="btn btn-ghost btn-icon"
        title="Designer"
        aria-label="Back to Flow Designer"
    >${iconArrowLeft(ICON_SIZE.xl, '')}</button>
    <div class="flow-stats-title-block">
        <h1 class="${
            'page-title'
            + ' flow-stats-flow-name'
        }"></h1>
        ${footnote}
    </div>
    <div class="flow-stats-window-badge"
    >Trailing 90 days</div>
    ${this.buildBar({ selectedPathIndex: 0 })}
</div>
<div class="flow-stats-body">
    ${this.#buildGutter()}
    <div class="flow-stats-canvas-area">
        <div class="${
            this.#isAutoFit
                ? 'flow-stats-canvas-wrap'
                : 'flow-stats-canvas-wrap flow-stats-pannable'
        }">
            <div class="${
                'flow-stats-canvas-host'
            }"></div>
        </div>
        <div
            id="flow-stats-card"
            class="flow-stats-card hidden"
        ></div>
    </div>
</div>
</div>`;
    }

    // Blank with Auto Fit on. With it off, the designer's
    // zoom buttons stand where its toolbar keeps them,
    // below the first spacer that stands in for its undo
    // and redo, each described by the keyboard's pan for
    // assistive technology.
    #buildGutter(): SafeHtml {
        if (this.#isAutoFit) {
            return html`<div class="flow-stats-gutter"></div>`;
        }
        return html`<div class="flow-stats-gutter">
<div class="flow-stats-gutter-spacer"></div>
<div class="flow-stats-gutter-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="zoom-out"
    title="Zoom out"
    aria-label="Zoom out"
    aria-describedby="flow-stats-pan-hint"
    >${iconMinus(ICON_SIZE.lg, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="zoom-in"
    title="Zoom in"
    aria-label="Zoom in"
    aria-describedby="flow-stats-pan-hint"
    >${iconPlus(ICON_SIZE.lg, '')}</button>
<span id="flow-stats-pan-hint" class="sr-only"
    >Arrow keys pan the canvas</span>
</div>
<div class="flow-stats-gutter-spacer"></div>
</div>`;
    }

    // The detail (counts and in-flight work) leaves the
    // visible label for the bar's title and an sr-only
    // span the stepper group names; with no detail there
    // is neither.
    buildBar(
        ui: { selectedPathIndex: number },
    ): SafeHtml {
        const entries =
            this.#model.pathEntries;
        const total = entries.length;
        const idx = total === 0
            ? 0
            : Math.max(
                0,
                Math.min(
                    ui.selectedPathIndex, total - 1,
                ),
            );
        const entry = entries[idx];

        const inFlight =
            this.#model.incompleteWorkOrderCount;
        const inFlightClause = inFlight > 0
            ? ` · ${inFlight} in flight`
            : '';
        const completed =
            this.#model.completedWorkOrderCount;
        const workOrders = `${completed} completed work order${
            completed === 1 ? '' : 's'
        }`;

        let steps: SafeHtml;
        let detail: string | null;
        if (entry === undefined) {
            steps = html`<span class="${
                'flow-stats-stepper-label'
            }">No completed work orders yet</span>`;
            detail = inFlight > 0
                ? `${inFlight} in flight`
                : null;
        } else if (total === 1) {
            steps = trusted('');
            detail = `1 path · ${workOrders}${inFlightClause}`;
        } else {
            const pct = entry.kind === 'path'
                ? entry.path.sharePct
                : entry.combinedSharePct;
            const label = entry.kind === 'path'
                ? `Path ${idx + 1} of ${total} · ${pct}%`
                : `+ ${entry.pathCount} rarer path${
                    entry.pathCount === 1 ? '' : 's'
                } · ${pct}%`;
            const prevDis = trusted(
                idx <= 0 ? ' disabled' : '',
            );
            const nextDis = trusted(
                idx >= total - 1 ? ' disabled' : '',
            );
            steps = html`<button data-stepper="prev"${prevDis} class="${
                'btn btn-ghost btn-icon'
            }" aria-label="Previous path">&#9664;</button><span class="${
                'flow-stats-stepper-label'
            }">${label}</span><button data-stepper="next"${nextDis} class="${
                'btn btn-ghost btn-icon'
            }" aria-label="Next path">&#9654;</button>`;
            detail = `${pct}% of ${workOrders}${inFlightClause}`;
        }

        const titleAttr = detail === null
            ? trusted('')
            : html` title="${detail}"`;
        const describedBy = detail === null
            ? trusted('')
            : trusted(
                ' aria-describedby="flow-stats-path-detail"',
            );
        const detailSpan = detail === null
            ? trusted('')
            : html`<span id="flow-stats-path-detail" class="${
                'sr-only'
            }">${detail}</span>`;
        // Gradient is applied via CSS class;
        // no inline style needed here.
        const legend = html`<div class="${
            'flow-stats-legend'
        }"><span class="${
            'flow-stats-legend-end'
        }">0%</span><span class="${
            'flow-stats-legend-bar'
        }"></span><span class="${
            'flow-stats-legend-end'
        }">100%</span><span class="${
            'flow-stats-legend-caption'
        }">share of flow time</span></div>`;
        return html`<div class="flow-stats-bar"${titleAttr}><div class="${
            'flow-stats-stepper'
        }" role="group" aria-label="${
            'Most-traveled paths'
        }"${describedBy}>${steps}${detailSpan}</div>${legend}</div>`;
    }

    renderUpdate(
        container: HTMLElement,
        ui: FlowStatsUi,
    ): void {
        const highlight =
            this.#highlightFor(
                ui.selectedPathIndex,
            );
        const canvasHost = $(
            '.flow-stats-canvas-host', container,
        );
        const arrangement = this.#arrangement;
        if (arrangement === null) {
            throw new Error(
                'the stats shell holds no arrangement',
            );
        }
        if (canvasHost) {
            setHtml(
                canvasHost,
                buildStatsGraphSvg(
                    this.#model,
                    arrangement,
                    ui.camera.viewBox,
                    highlight,
                ),
            );
        }
        // The bar's title changes with the selection, so
        // the whole bar is replaced, not just its children.
        const bar = $('.flow-stats-bar', container);
        if (bar) {
            const fresh =
                document.createElement('template');
            setHtml(
                fresh,
                this.buildBar({
                    selectedPathIndex:
                        ui.selectedPathIndex,
                }),
            );
            bar.replaceWith(fresh.content);
        }
        this.renderCard(container, ui.pinnedNodeId
            ?? ui.hoveredNodeId);
    }

    // A camera move redraws nothing: the svg takes the new
    // view, and the grid's two rects stretch to cover it.
    renderCamera(
        container: HTMLElement,
        viewBox: Camera['viewBox'],
    ): void {
        const svg = $required(
            'svg.flow-stats-canvas', container,
        );
        svg.setAttribute(
            'viewBox',
            String(viewBox.x)
            + ' ' + String(viewBox.y)
            + ' ' + String(viewBox.w)
            + ' ' + String(viewBox.h),
        );
        const rects = [
            $required('.flow-stats-grid-bg', svg),
            $required('.flow-stats-grid-dots', svg),
        ];
        for (const rect of rects) {
            rect.setAttribute('x', String(viewBox.x));
            rect.setAttribute('y', String(viewBox.y));
            rect.setAttribute('width', String(viewBox.w));
            rect.setAttribute('height', String(viewBox.h));
        }
    }

    buildCard(s: NodeStat): SafeHtml {
        const special =
            s.isCreate || s.isArchive;

        // Members block: suppressed for special
        // nodes; regular nodes show clan + producer.
        const peopleBlock: SafeHtml =
            special
            ? trusted('')
            : ((): SafeHtml => {
                const tp = s.topProducer;
                const topRow: SafeHtml =
                    tp !== null
                    ? html`<div class="${
                        'flow-stats-card-wide'
                    }"><dt>Top producer</dt><dd>${
                        tp.name
                    }${
                        tp.vsClanAvgPct !== null
                        ? trusted(
                            ` · ${tp.vsClanAvgPct
                            }% of clan avg`,
                        )
                        : trusted('')
                    }${
                        tp.sharePct !== null
                        ? trusted(
                            ` · ${tp.sharePct
                            }% of node's work`,
                        )
                        : trusted('')
                    }${
                        !tp.inCurrentClan
                        ? trusted(
                            ' (not in current clan)',
                        )
                        : trusted('')
                    }</dd></div>`
                    : trusted('');
                return html`<div><dt>Clan size</dt><dd>${
                    s.clanSize
                }</dd></div><div><dt>Active producers</dt><dd>${
                    s.activeProducerCount
                }</dd></div>${topRow}`;
            })();

        // Branch split: suppressed for special
        // nodes and when there are no branches.
        const branchBlock: SafeHtml =
            special || s.branchSplit.length === 0
            ? trusted('')
            : html`<div class="${
                'flow-stats-card-wide'
            }"><dt>Next</dt><dd>${
                trusted(
                    s.branchSplit
                        .map(b =>
                            `${escapeForHtml(b.label)}`
                            + ` ${b.pct}%`,
                        )
                        .join(' · '),
                )
            }</dd></div>`;

        return html`<div class="${
            'flow-stats-card-inner'
        }"><div class="${
            'flow-stats-card-title'
        }">${
            s.displayName
        }<span class="${
            'flow-stats-card-sub'
        }">${
            s.assignmentLabel
        }</span></div><dl class="${
            'flow-stats-card-grid'
        }"><div><dt>% of flow time</dt><dd>${
            Math.round(s.heatPct)
        }%</dd></div><div><dt>Avg</dt><dd>${
            trusted(fmtDur(s.avgSeconds))
        }</dd></div><div><dt>Median</dt><dd>${
            trusted(fmtDur(s.medianSeconds))
        }</dd></div><div><dt>p90</dt><dd>${
            trusted(fmtDur(s.p90Seconds))
        }</dd></div><div><dt>Visits (90d)</dt><dd>${
            s.visitsInWindow
        }</dd></div><div><dt>Distinct WOs</dt><dd>${
            s.distinctWorkOrders
        }</dd></div><div><dt>Here now</dt><dd>${
            s.currentlyHere
        }</dd></div><div><dt>Throughput</dt><dd>${
            trusted(fmtThroughput(s.throughputPerWeek))
        }</dd></div><div><dt>Loop-back</dt><dd>${
            s.revisitRatePct
        }%</dd></div>${
            peopleBlock
        }${
            branchBlock
        }</dl></div>`;
    }

    renderCard(
        container: HTMLElement,
        nodeId: string | null,
    ): void {
        const cardEl = $required(
            '#flow-stats-card', container,
        );
        if (nodeId === null) {
            cardEl.classList.add('hidden');
            return;
        }
        const s = this.#model.nodes.find(
            n => n.id === nodeId,
        );
        if (!s) {
            cardEl.classList.add('hidden');
            return;
        }
        setHtml(cardEl, this.buildCard(s));
        cardEl.classList.remove('hidden');
    }

    #highlightFor(
        index: number,
    ): {
        nodeIds: ReadonlySet<string>;
        edgeIds: ReadonlySet<string>;
    } | null {
        const entry =
            this.#model.pathEntries[index];
        if (entry?.kind === 'path') {
            return {
                nodeIds: new Set(
                    entry.path.nodeIds,
                ),
                edgeIds: new Set(
                    entry.path.edgeIds,
                ),
            };
        }
        return null;
    }
}
