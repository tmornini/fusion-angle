import { html, SafeHtml } from '../safe-html';
import { displayText } from '../core';
import {
    iconClock,
    iconDollarSign,
    iconTrendingUp,
    iconTarget,
    iconEye,
    iconGripVertical,
    iconCheckCircle2,
    iconAlertCircle,
    iconXCircle,
} from '../icons';
import {
    type Project,
    type ProjectStatus,
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
} from '../../../api/types';

const STATUS_ICONS: Record<
    ProjectStatus,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    'submitted': iconClock,
    'under-review': iconAlertCircle,
    'sent-back': iconXCircle,
    'approved': iconCheckCircle2,
    'declined': iconXCircle,
    'completed': iconCheckCircle2,
    'deleted': iconXCircle,
};

export class ProjectPresenter {
    readonly #id: string;
    readonly #title: string;
    readonly #status: ProjectStatus;
    readonly #statusClassName: string;
    readonly #statusLabel: string;
    readonly #priority: number;
    readonly #priorityScore: number;
    readonly #progress: number;
    readonly #estimatedDuration: number;
    readonly #actualDurationDays: number;
    readonly #estimatedDurationDays: number;
    readonly #actualCost: number;
    readonly #actualImpact: number;
    readonly #estimatedImpact: number;

    constructor(project: Project) {
        this.#id = project.id;
        this.#title = project.title;
        this.#status = project.status;
        this.#statusClassName =
            project.statusClassName();
        this.#statusLabel =
            project.statusLabel();
        this.#priority = project.priority;
        this.#priorityScore =
            project.priorityScore;
        this.#progress = project.progress;
        this.#estimatedDuration =
            project.estimatedDuration;
        this.#actualDurationDays =
            project.actualDurationDays();
        this.#estimatedDurationDays =
            project.estimatedDurationDays();
        this.#actualCost = project.actualCost;
        this.#actualImpact =
            project.actualImpact;
        this.#estimatedImpact =
            project.estimatedImpact;
    }

    idForLink(): string {
        return this.#id;
    }

    prioritySortKey(): number {
        return this.#priority;
    }

    scoreSortKey(): number {
        return this.#priorityScore;
    }

    statusGroup(): ProjectStatus {
        return this.#status;
    }

