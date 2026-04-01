import { html, SafeHtml } from '../safe-html';
import { formatDate } from '../core';
import {
    iconCheckCircle2,
    iconAlertCircle,
    iconClock,
    iconChevronRight,
    iconTrendingUp,
    iconShield,
    iconBarChart,
    iconUser,
    iconTarget,
    iconSearch,
} from '../icons';
import type {
    EdgeListEntry,
    EdgeStatus,
} from '../../../api/types';

export class EdgePresenter {
    readonly #ideaId: string;
    readonly #ideaTitle: string;
    readonly #owner: string;
    readonly #outcomesCount: number;
    readonly #metricsCount: number;
    readonly #status: EdgeStatus;
    readonly #statusLabel: string;
    readonly #statusClassName: string;
    readonly #confidenceLabel: string;
    readonly #confidenceClassName: string;
    readonly #updatedAt: string;
    readonly #isComplete: boolean;
    readonly #isDraft: boolean;
    readonly #isMissing: boolean;
    readonly #searchText: string;

    constructor(entry: EdgeListEntry) {
        this.#ideaId = entry.ideaId;
        this.#ideaTitle = entry.ideaTitle;
        this.#owner = entry.owner;
        this.#outcomesCount =
            entry.outcomesCount;
        this.#metricsCount =
            entry.metricsCount;
        this.#status = entry.edge.status;
        this.#statusLabel =
            entry.edge.statusLabel();
        this.#statusClassName =
            entry.edge.statusClassName();
        this.#confidenceLabel =
            entry.edge.confidenceLabel();
        this.#confidenceClassName =
            entry.edge.confidenceClassName();
        this.#updatedAt =
            entry.edge.updatedAt;
        this.#isComplete =
            entry.edge.isComplete();
        this.#isDraft =
            entry.edge.isDraft();
        this.#isMissing =
            entry.edge.isMissing();
        this.#searchText =
            (entry.ideaTitle + ' '
                + entry.owner)
                .toLowerCase();
    }

    matchesFilter(
        search: string,
        status: string,
    ): boolean {
        const matchesSearch =
            this.#searchText
                .includes(search);
        const matchesStatus =
            status === 'all'
            || this.#status === status;
        return matchesSearch
            && matchesStatus;
    }

    buildCard(): SafeHtml {
        return html`
    <div class="card card-hover p-4"
        style="cursor:pointer"
        data-edge-card="${this.#ideaId}">
        <div class="${
            'flex items-start '
            + 'justify-between gap-4'
        }">
            <div style="${
                'flex:1;min-width:0'
            }">
                ${this.#buildBadges()}
                <h3 class="${
                    'font-semibold mb-1'
                }">${
                    this.#ideaTitle
                }</h3>
                ${this.#buildMeta()}
            </div>
            <div class="${
                'flex items-center'
            }">${
                iconChevronRight(
                    20, 'text-muted',
                )
            }</div>
        </div>
    </div>`;
    }

    #buildStatusIcon(): SafeHtml {
        if (this.#isComplete)
            return iconCheckCircle2(12, '');
        if (this.#isDraft)
            return iconClock(12, '');
        return iconAlertCircle(12, '');
    }

    #buildBadges(): SafeHtml {
        return html`
        <div class="${
            'flex flex-wrap '
            + 'items-center '
            + 'gap-2 mb-2'
        }">
            <span class="${
                'badge '
                + this.#statusClassName
                + ' text-xs'
            }">${
                this.#buildStatusIcon()
            } ${
                this.#statusLabel
            }</span>
            <span
                class="${
                    'flex items-center'
                    + ' gap-1 text-xs '
                    + this
                        .#confidenceClassName
                }">${
                    iconShield(14, '')
                } ${
                    this.#confidenceLabel
                } Confidence</span>
        </div>`;
    }

