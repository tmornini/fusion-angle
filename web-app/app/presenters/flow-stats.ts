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
import { iconArrowLeft } from '../icons.ts';
import {
    buildStatsGraphSvg,
} from '../flow-stats-graph.ts';
import {
    DISPLAY_ABSENT,
} from '../format.ts';
import {
    formatMinAscending,
} from '../duration-units.ts';

// DASH is the canonical absent-value marker;
// fmtDur guards both null and 0 (no data).
const DASH = DISPLAY_ABSENT;
function fmtDur(sec: number | null): string {
    return sec === null || sec === 0
        ? DASH
        : formatMinAscending(sec);
}
// Throughput below 1/wk shown as "<1/wk" to
// avoid implying false precision.
function fmtThroughput(n: number): string {
    return n < 1
        ? '<1/wk'
        : `~${Math.round(n)}/wk`;
}

// ViewBox mirrors the parameter shape expected
// by buildStatsGraphSvg; kept local so this
// module has no runtime dep on flow-layout.ts.
interface ViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface FlowStatsUi {
    selectedPathIndex: number;
    pinnedNodeId?: string | null;
    hoveredNodeId?: string | null;
}

export class FlowStatsPresenter {
    readonly #model: FlowStatsModel;
    readonly #viewBox: ViewBox;

    constructor(
        model: FlowStatsModel,
        viewBox: ViewBox,
    ) {
        this.#model = model;
        this.#viewBox = viewBox;
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
        return html`<div class="flow-stats">
<div class="flow-stats-header">
    <button
        id="flow-stats-back"
        class="btn btn-ghost btn-icon"
        title="Designer"
        aria-label="Back to Flow Designer"
    >${iconArrowLeft(20, '')}</button>
    <div class="flow-stats-title-block">
        <h1 class="${
            'page-title'
            + ' flow-stats-flow-name'
        }"></h1>
        <p class="flow-stats-flow-desc"
        ></p>
    </div>
    <div class="flow-stats-window-badge"
    >Trailing 90 days</div>
</div>
<div class="flow-stats-body">
    <div class="flow-stats-canvas-area">
        <div class="${
            'flow-stats-canvas-host'
        }"></div>
        <div
            id="flow-stats-card"
            class="flow-stats-card hidden"
        ></div>
    </div>
    <div class="${
        'flow-stats-stepper-bar'
    }"></div>
</div>
${this.buildLegend()}${footnote}</div>`;
    }

    buildStepperBar(
        ui: { selectedPathIndex: number },
    ): SafeHtml {
        const entries =
            this.#model.pathEntries;
        const total = entries.length;
        const raw = ui.selectedPathIndex;
        const idx = total === 0
            ? 0
            : Math.max(
                0,
                Math.min(raw, total - 1),
            );
        const entry =
            total === 0
                ? undefined
                : entries[idx];

        const inFlight =
            this.#model
                .incompleteWorkOrderCount;
        const inflightFrag =
            inFlight > 0
            ? trusted(
                ` · ${inFlight}`
                + ' in flight',
            )
            : trusted('');

        let label: SafeHtml;
        if (!entry) {
            label = html`No completed work orders yet${inflightFrag}`;
        } else if (entry.kind === 'path') {
            const pct = entry.path.sharePct;
            const tot =
                this.#model
                    .completedWorkOrderCount;
            label = html`Path ${
                idx + 1
            } of ${total} · ${
                pct
            }% of ${tot} work orders${
                inflightFrag
            }`;
        } else {
            label = html`+ ${
                entry.count
            } rarer paths, combined ${
                entry.combinedSharePct
            }%${inflightFrag}`;
        }

        const prevDis = trusted(
            idx <= 0 ? ' disabled' : '',
        );
        const nextDis = trusted(
            idx >= total - 1
                ? ' disabled' : '',
        );

        // Eyebrow names the control so a first-time
        // reader knows the stepper walks the flow's
        // paths from most- to least-travelled; styling
        // is in pages-flow-stats.css.
        return html`<span class="${
            'flow-stats-stepper-eyebrow'
        }">Most-traveled paths</span><div class="${
            'flow-stats-stepper'
        }"><button data-stepper="prev"${prevDis} class="${
            'btn btn-ghost btn-icon'
        }" aria-label="Previous path">&#9664;</button><span class="${
            'flow-stats-stepper-label'
        }">${label}</span><button data-stepper="next"${nextDis} class="${
            'btn btn-ghost btn-icon'
        }" aria-label="Next path">&#9654;</button></div>`;
    }

    buildLegend(): SafeHtml {
        // Gradient is applied via CSS class;
        // no inline style needed here.
        return html`<div class="${
            'flow-stats-legend'
        }"><span class="${
            'flow-stats-legend-end'
        }">0%</span><span class="${
            'flow-stats-legend-bar'
        }"></span><span class="${
            'flow-stats-legend-end'
        }">100%</span><span class="${
            'flow-stats-legend-caption'
        }">share of flow time, trailing 90 days</span></div>`;
    }

    renderShell(container: HTMLElement): void {
        setHtml(container, this.buildShell());
        // The aggregate is deliberately
        // flow-name-agnostic; the page module
        // sets these from the FlowGraph it
        // already holds (Task 18).
        const nameEl =
            container.querySelector(
                '.flow-stats-flow-name',
            );
        if (nameEl) {
            nameEl.textContent =
                this.#flowName();
        }
        const descEl =
            container.querySelector(
                '.flow-stats-flow-desc',
            );
        if (descEl) {
            descEl.textContent =
                this.#flowDesc();
        }
    }

    renderUpdate(
        container: HTMLElement,
        ui: FlowStatsUi,
    ): void {
        const highlight =
            this.#highlightFor(
                ui.selectedPathIndex,
            );
        const canvasHost =
            container.querySelector(
                '.flow-stats-canvas-host',
            ) as HTMLElement | null;
        if (canvasHost) {
            setHtml(
                canvasHost,
                buildStatsGraphSvg(
                    this.#model,
                    this.#viewBox,
                    highlight,
                ),
            );
        }
        const stepperBar =
            container.querySelector(
                '.flow-stats-stepper-bar',
            ) as HTMLElement | null;
        if (stepperBar) {
            setHtml(
                stepperBar,
                this.buildStepperBar({
                    selectedPathIndex:
                        ui.selectedPathIndex,
                }),
            );
        }
        this.renderCard(container, ui.pinnedNodeId
            ?? ui.hoveredNodeId ?? null);
    }

    buildCard(s: NodeStat): SafeHtml {
        const special =
            s.isCreate || s.isArchive;

        // Workers block: suppressed for special
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
        const cardEl = container.querySelector(
            '#flow-stats-card',
        ) as HTMLElement | null;
        if (!cardEl) return;
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

    // Stubs — page module fills these from
    // the FlowGraph it already holds (Task 18).
    #flowName(): string { return ''; }
    #flowDesc(): string { return ''; }
}