    buildStatusBadge(): SafeHtml {
        const cfg = PROJECT_STATUS_CONFIG[
            this.#status
        ]!;
        const icon = STATUS_ICONS[
            this.#status
        ]!;
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs'
        }">${
            icon(14, '')
        } ${cfg.label}</span>`;
    }

    buildCard(view: string): SafeHtml {
        const statusIcon = STATUS_ICONS[
            this.#status
        ]!;
        const metricBoxStyle =
            'width:2rem;height:2rem;'
            + 'border-radius:0.5rem;'
            + 'background:'
            + 'hsl(var(--primary)/0.1);'
            + 'display:flex;'
            + 'align-items:center;'
            + 'justify-content:center';
        return html`
    <div class="card card-hover"
        style="padding:1.25rem"
        data-project-card="${this.#id}">
        <div class="${
            'flex items-start gap-4'
        }">
            <div class="${
                'hidden-mobile text-muted'
            }" style="${
                'margin-top:0.25rem;'
                + 'cursor:grab'
            }">${
                iconGripVertical(20, '')
            }</div>
            <div style="flex:1;min-width:0">
                <div class="${
                    'flex items-start '
                    + 'justify-between'
                    + ' gap-4 mb-3'
                }">
                    <div style="${
                        'flex:1;min-width:0'
                    }">
                        <div class="${
                            'flex flex-wrap '
                            + 'items-center'
                            + ' gap-2 mb-1'
                        }">
                            <h3 class="${
                                'font-display '
                                + 'font-semibold'
                            }" style="${
                                'white-space:'
                                + 'nowrap;'
                                + 'overflow:'
                                + 'hidden;'
                                + 'text-overflow'
                                + ':ellipsis'
                            }">${
                                this.#title
                            }</h3>
                            <span class="${
                                'badge '
                                + this
                                    .#statusClassName
                                + ' text-xs'
                            }">${
                                statusIcon(
                                    14, '',
                                )
                            } ${
                                this
                                    .#statusLabel
                            }</span>
                        </div>
                        ${view === 'priority'
                            ? html`<span
                                class="${
                                    'text-xs'
                                    + ' text-muted'
                                }">Priority #${
                                    this.#priority
                                }</span>`
                            : html``}
                    </div>
                    ${this.#buildProgressRing()}
                </div>
                <div class="${
                    'flex items-end '
                    + 'justify-between gap-4'
                }">
                    ${this.#buildMetrics(
                        metricBoxStyle,
                    )}
                    <button class="${
                        'btn btn-outline '
                        + 'btn-sm gap-2'
                    }" data-view-project="${
                        this.#id
                    }">${
                        iconEye(16, '')
                    } <span class="${
                        'hidden-mobile'
                    }">View Details</span
                    ></button>
                </div>
            </div>
        </div>
    </div>`;
    }

    #buildProgressRing(): SafeHtml {
        const percent = this.#progress;
        const radius = 20;
        const center = 24;
        const circumference =
            2 * Math.PI * radius;
        return html`
    <div style="${
        'position:relative;'
        + 'width:3rem;height:3rem'
    }">
        <svg width="48" height="48"
            style="${
                'transform:rotate(-90deg)'
            }">
            <circle
                cx="${center}"
                cy="${center}"
                r="${radius}"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-width="4"
                fill="none"/>
            <circle
                cx="${center}"
                cy="${center}"
                r="${radius}"
                stroke="${
                    'hsl(var(--primary))'
                }"
                stroke-width="4"
                fill="none"
                stroke-dasharray="${
                    percent
                    * circumference / 100
                } ${circumference}"/>
        </svg>
        <span style="${
            'position:absolute;inset:0;'
            + 'display:flex;'
            + 'align-items:center;'
            + 'justify-content:center;'
            + 'font-size:0.625rem;'
            + 'font-weight:700'
        }">${percent}%</span>
    </div>`;
    }

    #buildMetrics(
        boxStyle: string,
    ): SafeHtml {
        const cost = this.#actualCost;
        const impact =
            this.#actualImpact
            || this.#estimatedImpact;
        return html`
    <div class="${
        'project-metrics-grid'
    }" style="flex:1">
        <div class="${
            'flex items-center gap-2'
        }">
            <div style="${boxStyle}">${
                iconClock(16, 'text-primary')
            }</div>
            <div>
                <p class="${
                    'text-xs text-muted'
                }">Time</p>
                <p class="${
                    'text-sm font-medium'
                }">${
                    this.#estimatedDuration
                    ? html`${
                        this
                            .#actualDurationDays
                    }d <span class="${
                        'text-xs text-muted'
                    }">/ ${
                        this
                            .#estimatedDurationDays
                    }d</span>`
                    : html`&mdash;`
                }</p>
            </div>
        </div>
        <div class="${
            'flex items-center gap-2'
        }">
            <div style="${boxStyle}">${
                iconDollarSign(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${
                    'text-xs text-muted'
                }">Cost</p>
                <p class="${
                    'text-sm font-medium'
                }">${
                    cost
                    ? '$'
                        + (cost / COST_DIVISOR)
                            .toFixed(0)
                        + 'k'
                    : '\u2014'
                }</p>
            </div>
        </div>
        <div class="${
            'flex items-center gap-2'
        }">
            <div style="${boxStyle}">${
                iconTrendingUp(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${
                    'text-xs text-muted'
                }">Impact</p>
                <p class="${
                    'text-sm font-medium'
                }">${
                    displayText(
                        impact
                            ? String(impact)
                            : '',
                    )
                }</p>
            </div>
        </div>
        <div class="${
            'flex items-center gap-2'
        }">
            <div style="${boxStyle}">${
                iconTarget(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${
                    'text-xs text-muted'
                }">Score</p>
                <p class="${
                    'text-sm font-medium'
                }">${
                    this.#priorityScore
                }</p>
            </div>
        </div>
    </div>`;
    }
}

export class ProjectListPresenter {
    readonly #projects: ProjectPresenter[];
    readonly #statusBadges: SafeHtml;
    #view: 'priority' | 'performance' =
        'priority';

    constructor(projects: Project[]) {
        this.#projects = projects.map(
            p => new ProjectPresenter(p),
        );
        const groups = Object.groupBy(
            this.#projects,
            p => p.statusGroup(),
        );
        const badges =
            Object.values(groups)
                .filter(
                    items =>
                        items
                        && items.length > 0,
                )
                .map(items =>
                    items![0]!
                        .buildStatusBadge(),
                );
        this.#statusBadges =
            html`${badges}`;
    }

    setView(
        view: 'priority' | 'performance',
    ): void {
        this.#view = view;
    }

    currentView():
        'priority' | 'performance' {
        return this.#view;
    }

    renderStatusBadges(): SafeHtml {
        return this.#statusBadges;
    }

    renderList(): SafeHtml {
        const sorted =
            [...this.#projects].sort(
                (a, b) =>
                    this.#view === 'priority'
                        ? a.prioritySortKey()
                            - b.prioritySortKey()
                        : b.scoreSortKey()
                            - a.scoreSortKey(),
            );
        return html`${sorted.map(
            p => p.buildCard(this.#view),
        )}`;
    }

    countLabel(): string {
        const n = this.#projects.length;
        return n
            + ' '
            + (n === 1
                ? 'project'
                : 'projects')
            + ' \u2022 '
            + (this.#view === 'priority'
                ? 'by priority'
                : 'by score');
    }
}
