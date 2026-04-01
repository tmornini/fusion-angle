import {
    html, SafeHtml, trusted,
} from '../safe-html';
import {
    iconTrendingUp, iconClock,
    iconDollarSign, iconUsers,
    iconCalendar, iconTarget,
    iconCheckCircle2, iconAlertCircle,
    iconMessageSquare, iconFileText,
    iconHistory, iconArrowLeft, iconPlus,
    iconArrowUpRight, iconArrowDownRight,
    iconMinus, iconListTodo,
    iconGitBranch, iconDatabase,
    iconCode, iconShield, iconBarChart,
    iconGauge, iconEdit, iconSave, iconX,
} from '../icons';
import {
    initials, formatDate,
} from '../core';
import type {
    ProjectView,
} from '../adapters/projects';
import type {
    WorkflowListItem,
} from '../adapters/workflows';
import {
    PROJECT_STATUS_CONFIG,
    MILESTONE_STATUS_CONFIG,
    type MilestoneStatus,
    TASK_PRIORITY_CONFIG,
} from '../../../api/types';

type MilestoneIconEntry = {
    iconFn: (
        s: number,
        c: string,
    ) => SafeHtml;
    iconClass: string;
};

const MILESTONE_ICON_MAP: Record<
    MilestoneStatus,
    MilestoneIconEntry
> = {
    completed: {
        iconFn: iconCheckCircle2,
        iconClass: 'text-primary-fg',
    },
    in_progress: {
        iconFn: iconAlertCircle,
        iconClass: 'text-primary-fg',
    },
    pending: {
        iconFn: iconClock,
        iconClass: 'text-muted',
    },
};

const KPI_ON_TRACK_RATIO = 0.9;

function isKpiOnTrack(
    current: number,
    target: number,
    unit: string,
): boolean {
    return unit === '$'
        ? current <= target
        : current
            >= target * KPI_ON_TRACK_RATIO;
}

export class ProjectDetailPresenter {
    readonly #title: string;
    readonly #description: string;
    readonly #status: string;
    readonly #statusLabel: string;
    readonly #statusClassName: string;
    readonly #progress: number;
    readonly #startDate: string;
    readonly #targetEndDate: string;
    readonly #projectLead: string;
    readonly #edge: ProjectView['edge'];
    readonly #team: ProjectView['team'];
    readonly #milestones:
        ProjectView['milestones'];
    readonly #versions:
        ProjectView['versions'];
    readonly #discussions:
        ProjectView['discussions'];
    readonly #tasks: ProjectView['tasks'];
    readonly #timeBaselineDays: number;
    readonly #timeCurrentDays: number;
    readonly #costBaselineK: number;
    readonly #costCurrentK: number;
    readonly #impactBaseline: number;
    readonly #impactCurrent: number;
    readonly #assignedTaskCount: number;
    readonly #unassignedTaskCount: number;

    constructor(view: ProjectView) {
        this.#title = view.title;
        this.#description = view.description;
        this.#status = view.status;
        this.#statusLabel =
            view.statusLabel();
        this.#statusClassName =
            view.statusClassName();
        this.#progress = view.progress;
        this.#startDate = view.startDate;
        this.#targetEndDate =
            view.targetEndDate;
        this.#projectLead =
            view.projectLead;
        this.#edge = view.edge;
        this.#team = view.team;
        this.#milestones = view.milestones;
        this.#versions = view.versions;
        this.#discussions =
            view.discussions;
        this.#tasks = view.tasks;
        this.#timeBaselineDays =
            view.timeBaselineDays();
        this.#timeCurrentDays =
            view.timeCurrentDays();
        this.#costBaselineK =
            view.costBaselineK();
        this.#costCurrentK =
            view.costCurrentK();
        this.#impactBaseline =
            view.impactBaseline();
        this.#impactCurrent =
            view.impactCurrent();
        this.#assignedTaskCount =
            view.assignedTaskCount();
        this.#unassignedTaskCount =
            view.unassignedTaskCount();
    }