    #buildMeta(): SafeHtml {
        return html`
        <div class="${
            'flex flex-wrap '
            + 'items-center gap-3 '
            + 'text-sm text-muted'
        }">
            ${this.#owner
                ? html`<span
                    class="${
                        'flex '
                        + 'items-center'
                        + ' gap-1'
                    }">${
                    iconUser(14, '')
                } ${this.#owner}</span>`
                : html``}
            ${!this.#isMissing
                ? html`<span
                    class="${
                        'flex '
                        + 'items-center'
                        + ' gap-1'
                    }">${
                    iconTrendingUp(14, '')
                } ${
                    this.#outcomesCount
                } ${
                    this.#outcomesCount === 1
                        ? 'outcome'
                        : 'outcomes'
                }</span><span
                    class="${
                        'flex '
                        + 'items-center'
                        + ' gap-1'
                    }">${
                    iconBarChart(14, '')
                } ${
                    this.#metricsCount
                } ${
                    this.#metricsCount === 1
                        ? 'metric'
                        : 'metrics'
                }</span>`
                : html``}
            ${this.#updatedAt
                ? html`<span
                    class="text-xs"
                    >Updated ${
                    formatDate(
                        this.#updatedAt,
                    )
                }</span>`
                : html``}
        </div>`;
    }
}

export class EdgeListPresenter {
    readonly #edges: EdgePresenter[];
    readonly #completeCount: number;
    readonly #draftCount: number;
    readonly #missingCount: number;
    #search = '';
    #statusFilter = 'all';

    constructor(
        entries: EdgeListEntry[],
    ) {
        this.#edges = entries.map(
            e => new EdgePresenter(e),
        );
        let complete = 0;
        let draft = 0;
        let missing = 0;
        for (const e of entries) {
            if (e.edge.isComplete())
                complete++;
            else if (e.edge.isDraft())
                draft++;
            else missing++;
        }
        this.#completeCount = complete;
        this.#draftCount = draft;
        this.#missingCount = missing;
    }

    setSearch(query: string): void {
        this.#search = query.toLowerCase();
    }

    setStatusFilter(
        status: string,
    ): void {
        this.#statusFilter = status;
    }

    render(): {
        stats: SafeHtml;
        list: SafeHtml;
        empty: SafeHtml;
        hasResults: boolean;
    } {
        const filtered = this.#edges.filter(
            e => e.matchesFilter(
                this.#search,
                this.#statusFilter,
            ),
        );
        return {
            stats: this.#buildStats(),
            list: html`${filtered.map(
                e => e.buildCard(),
            )}`,
            empty: this.#buildEmpty(),
            hasResults: filtered.length > 0,
        };
    }

    #buildStats(): SafeHtml {
        const total = this.#edges.length;
        return html`
            ${EdgeListPresenter.#buildStat(
                iconTarget(
                    20, 'text-primary',
                ),
                'hsl(var(--primary)/0.1)',
                total,
                'Total Ideas',
            )}
            ${EdgeListPresenter.#buildStat(
                iconCheckCircle2(
                    20, 'text-success',
                ),
                'hsl(var(--success-soft))',
                this.#completeCount,
                'Complete',
            )}
            ${EdgeListPresenter.#buildStat(
                iconClock(
                    20, 'text-warning',
                ),
                'hsl(var(--warning-soft))',
                this.#draftCount,
                'In Draft',
            )}
            ${EdgeListPresenter.#buildStat(
                iconAlertCircle(
                    20, 'text-error',
                ),
                'hsl(var(--error-soft))',
                this.#missingCount,
                'Missing',
            )}`;
    }

    static #buildStat(
        icon: SafeHtml,
        bgColor: string,
        count: number,
        label: string,
    ): SafeHtml {
        return html`
            <div class="card p-4">
                <div class="${
                    'flex items-center '
                    + 'gap-3'
                }">
                    <div class="${
                        'p-2 rounded-lg'
                    }"
                        style="${
                            'background:'
                            + bgColor
                        }">${icon}</div>
                    <div>
                        <p class="${
                            'text-2xl '
                            + 'font-bold'
                        }">${count}</p>
                        <p class="${
                            'text-sm '
                            + 'text-muted'
                        }">${label}</p>
                    </div>
                </div>
            </div>`;
    }

    #buildEmpty(): SafeHtml {
        return html`${
            iconTarget(48, 'text-muted')
        }<h3
class="${
    'text-lg font-semibold mt-4 mb-2'
}">No Edge definitions found</h3>
<p class="text-muted"
>Try adjusting your search or filter
criteria</p>`;
    }
}