    #buildVariance(
        baseline: number,
        current: number,
        isLowerBetter: boolean,
        unit: string,
        prefix = '',
    ): SafeHtml {
        const diff = current - baseline;
        if (diff === 0)
            return html`<span
                class="text-muted"
                >${iconMinus(
                    16, '',
                )} 0</span>`;
        const good = isLowerBetter
            ? diff < 0
            : diff > 0;
        const icon = diff < 0
            ? iconArrowDownRight(16, '')
            : iconArrowUpRight(16, '');
        const color = good
            ? 'color:hsl(var(--success))'
            : 'color:hsl(var(--error))';
        return html`<span
            style="${color}"
            class="${
                'flex items-center '
                + 'gap-1 font-bold text-sm'
            }">${icon} ${
                prefix
            }${Math.abs(diff)}${
                unit
            }</span>`;
    }

    #buildMilestoneIcon(
        status: MilestoneStatus,
    ): SafeHtml {
        const base =
            'width:1.5rem;height:1.5rem;'
            + 'border-radius:9999px;'
            + 'display:flex;'
            + 'align-items:center;'
            + 'justify-content:center';
        const cfg =
            MILESTONE_STATUS_CONFIG[status];
        const icon =
            MILESTONE_ICON_MAP[status];
        return html`<div
            style="${base};background:${
                cfg.iconBackground}"
            >${icon.iconFn(
                12, icon.iconClass,
            )}</div>`;
    }

    #buildProjectSummary(
        isEditing: boolean,
    ): SafeHtml {

        return html`
            <div class="card p-6">
                <h2 class="${
                    'text-lg font-display '
                    + 'font-semibold mb-4'
                }">
                    Project Summary
                </h2>
                ${isEditing
                    ? html`<textarea
                        class="${
                            'textarea mb-6'
                        }"
                        id="${
                            'project-edit-'
                            + 'description'
                        }"
                        rows="3"
                        style="${
                            'resize:none'
                        }">${
                            this.#description
                        }</textarea>`
                    : html`<p class="${
                        'text-sm '
                        + 'text-muted mb-6'
                    }">${
                        this.#description
                    }</p>`}
                <div style="${
                    'display:grid;'
                    + 'grid-template-columns:'
                    + '1fr 1fr;'
                    + 'gap:1rem'
                }">
                    <div class="${
                        'flex items-center '
                        + 'gap-3'
                    }"
                        style="${
                            'padding:0.75rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var(--muted)'
                            + '/0.5)'
                        }">
                        ${iconCalendar(
                            20, 'text-primary',
                        )}
                        <div>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Start Date
                            </p>
                            ${isEditing
                                ? html`<input
                                    type="date"
                                    id="${
                                        'project-'
                                        + 'edit-'
                                        + 'start-'
                                        + 'date'
                                    }"
                                    value="${
                                        this
                                            .#startDate
                                    }"
                                    class="input"
                                    style="${
                                        'margin-top'
                                        + ':0.25rem'
                                    }" />`
                                : html`<p
                                    class="${
                                        'text-sm '
                                        + 'font-'
                                        + 'medium'
                                    }">${
                                        formatDate(
                                            this
                                                .#startDate,
                                        )
                                    }</p>`}
                        </div>
                    </div>
                    <div class="${
                        'flex items-center '
                        + 'gap-3'
                    }"
                        style="${
                            'padding:0.75rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var(--muted)'
                            + '/0.5)'
                        }">
                        ${iconTarget(
                            20, 'text-primary',
                        )}
                        <div>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Target End
                            </p>
                            ${isEditing
                                ? html`<input
                                    type="date"
                                    id="${
                                        'project-'
                                        + 'edit-'
                                        + 'end-date'
                                    }"
                                    value="${
                                        this
                                            .#targetEndDate
                                    }"
                                    class="input"
                                    style="${
                                        'margin-top'
                                        + ':0.25rem'
                                    }" />`
                                : html`<p
                                    class="${
                                        'text-sm '
                                        + 'font-'
                                        + 'medium'
                                    }">${
                                        formatDate(
                                            this
                                                .#targetEndDate,
                                        )
                                    }</p>`}
                        </div>
                    </div>
                </div>
                <div style="${
                    'margin-top:1.5rem'
                }">
                    <div class="${
                        'flex items-center '
                        + 'justify-between mb-2'
                    }">
                        <span class="${
                            'text-sm font-medium'
                        }">
                            Overall Progress
                        </span>
                        <span
                            class="${
                                'text-sm '
                                + 'font-bold '
                                + 'text-primary'
                            }">${
                                this.#progress
                            }%</span>
                    </div>
                    <div class="${
                        'progress'
                    }"><div
                        class="${
                            'progress-fill'
                        }"
                        style="width:${
                            this.#progress
                        }%"
                        ></div></div>
                </div>
            </div>`;
    }

    #buildBaselineComparison(
        isEditing: boolean,
    ): SafeHtml {

        return html`
            <div class="card p-6">
                <div class="${
                    'flex items-center '
                    + 'justify-between mb-6'
                }">
                    <h2 class="${
                        'text-lg font-display '
                        + 'font-semibold'
                    }">
                        Baseline vs Current
                    </h2>
                    <span class="${
                        'text-xs text-muted'
                    }">
                        Real-time comparison
                    </span>
                </div>
                <div class="score-grid">
                    ${[
                        {
                            label: 'Time',
                            inputId: 'time',
                            icon: iconClock,
                            baseline:
                                this
                                    .#timeBaselineDays,
                            current:
                                this
                                    .#timeCurrentDays,
                            unit: 'd',
                            prefix: '',
                            isLowerBetter: true,
                        },
                        {
                            label: 'Cost',
                            inputId: 'cost',
                            icon: iconDollarSign,
                            baseline:
                                this
                                    .#costBaselineK,
                            current:
                                this
                                    .#costCurrentK,
                            unit: 'k',
                            prefix: '$',
                            isLowerBetter: true,
                        },
                        {
                            label: 'Impact',
                            inputId: 'impact',
                            icon: iconTrendingUp,
                            baseline:
                                this
                                    .#impactBaseline,
                            current:
                                this
                                    .#impactCurrent,
                            unit: ' pts',
                            prefix: '',
                            isLowerBetter: false,
                        },
                    ].map(metric => html`
                        <div style="${
                            'padding:1rem;'
                            + 'border-radius:'
                            + '0.75rem;'
                            + 'background:'
                            + 'hsl(var(--muted)'
                            + '/0.3);'
                            + 'border:1px solid '
                            + 'hsl(var(--border))'
                        }">
                            <div
                                class="${
                                    'flex '
                                    + 'items-center'
                                    + ' gap-2 mb-3'
                                }">
                                ${metric.icon(
                                    20,
                                    'text-primary',
                                )}
                                <span class="${
                                    'font-medium'
                                }">
                                    ${
                                        metric.label
                                    }
                                </span>
                            </div>
                            <div style="${
                                'display:flex;'
                                + 'flex-direction'
                                + ':column;'
                                + 'gap:0.5rem'
                            }">
                                <div class="${
                                    'flex '
                                    + 'items-center'
                                    + ' justify-'
                                    + 'between'
                                }">
                                    <span class="${
                                        'text-xs '
                                        + 'text-'
                                        + 'muted'
                                    }">
                                        Baseline
                                    </span>
                                    ${isEditing
                                        ? html`<input
                                            type="${
                                                'number'
                                            }"
                                            id="${
                                                'project'
                                                + '-edit-'
                                                + metric
                                                    .inputId
                                                + '-base'
                                                + 'line'
                                            }"
                                            value="${
                                                String(
                                                    metric
                                                        .baseline,
                                                )
                                            }"
                                            class="${
                                                'input'
                                            }"
                                            style="${
                                                'width'
                                                + ':5rem'
                                                + ';text'
                                                + '-align'
                                                + ':right'
                                            }"
                                            min="0"
                                            step="${
                                                'any'
                                            }" />`
                                        : html`<span
                                            class="${
                                                'text'
                                                + '-sm '
                                                + 'font-'
                                                + 'medium'
                                            }">${
                                                metric
                                                    .baseline
                                                    ? metric
                                                        .prefix
                                                        + metric
                                                            .baseline
                                                        + metric
                                                            .unit
                                                    : '\u2014'
                                            }</span>`}
                                </div>
                                <div class="${
                                    'flex '
                                    + 'items-center'
                                    + ' justify-'
                                    + 'between'
                                }">
                                    <span class="${
                                        'text-xs '
                                        + 'text-'
                                        + 'muted'
                                    }">
                                        Current
                                    </span>
                                    <span
                                        class="${
                                            'text-sm'
                                            + ' font-'
                                            + 'medium'
                                        }">${
                                            metric
                                                .current
                                                ? metric
                                                    .prefix
                                                    + metric
                                                        .current
                                                    + metric
                                                        .unit
                                                : '\u2014'
                                        }</span>
                                </div>
                                <div style="${
                                    'padding-top:'
                                    + '0.5rem;'
                                    + 'border-top:'
                                    + '1px solid '
                                    + 'hsl(var('
                                    + '--border))'
                                }"
                                    class="${
                                        'flex '
                                        + 'items-'
                                        + 'center '
                                        + 'justify-'
                                        + 'between'
                                    }">
                                    <span class="${
                                        'text-xs '
                                        + 'font-'
                                        + 'medium '
                                        + 'text-'
                                        + 'muted'
                                    }">
                                        Variance
                                    </span>
                                    ${this
                                        .#buildVariance(
                                        metric
                                            .baseline,
                                        metric
                                            .current,
                                        metric
                                            .isLowerBetter,
                                        metric.unit,
                                        metric
                                            .prefix,
                                    )}
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>`;
    }

    #buildEdgeKPIs(): SafeHtml {

        if (!this.#edge) {
            return html`
            <div class="card p-6">
                <p class="${
                    'text-muted text-sm'
                }">
                    No edge data available.
                </p>
            </div>`;
        }
        return html`
            <div class="card p-6">
                <div class="${
                    'flex items-center '
                    + 'justify-between '
                    + 'gap-3 mb-6'
                }">
                    <div class="${
                        'flex items-center '
                        + 'gap-3'
                    }">
                        <div style="${
                            'padding:0.5rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var(--primary)'
                            + '/0.1)'
                        }">
                            ${iconTarget(
                                20,
                                'text-primary',
                            )}
                        </div>
                        <div>
                            <h2 class="${
                                'text-lg '
                                + 'font-display '
                                + 'font-semibold'
                            }">
                                Edge Baseline
                                KPIs
                            </h2>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Original success
                                criteria from
                                idea approval
                            </p>
                        </div>
                    </div>
                    <span
                        class="${
                            'badge '
                            + 'badge-success '
                            + 'text-xs'
                        }">
                        ${iconShield(12, '')
                        } High Confidence
                    </span>
                </div>

                <div style="${
                    'display:flex;'
                    + 'flex-direction:column;'
                    + 'gap:1rem;'
                    + 'margin-bottom:1.5rem'
                }">
                    <h3 class="${
                        'text-sm font-medium '
                        + 'flex items-center '
                        + 'gap-2'
                    }">
                        ${iconBarChart(
                            16, 'text-primary',
                        )}
                        Business Outcomes
                        &amp; Metrics
                    </h3>
                    ${this.#edge.outcomes.map(
                        (outcome, oi) => html`
                        <div style="${
                            'padding:1rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var(--muted)'
                            + '/0.3);'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--border))'
                        }">
                            <div
                                class="${
                                    'flex '
                                    + 'items-start'
                                    + ' gap-3 mb-3'
                                }">
                                <div style="${
                                    'width:1.5rem;'
                                    + 'height:'
                                    + '1.5rem;'
                                    + 'border-'
                                    + 'radius:'
                                    + '9999px;'
                                    + 'background:'
                                    + 'hsl(var('
                                    + '--primary)'
                                    + '/0.1);'
                                    + 'display:'
                                    + 'flex;'
                                    + 'align-'
                                    + 'items:'
                                    + 'center;'
                                    + 'justify-'
                                    + 'content:'
                                    + 'center;'
                                    + 'font-size:'
                                    + '0.75rem;'
                                    + 'font-'
                                    + 'weight:700;'
                                    + 'color:hsl('
                                    + 'var('
                                    + '--primary));'
                                    + 'flex-'
                                    + 'shrink:0'
                                }">
                                    ${oi + 1}
                                </div>
                                <p class="${
                                    'font-medium'
                                }">
                                    ${outcome
                                        .description}
                                </p>
                            </div>
                            <div style="${
                                'padding-left:'
                                + '2.25rem;'
                                + 'display:flex;'
                                + 'flex-'
                                + 'direction:'
                                + 'column;'
                                + 'gap:0.5rem'
                            }">
                                ${outcome.metrics
                                    .map(kpi => {
                                    const target =
                                        parseFloat(
                                            kpi
                                                .target,
                                        );
                                    const current =
                                        parseFloat(
                                            kpi
                                                .current,
                                        );
                                    const onTrack =
                                        isKpiOnTrack(
                                            current,
                                            target,
                                            kpi.unit,
                                        );
                                    return html`
                                <div class="${
                                    'flex '
                                    + 'items-center'
                                    + ' justify-'
                                    + 'between '
                                    + 'gap-2'
                                }"
                                    style="${
                                        'padding:'
                                        + '0.5rem;'
                                        + 'border-'
                                        + 'radius:'
                                        + '0.25rem;'
                                        + 'background'
                                        + ':hsl(var('
                                        + '--back'
                                        + 'ground));'
                                        + 'border:'
                                        + '1px solid'
                                        + ' hsl(var('
                                        + '--border))'
                                    }">
                                    <div class="${
                                        'flex '
                                        + 'items-'
                                        + 'center '
                                        + 'gap-2'
                                    }">
                                        ${iconGauge(
                                            16,
                                            'text-'
                                            + 'muted',
                                        )}
                                        <span
                                            class="${
                                                'text'
                                                + '-sm'
                                            }">
                                            ${
                                                kpi
                                                    .name
                                            }
                                        </span>
                                    </div>
                                    <div class="${
                                        'flex '
                                        + 'items-'
                                        + 'center '
                                        + 'gap-4'
                                    }">
                                        <div
                                            class="${
                                                'text-'
                                                + 'right'
                                            }">
                                            <p
                                                class="${
                                                    'text'
                                                    + '-xs'
                                                    + ' text'
                                                    + '-muted'
                                                }">
                                                Target
                                            </p>
                                            <p
                                                class="${
                                                    'text'
                                                    + '-sm'
                                                    + ' font'
                                                    + '-medium'
                                                }">
                                                ${
                                                    kpi
                                                        .unit
                                                    === '$'
                                                    ? '$'
                                                    : ''
                                                }${
                                                    kpi
                                                        .target
                                                }${
                                                    kpi
                                                        .unit
                                                    === '$'
                                                    ? ''
                                                    : kpi
                                                        .unit
                                                }
                                            </p>
                                        </div>
                                        <div
                                            class="${
                                                'text-'
                                                + 'right'
                                            }">
                                            <p
                                                class="${
                                                    'text'
                                                    + '-xs'
                                                    + ' text'
                                                    + '-muted'
                                                }">
                                                Current
                                            </p>
                                            <p
                                                class="${
                                                    'text'
                                                    + '-sm'
                                                    + ' font'
                                                    + '-medium'
                                                    + ' '
                                                    + (onTrack
                                                        ? 'text'
                                                            + '-success'
                                                        : 'text'
                                                            + '-warning')
                                                }">
                                                ${
                                                    kpi
                                                        .unit
                                                    === '$'
                                                    ? '$'
                                                    : ''
                                                }${
                                                    kpi
                                                        .current
                                                }${
                                                    kpi
                                                        .unit
                                                    === '$'
                                                    ? ''
                                                    : kpi
                                                        .unit
                                                }
                                            </p>
                                        </div>
                                        <div
                                            style="${
                                                'width'
                                                + ':0.5'
                                                + 'rem;'
                                                + 'height'
                                                + ':0.5'
                                                + 'rem;'
                                                + 'border'
                                                + '-radius'
                                                + ':9999'
                                                + 'px;'
                                                + 'background:'
                                                + (onTrack
                                                    ? 'hsl(var('
                                                        + '--success))'
                                                    : 'hsl(var('
                                                        + '--warning))')
                                            }">
                                        </div>
                                    </div>
                                </div>`;
                                })}
                            </div>
                        </div>
                    `)}
                </div>

                <div style="${
                    'display:flex;'
                    + 'flex-direction:column;'
                    + 'gap:0.75rem'
                }">
                    <h3 class="${
                        'text-sm font-medium '
                        + 'flex items-center '
                        + 'gap-2'
                    }">
                        ${iconTrendingUp(
                            16, 'text-primary',
                        )}
                        Expected Impact
                        Timeline
                    </h3>
                    <div class="score-grid"
                        style="${
                            'gap:0.75rem'
                        }">
                        <div style="${
                            'padding:0.75rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var('
                            + '--success-soft));'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--success)'
                            + ' / 0.2)'
                        }">
                            <div class="${
                                'flex '
                                + 'items-center '
                                + 'gap-1 mb-2'
                            }">
                                ${iconClock(
                                    14,
                                    'text-success',
                                )}
                                <span class="${
                                    'text-xs '
                                    + 'font-medium'
                                    + ' text-'
                                    + 'success'
                                }">
                                    Short-term
                                    (0-3mo)
                                </span>
                            </div>
                            <p class="${
                                'text-xs'
                            }">
                                ${this.#edge
                                    .impact
                                    .shortTerm}
                            </p>
                        </div>
                        <div style="${
                            'padding:0.75rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var('
                            + '--warning-soft));'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--warning)/0.2)'
                        }">
                            <div class="${
                                'flex '
                                + 'items-center '
                                + 'gap-1 mb-2'
                            }">
                                ${iconClock(
                                    14,
                                    'text-warning',
                                )}
                                <span class="${
                                    'text-xs '
                                    + 'font-medium'
                                    + ' text-'
                                    + 'warning'
                                }">
                                    Mid-term
                                    (3-12mo)
                                </span>
                            </div>
                            <p class="${
                                'text-xs'
                            }">
                                ${this.#edge
                                    .impact
                                    .midTerm}
                            </p>
                        </div>
                        <div style="${
                            'padding:0.75rem;'
                            + 'border-radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var('
                            + '--primary)/0.05);'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--primary)/0.2)'
                        }">
                            <div class="${
                                'flex '
                                + 'items-center '
                                + 'gap-1 mb-2'
                            }">
                                ${iconClock(
                                    14,
                                    'text-primary',
                                )}
                                <span class="${
                                    'text-xs '
                                    + 'font-medium'
                                    + ' text-'
                                    + 'primary'
                                }">
                                    Long-term
                                    (12+mo)
                                </span>
                            </div>
                            <p class="${
                                'text-xs'
                            }">
                                ${this.#edge
                                    .impact
                                    .longTerm}
                            </p>
                        </div>
                    </div>
                </div>

                <div style="${
                    'margin-top:1rem;'
                    + 'padding-top:1rem;'
                    + 'border-top:1px solid '
                    + 'hsl(var(--border))'
                }"
                    class="${
                        'flex items-center '
                        + 'justify-between'
                    }">
                    <span class="${
                        'text-xs text-muted'
                    }">
                        Edge Owner
                    </span>
                    <span class="${
                        'text-sm font-medium'
                    }">
                        ${this.#edge.owner}
                    </span>
                </div>
            </div>`;
    }

    #buildProjectTabs(
        isEditing: boolean,
    ): SafeHtml {

        return html`
            <div class="card p-6">
                <div class="tabs"
                    role="tablist"
                    style="${
                        'margin-bottom:1.5rem'
                    }">
                    ${[
                        { id: 'tasks',
                            label: 'Tasks',
                            icon: iconListTodo },
                        { id: 'discussion',
                            label: 'Discussion',
                            icon:
                                iconMessageSquare },
                        { id: 'history',
                            label: 'History',
                            icon: iconHistory },
                        { id: 'linked',
                            label: 'Linked Data',
                            icon: iconFileText },
                    ].map((tab, tabIndex) =>
                        html`
                        <button
                            class="${
                                'tab'
                                + (tabIndex === 0
                                    ? ' active'
                                    : '')
                            }"
                            role="tab"
                            data-tab="${
                                tab.id
                            }">
                            ${tab.icon(16, '')
                            } ${tab.label}
                        </button>
                    `)}
                </div>

                <div id="tab-tasks"
                    class="tab-panel">
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:0.75rem'
                    }">
                        ${this.#tasks.map(
                            task => {
                            const prioColor = (
                                TASK_PRIORITY_CONFIG[
                                    task.priority
                                ]
                            )!.style;
                            return html`
                            <div class="card"
                                style="${
                                    'padding:1rem'
                                }">
                                <div class="${
                                    'flex '
                                    + 'items-start '
                                    + 'justify-'
                                    + 'between '
                                    + 'gap-3 mb-2'
                                }">
                                    <div style="${
                                        'flex:1'
                                    }">
                                        <div
                                            class="${
                                                'flex '
                                                + 'items-'
                                                + 'center '
                                                + 'gap-2 '
                                                + 'mb-1'
                                            }">
                                            <span
                                                class="${
                                                    'font-'
                                                    + 'medium'
                                                    + ' text'
                                                    + '-sm'
                                                }">
                                                ${
                                                    task
                                                        .name
                                                }
                                            </span>
                                            <span
                                                class="${
                                                    'pill'
                                                }"
                                                style="${
                                                    prioColor
                                                }">
                                                ${
                                                    task
                                                        .priority
                                                }
                                            </span>
                                            ${task
                                                .assigned
                                                ? html`<span
                                                    class="${
                                                        'pill'
                                                    }"
                                                    style="${
                                                        'background'
                                                        + ':hsl(var'
                                                        + '(--primary'
                                                        + ')/0.1);'
                                                        + 'color:'
                                                        + 'hsl(var'
                                                        + '(--primary'
                                                        + '))'
                                                    }">
                                                    ${
                                                        iconUsers(
                                                            10, '',
                                                        )
                                                    }
                                                    AI
                                                    Recommended
                                                </span>`
                                                : html``}
                                        </div>
                                        <p
                                            class="${
                                                'text-'
                                                + 'xs '
                                                + 'text-'
                                                + 'muted'
                                                + ' mb-2'
                                            }">
                                            ${
                                                task
                                                    .description
                                            }
                                        </p>
                                        <div
                                            class="${
                                                'flex'
                                                + ' flex'
                                                + '-wrap'
                                                + ' gap-'
                                                + '1.5'
                                            }">
                                            ${task
                                                .skills
                                                .map(
                                                    skill =>
                                                        html`<span
                                                            class="${
                                                                'pill'
                                                                + '-tag'
                                                            }"
                                                            style="${
                                                                'background'
                                                                + ':hsl('
                                                                + 'var('
                                                                + '--muted'
                                                                + ')/0.5)'
                                                            }">
                                                        ${
                                                            skill
                                                        }
                                                    </span>`,
                                            )}
                                            <span
                                                class="${
                                                    'text'
                                                    + '-xs'
                                                    + ' text'
                                                    + '-muted'
                                                }"
                                                style="${
                                                    'margin'
                                                    + '-left'
                                                    + ':0.25'
                                                    + 'rem'
                                                }">
                                                ${
                                                    iconClock(
                                                        12, '',
                                                    )
                                                }
                                                ${
                                                    task
                                                        .duration
                                                }d est.
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        class="${
                                            'btn '
                                            + 'btn-'
                                            + 'outline'
                                            + ' btn-sm'
                                            + ' text-xs'
                                        }">
                                        ${task
                                            .assigned
                                            ? task
                                                .assigned
                                            : 'Assign'}
                                    </button>
                                </div>
                            </div>`;
                        })}
                    </div>
                    <div class="${
                        'flex items-center '
                        + 'justify-between '
                        + 'mt-4 pt-4'
                    }"
                        style="${
                            'border-top:'
                            + '1px solid '
                            + 'hsl(var(--border))'
                        }">
                        <span class="${
                            'text-sm text-muted'
                        }">
                            ${this
                                .#assignedTaskCount
                            } assigned,
                            ${this
                                .#unassignedTaskCount
                            } unassigned
                        </span>
                        <button
                            class="${
                                'btn btn-primary '
                                + 'btn-sm'
                            }">
                            Save Assignments
                        </button>
                    </div>
                </div>
                <div id="${
                    'tab-discussion'
                }"
                    class="tab-panel"
                    style="display:none">
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;gap:1rem'
                    }">
                        <div class="${
                            'flex gap-3'
                        }">
                            <div style="${
                                'width:2.5rem;'
                                + 'height:2.5rem;'
                                + 'border-radius:'
                                + '9999px;'
                                + 'background:'
                                + 'hsl(var('
                                + '--primary)'
                                + '/0.1);'
                                + 'display:flex;'
                                + 'align-items:'
                                + 'center;'
                                + 'justify-'
                                + 'content:'
                                + 'center;'
                                + 'flex-shrink:0'
                            }">
                                <span
                                    class="${
                                        'text-sm '
                                        + 'font-bold'
                                        + ' text-'
                                        + 'primary'
                                    }">
                                    D
                                </span>
                            </div>
                            <div style="${
                                'flex:1'
                            }">
                                <textarea
                                    class="${
                                        'textarea'
                                    }"
                                    id="${
                                        'project-'
                                        + 'discussion'
                                        + '-comment'
                                    }"
                                    placeholder="${
                                        'Add a '
                                        + 'comment '
                                        + 'or '
                                        + 'update...'
                                    }"
                                    style="${
                                        'min-height'
                                        + ':5rem;'
                                        + 'resize:'
                                        + 'none'
                                    }">
                                </textarea>
                                <div style="${
                                    'display:flex;'
                                    + 'justify-'
                                    + 'content:'
                                    + 'flex-end;'
                                    + 'margin-top:'
                                    + '0.5rem'
                                }">
                                    <button
                                        class="${
                                            'btn '
                                            + 'btn-'
                                            + 'primary'
                                            + ' btn-sm'
                                        }"
                                        id="${
                                            'project'
                                            + '-dis'
                                            + 'cussion'
                                            + '-post'
                                            + '-btn'
                                        }"
                                        disabled>
                                        Post
                                        Comment
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div style="${
                            'border-top:'
                            + '1px solid '
                            + 'hsl(var(--border));'
                            + 'padding-top:1rem;'
                            + 'display:flex;'
                            + 'flex-direction:'
                            + 'column;'
                            + 'gap:1rem'
                        }">
                            ${this.#discussions
                                .map(
                                    discussion =>
                                        html`
                                <div class="${
                                    'flex gap-3'
                                }">
                                    <div style="${
                                        'width:'
                                        + '2.5rem;'
                                        + 'height:'
                                        + '2.5rem;'
                                        + 'border-'
                                        + 'radius:'
                                        + '9999px;'
                                        + 'background'
                                        + ':hsl(var('
                                        + '--muted));'
                                        + 'display:'
                                        + 'flex;'
                                        + 'align-'
                                        + 'items:'
                                        + 'center;'
                                        + 'justify-'
                                        + 'content:'
                                        + 'center;'
                                        + 'flex-'
                                        + 'shrink:0'
                                    }">
                                        <span
                                            class="${
                                                'text'
                                                + '-sm '
                                                + 'font'
                                                + '-bold'
                                                + ' text'
                                                + '-muted'
                                            }">
                                            ${
                                                initials(
                                                    discussion
                                                        .author,
                                                )
                                            }
                                        </span>
                                    </div>
                                    <div>
                                        <div
                                            class="${
                                                'flex'
                                                + ' items'
                                                + '-center'
                                                + ' gap-2'
                                                + ' mb-1'
                                            }">
                                            <span
                                                class="${
                                                    'font'
                                                    + '-medium'
                                                }">
                                                ${
                                                    discussion
                                                        .author
                                                }
                                            </span>
                                            <span
                                                class="${
                                                    'text'
                                                    + '-xs'
                                                    + ' text'
                                                    + '-muted'
                                                }">
                                                ${
                                                    formatDate(
                                                        discussion
                                                            .date,
                                                    )
                                                }
                                            </span>
                                        </div>
                                        <p
                                            class="${
                                                'text-sm'
                                                + ' text-'
                                                + 'muted'
                                            }">
                                            ${
                                                discussion
                                                    .message
                                            }
                                        </p>
                                    </div>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>
                <div id="${
                    'tab-history'
                }"
                    class="tab-panel"
                    style="display:none">
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:0.75rem'
                    }">
                        ${this.#versions.map(
                            (version,
                                versionIndex) =>
                                html`
                            <div class="${
                                'flex '
                                + 'items-start '
                                + 'gap-4'
                            }"
                                style="${
                                    'padding:1rem;'
                                    + 'border-'
                                    + 'radius:'
                                    + '0.5rem;'
                                    + (versionIndex
                                        === 0
                                        ? 'background'
                                            + ':hsl('
                                            + 'var('
                                            + '--primary'
                                            + ')/0.05);'
                                            + 'border:'
                                            + '1px '
                                            + 'solid '
                                            + 'hsl(var('
                                            + '--primary'
                                            + ')/0.2)'
                                        : 'background'
                                            + ':hsl('
                                            + 'var('
                                            + '--muted'
                                            + ')/0.3)')
                                }">
                                <span style="${
                                    'padding:'
                                    + '0.25rem '
                                    + '0.5rem;'
                                    + 'border-'
                                    + 'radius:'
                                    + '0.25rem;'
                                    + 'font-size:'
                                    + '0.75rem;'
                                    + 'font-'
                                    + 'weight:700;'
                                    + (versionIndex
                                        === 0
                                        ? 'background'
                                            + ':hsl('
                                            + 'var('
                                            + '--primary'
                                            + '));'
                                            + 'color:'
                                            + 'hsl(var('
                                            + '--primary'
                                            + '-fore'
                                            + 'ground))'
                                        : 'background'
                                            + ':hsl('
                                            + 'var('
                                            + '--muted'
                                            + '));'
                                            + 'color:'
                                            + 'hsl(var('
                                            + '--muted'
                                            + '-fore'
                                            + 'ground))')
                                }">
                                    ${
                                        version
                                            .version
                                    }
                                </span>
                                <div style="${
                                    'flex:1'
                                }">
                                    <p class="${
                                        'font-'
                                        + 'medium'
                                    }">
                                        ${
                                            version
                                                .changes
                                        }
                                    </p>
                                    <p class="${
                                        'text-xs '
                                        + 'text-'
                                        + 'muted'
                                    }"
                                        style="${
                                            'margin'
                                            + '-top:'
                                            + '0.25'
                                            + 'rem'
                                        }">
                                        ${
                                            version
                                                .author
                                        }
                                        &#x2022; ${
                                            formatDate(
                                                version
                                                    .date,
                                            )
                                        }
                                    </p>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
                <div id="tab-linked"
                    class="tab-panel"
                    style="display:none">
                    <div
                        style="${
                            'text-align:center;'
                            + 'padding:2rem 0'
                        }">
                        ${iconFileText(
                            48, 'text-muted',
                        )}
                        <p class="${
                            'text-muted '
                            + 'mt-4 mb-4'
                        }">
                            No linked data yet
                        </p>
                        <button
                            class="${
                                'btn btn-outline'
                                + ' btn-sm gap-2'
                            }">
                            ${iconPlus(16, '')
                            } Link Data Source
                        </button>
                    </div>
                </div>
            </div>`;
    }

    #buildProjectSidebar(): SafeHtml {

        return html`
            <div style="${
                'display:flex;'
                + 'flex-direction:column;'
                + 'gap:1.5rem'
            }">
                <div class="card p-6">
                    <div class="${
                        'flex items-center '
                        + 'justify-between mb-4'
                    }">
                        <h3 class="${
                            'font-display '
                            + 'font-semibold'
                        }">
                            Team
                        </h3>
                        <button
                            class="${
                                'btn btn-ghost '
                                + 'btn-sm gap-1'
                            }">
                            ${iconPlus(14, '')
                            } Add
                        </button>
                    </div>
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:0.75rem'
                    }">
                        ${this.#team.map(
                            teamMember => html`
                            <div
                                class="${
                                    'flex '
                                    + 'items-center'
                                    + ' gap-3'
                                }">
                                <div style="${
                                    'width:'
                                    + '2.25rem;'
                                    + 'height:'
                                    + '2.25rem;'
                                    + 'border-'
                                    + 'radius:'
                                    + '0.5rem;'
                                    + 'background:'
                                    + 'hsl(var('
                                    + '--primary)'
                                    + '/0.1);'
                                    + 'display:'
                                    + 'flex;'
                                    + 'align-'
                                    + 'items:'
                                    + 'center;'
                                    + 'justify-'
                                    + 'content:'
                                    + 'center;'
                                    + 'flex-'
                                    + 'shrink:0'
                                }">
                                    <span class="${
                                        'text-xs '
                                        + 'font-bold'
                                        + ' text-'
                                        + 'primary'
                                    }">
                                        ${initials(
                                            teamMember
                                                .name,
                                        )}
                                    </span>
                                </div>
                                <div
                                    style="${
                                        'flex:1;'
                                        + 'min-'
                                        + 'width:0'
                                    }">
                                    <p class="${
                                        'text-sm '
                                        + 'font-'
                                        + 'medium'
                                    }"
                                        style="${
                                            'white-'
                                            + 'space:'
                                            + 'nowrap;'
                                            + 'overflow'
                                            + ':hidden;'
                                            + 'text-'
                                            + 'overflow'
                                            + ':ellipsis'
                                        }">
                                        ${teamMember
                                            .name}
                                    </p>
                                    <p class="${
                                        'text-xs '
                                        + 'text-'
                                        + 'muted'
                                    }">
                                        ${teamMember
                                            .role}
                                    </p>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>

                <div class="card p-6">
                    <h3
                        class="${
                            'font-display '
                            + 'font-semibold '
                            + 'mb-4'
                        }">
                        Milestones
                    </h3>
                    <div style="${
                        'position:relative'
                    }">
                        ${this.#milestones.map(
                            ({
                                status, title,
                                date,
                            },
                                msIndex,
                            ) => {
                            const ms = status as
                                MilestoneStatus;
                            return html`
                            <div class="${
                                'flex gap-3'
                            }"
                                style="${
                                    'padding-'
                                    + 'bottom:'
                                    + (msIndex
                                        < this
                                            .#milestones
                                            .length
                                            - 1
                                        ? '1rem'
                                        : '0')
                                }">
                                <div style="${
                                    'display:flex;'
                                    + 'flex-'
                                    + 'direction:'
                                    + 'column;'
                                    + 'align-'
                                    + 'items:'
                                    + 'center'
                                }">
                                    ${
                                        this
                                            .#buildMilestoneIcon(
                                            ms,
                                        )
                                    }
                                    ${msIndex
                                        < this
                                            .#milestones
                                            .length
                                            - 1
                                        ? html`<div
                                            style="${
                                                'width'
                                                + ':2px;'
                                                + 'flex'
                                                + ':1;'
                                                + 'background'
                                                + ':hsl('
                                                + 'var('
                                                + '--border'
                                                + '));'
                                                + 'margin'
                                                + '-top:'
                                                + '0.25'
                                                + 'rem'
                                            }">
                                            </div>`
                                        : html``}
                                </div>
                                <div
                                    style="${
                                        'flex:1;'
                                        + 'padding-'
                                        + 'bottom:'
                                        + '0.5rem'
                                    }">
                                    <p
                                        class="${
                                            'text-sm'
                                            + ' font-'
                                            + 'medium'
                                        }"
                                        style="${
                                            MILESTONE_STATUS_CONFIG[
                                                ms
                                            ].textStyle
                                        }">
                                        ${title}
                                    </p>
                                    <p class="${
                                        'text-xs '
                                        + 'text-'
                                        + 'muted'
                                    }">
                                        ${formatDate(
                                            date,
                                        )}
                                    </p>
                                </div>
                            </div>
                        `; })}
                    </div>
                </div>
            </div>`;
    }

    #buildWorkflowsSection(
        workflows: WorkflowListItem[],
        projectId: string,
    ): SafeHtml {
        const header = html`
            <div class="${
                'flex items-center '
                + 'justify-between mb-4'
            }">
                <h2 class="${
                    'text-lg font-display '
                    + 'font-semibold'
                }">
                    Workflows
                </h2>
                <button
                    id="new-workflow-btn"
                    class="${
                        'btn btn-primary '
                        + 'btn-sm gap-2'
                    }">
                    ${iconPlus(14, '')}
                    New Workflow
                </button>
            </div>`;

        if (workflows.length === 0) {
            return html`
                <div class="card p-6">
                    ${header}
                    <div style="${
                        'text-align:center;'
                        + 'padding:2rem 0'
                    }">
                        ${iconGitBranch(
                            48, 'text-muted',
                        )}
                        <p class="${
                            'text-muted mt-4'
                        }">
                            No workflows yet
                        </p>
                    </div>
                </div>`;
        }

        return html`
            <div class="card p-6">
                ${header}
                <div style="${
                    'display:flex;'
                    + 'flex-direction:column;'
                    + 'gap:0.75rem'
                }">
                    ${workflows.map(wf =>
                        html`
                        <a
                            href="#"
                            data-workflow-id="${
                                wf.id
                            }"
                            class="${
                                'card card-hover'
                            }"
                            style="${
                                'padding:1rem;'
                                + 'text-decoration'
                                + ':none;'
                                + 'color:inherit;'
                                + 'display:block'
                            }">
                            <div class="${
                                'flex '
                                + 'items-center '
                                + 'gap-3'
                            }">
                                <div style="${
                                    'padding:'
                                    + '0.5rem;'
                                    + 'border-'
                                    + 'radius:'
                                    + '0.5rem;'
                                    + 'background:'
                                    + 'hsl(var('
                                    + '--primary)'
                                    + '/0.1)'
                                }">
                                    ${iconGitBranch(
                                        20,
                                        'text-primary',
                                    )}
                                </div>
                                <div style="${
                                    'min-width:0;'
                                    + 'flex:1'
                                }">
                                    <p class="${
                                        'font-medium'
                                        + ' text-sm'
                                    }">
                                        ${wf.name}
                                    </p>
                                    ${wf.description
                                        ? html`<p
                                            class="${
                                                'text-xs'
                                                + ' text-'
                                                + 'muted'
                                            }">${
                                                wf
                                                .description
                                            }</p>`
                                        : html``}
                                </div>
                                <div class="${
                                    'flex gap-3'
                                }">
                                    <span
                                        class="${
                                            'badge'
                                            + ' badge-'
                                            + 'muted'
                                            + ' text-xs'
                                        }">
                                        ${String(
                                            wf
                                            .nodeCount,
                                        )} nodes
                                    </span>
                                    <span
                                        class="${
                                            'badge'
                                            + ' badge-'
                                            + 'muted'
                                            + ' text-xs'
                                        }">
                                        ${String(
                                            wf
                                            .edgeCount,
                                        )} edges
                                    </span>
                                </div>
                            </div>
                        </a>
                    `)}
                </div>
            </div>`;
    }

    buildDetailView(
        projectId: string,
        workflows: WorkflowListItem[],
        isEditing: boolean,
    ): SafeHtml {
        const statusOptions =
                Object.entries(
                    PROJECT_STATUS_CONFIG,
                ).map(
                    ([key, cfg]) =>
                        html`<option
                            value="${key}"
                            ${trusted(
                                key
                                    === this
                                        .#status
                                    ? 'selected'
                                    : '',
                            )}>${
                                cfg.label
                        }</option>`,
                );

        return html`
            <div style="${
                'max-width:64rem;'
                + 'margin:0 auto'
            }">
                <div class="${
                    'flex items-center '
                    + 'gap-2 text-sm '
                    + 'text-muted mb-4'
                }">
                    <a href="${
                        '../projects/index.html'
                    }"
                        class="hover-link">
                        Projects
                    </a>
                    <span>/</span>
                    <span>${
                        this.#title
                    }</span>
                </div>

                <div class="${
                    'flex items-start '
                    + 'justify-between '
                    + 'gap-4 mb-6'
                }">
                    <div
                        class="${
                            'flex items-center'
                            + ' gap-4'
                        }">
                        <button
                            class="${
                                'btn btn-ghost '
                                + 'btn-icon'
                            }"
                            id="${
                                'project-back-btn'
                            }">
                            ${iconArrowLeft(
                                20, '',
                            )}
                        </button>
                        <div>
                            <div class="${
                                'flex flex-wrap '
                                + 'items-center '
                                + 'gap-3 mb-2'
                            }">
                                ${isEditing
                                    ? html`<input
                                        class="${
                                            'input'
                                        }"
                                        id="${
                                            'project'
                                            + '-edit-'
                                            + 'title'
                                        }"
                                        value="${
                                            this
                                                .#title
                                        }"
                                        style="${
                                            'font-'
                                            + 'size:'
                                            + '1.125'
                                            + 'rem;'
                                            + 'font-'
                                            + 'weight'
                                            + ':700'
                                        }" />`
                                    : html`<h1
                                        class="${
                                            'text-xl'
                                            + ' font-'
                                            + 'display'
                                            + ' font-'
                                            + 'bold'
                                        }">
                                        ${
                                            this
                                                .#title
                                        }
                                    </h1>`}
                                ${isEditing
                                    ? html`<select
                                        class="${
                                            'input'
                                        }"
                                        id="${
                                            'project'
                                            + '-edit-'
                                            + 'status'
                                        }"
                                        style="${
                                            'width:'
                                            + 'auto'
                                        }">
                                        ${
                                            statusOptions
                                        }
                                    </select>`
                                    : html`<span
                                        class="${
                                            'badge '
                                            + this
                                                .#statusClassName
                                            + ' text-xs'
                                        }">
                                        ${
                                            iconCheckCircle2(
                                                14, '',
                                            )
                                        }
                                        ${
                                            this
                                                .#statusLabel
                                        }
                                    </span>`}
                            </div>
                            <p class="${
                                'text-sm '
                                + 'text-muted'
                            }">
                                Led by ${
                                    this
                                        .#projectLead
                                }
                                &#x2022; ${
                                    this
                                        .#progress
                                }%
                                complete
                            </p>
                        </div>
                    </div>
                    ${isEditing
                        ? html`<div
                            class="${
                                'flex gap-2'
                            }">
                            <button
                                class="${
                                    'btn '
                                    + 'btn-outline'
                                    + ' gap-2'
                                }"
                                id="${
                                    'project-'
                                    + 'cancel-btn'
                                }">
                                ${iconX(16, '')
                                } Cancel
                            </button>
                            <button
                                class="${
                                    'btn '
                                    + 'btn-primary'
                                    + ' gap-2'
                                }"
                                id="${
                                    'project-'
                                    + 'save-btn'
                                }">
                                ${iconSave(
                                    16, '',
                                )} Save
                            </button>
                        </div>`
                        : html`<button
                            class="${
                                'btn '
                                + 'btn-outline '
                                + 'gap-2'
                            }"
                            id="${
                                'project-'
                                + 'edit-btn'
                            }">
                            ${iconEdit(16, '')
                            } Edit
                        </button>`}
                </div>

                <div class="${
                    'actions-grid mb-8'
                }"
                    style="${
                        'gap:0.75rem'
                    }">
                    <a href="#"
                        class="${
                            'card card-hover'
                        }"
                        style="${
                            'padding:1rem;'
                            + 'text-decoration:'
                            + 'none;'
                            + 'color:inherit'
                        }"
                        data-navigate-to-engineering>
                        <div
                            class="${
                                'flex '
                                + 'items-center '
                                + 'gap-3'
                            }">
                            <div style="${
                                'padding:0.5rem;'
                                + 'border-radius:'
                                + '0.5rem;'
                                + 'background:'
                                + 'hsl(var('
                                + '--primary)'
                                + '/0.1)'
                            }">
                                ${iconCode(
                                    20,
                                    'text-primary',
                                )}
                            </div>
                            <div style="${
                                'min-width:0'
                            }">
                                <p class="${
                                    'font-medium '
                                    + 'text-sm'
                                }">
                                    Engineering
                                </p>
                                <p class="${
                                    'text-xs '
                                    + 'text-muted '
                                    + 'hidden-'
                                    + 'mobile'
                                }">
                                    Requirements
                                    &amp;
                                    clarifications
                                </p>
                            </div>
                        </div>
                    </a>
                    <a href="${
                        '../organization/'
                        + 'teams.html'
                    }"
                        class="${
                            'card card-hover'
                        }"
                        style="${
                            'padding:1rem;'
                            + 'text-decoration:'
                            + 'none;'
                            + 'color:inherit'
                        }">
                        <div
                            class="${
                                'flex '
                                + 'items-center '
                                + 'gap-3'
                            }">
                            <div style="${
                                'padding:0.5rem;'
                                + 'border-radius:'
                                + '0.5rem;'
                                + 'background:'
                                + 'hsl(var('
                                + '--primary)'
                                + '/0.1)'
                            }">
                                ${iconUsers(
                                    20,
                                    'text-primary',
                                )}
                            </div>
                            <div style="${
                                'min-width:0'
                            }">
                                <p class="${
                                    'font-medium '
                                    + 'text-sm'
                                }">
                                    Team
                                </p>
                                <p class="${
                                    'text-xs '
                                    + 'text-muted '
                                    + 'hidden-'
                                    + 'mobile'
                                }">
                                    Manage
                                    assignments
                                </p>
                            </div>
                        </div>
                    </a>
                    <a href="${
                        '../flow/index.html'
                    }"
                        class="${
                            'card card-hover'
                        }"
                        style="${
                            'padding:1rem;'
                            + 'text-decoration:'
                            + 'none;'
                            + 'color:inherit'
                        }">
                        <div
                            class="${
                                'flex '
                                + 'items-center '
                                + 'gap-3'
                            }">
                            <div style="${
                                'padding:0.5rem;'
                                + 'border-radius:'
                                + '0.5rem;'
                                + 'background:'
                                + 'hsl(var('
                                + '--primary)'
                                + '/0.1)'
                            }">
                                ${iconGitBranch(
                                    20,
                                    'text-primary',
                                )}
                            </div>
                            <div style="${
                                'min-width:0'
                            }">
                                <p class="${
                                    'font-medium '
                                    + 'text-sm'
                                }">
                                    Workflows
                                </p>
                                <p class="${
                                    'text-xs '
                                    + 'text-muted '
                                    + 'hidden-'
                                    + 'mobile'
                                }">
                                    Design
                                    workflows
                                </p>
                            </div>
                        </div>
                    </a>
                    <a href="${
                        '../crunch/index.html'
                    }"
                        class="${
                            'card card-hover'
                        }"
                        style="${
                            'padding:1rem;'
                            + 'text-decoration:'
                            + 'none;'
                            + 'color:inherit'
                        }">
                        <div
                            class="${
                                'flex '
                                + 'items-center '
                                + 'gap-3'
                            }">
                            <div style="${
                                'padding:0.5rem;'
                                + 'border-radius:'
                                + '0.5rem;'
                                + 'background:'
                                + 'hsl(var('
                                + '--primary)'
                                + '/0.1)'
                            }">
                                ${iconDatabase(
                                    20,
                                    'text-primary',
                                )}
                            </div>
                            <div style="${
                                'min-width:0'
                            }">
                                <p class="${
                                    'font-medium '
                                    + 'text-sm'
                                }">
                                    Crunch
                                </p>
                                <p class="${
                                    'text-xs '
                                    + 'text-muted '
                                    + 'hidden-'
                                    + 'mobile'
                                }">
                                    Data inputs
                                </p>
                            </div>
                        </div>
                    </a>
                </div>

                <div class="${
                    'detail-grid'
                }"
                    style="gap:2rem">
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:1.5rem'
                    }">
                        ${this
                            .#buildProjectSummary(
                            isEditing,
                        )}
                        ${this
                            .#buildBaselineComparison(
                            isEditing,
                        )}
                        ${this
                            .#buildEdgeKPIs()}
                        ${this
                            .#buildProjectTabs(
                            isEditing,
                        )}
                        ${this
                            .#buildWorkflowsSection(
                            workflows,
                            projectId,
                        )}
                    </div>
                    ${this
                        .#buildProjectSidebar()}
                </div>
            </div>`;
    }
}
