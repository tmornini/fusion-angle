import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { mutateSlot } from '../dom.ts';
import {
    iconClock,
    iconDollarSign,
    iconCalendar, iconTarget,
    iconCheckCircle2,
    iconArrowLeft, iconPlus,
    iconArrowUpRight, iconArrowDownRight,
    iconMinus,
    iconGitBranch, iconInfo,
    iconEdit, iconSave, iconX,
    iconTrendingUp,
} from '../icons.ts';
import {
    formatCalendarDate,
    toDateInputValue,
    DISPLAY_ABSENT,
} from '../core.ts';
import type {
    ProjectView,
    ProjectFieldsPatch,
    ProjectState,
} from '../adapters/index.ts';
import {
    PROJECT_STATE_CONFIG,
} from './state-display.ts';
import {
    COST_DIVISOR,
    isProjectState,
} from '../adapters/index.ts';
import type {
    FlowListItem,
} from '../adapters/flows.ts';

export interface ProjectDraftFields {
    title: string;
    description: string;
    state: string;
    startDate: string;
    targetEndDate: string;
    costBaseline: string;
}

export type ProjectFieldKey =
    keyof ProjectDraftFields;

export interface ProjectPatch {
    fields: ProjectFieldsPatch;
    state: ProjectState;
}

export function projectDraftFromView(
    view: ProjectView,
): ProjectDraftFields {
    return {
        title: view.titleText(),
        description: view.descriptionText(),
        state: view.stateValue(),
        startDate: toDateInputValue(
            view.startDateValue(),
        ),
        targetEndDate: toDateInputValue(
            view.targetEndDateValue(),
        ),
        costBaseline: String(
            view.costBaselineK(),
        ),
    };
}

export function projectPatchFromDraft(
    view: ProjectView,
    draft: ProjectDraftFields,
): ProjectPatch {
    const fallbackState = view.stateValue();
    const state = isProjectState(draft.state)
        ? draft.state
        : fallbackState;
    // An empty or non-numeric cost is a MISSING value, not
    // zero — Number('') is 0, and storing it would fabricate
    // a $0k baseline. Throw; the save path's catch surfaces
    // the message as a toast.
    const costK = Number(draft.costBaseline);
    if (
        draft.costBaseline.trim() === ''
        || Number.isNaN(costK)
    ) {
        throw new Error(
            'estimated cost must be a number, got "'
            + draft.costBaseline + '"',
        );
    }
    return {
        fields: {
            title: draft.title,
            description: draft.description,
            startDate: draft.startDate,
            targetEndDate: draft.targetEndDate,
            estimatedCost: costK * COST_DIVISOR,
        },
        state,
    };
}

function buildShell(
    container: HTMLElement,
): void {
    setHtml(container, html`
<div class="project-detail-host">
    <div class="overview">
        <div class="${
            'flex items-start'
            + ' justify-between gap-4 mb-6'
        }">
            <div class="${
                'flex items-center gap-4'
            }">
                <button
                    class="${
                        'btn btn-ghost btn-icon'
                    }"
                    id="project-back-btn"
                    data-project-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(20, '')}
                </button>
                <div class="project-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-start gap-2'
            }">
                <div id="project-review-actions">
                </div>
                <div id="project-lifecycle-actions">
                </div>
                <div class="${
                    'flex gap-2'
                    + ' project-actions-slot'
                }"></div>
            </div>
        </div>

        <div class="${
            'detail-grid'
            + ' detail-grid-spaced'
        }">
            <div class="stack-lg">
                <div class="${
                    'project-summary-slot'
                }"></div>
                <div class="${
                    'project-metrics-slot'
                }"></div>
                <div id="project-objectives-section">
                </div>
            </div>
            <div class="project-sidebar-slot"></div>
        </div>
    </div>
    ${buildNewFlowDialog()}
</div>`);
}

function buildSubtitle(
    view: ProjectView,
): SafeHtml {
    return html`
        <p class="text-sm text-muted">
            ${view.progressPercent()}%
            of schedule elapsed
        </p>`;
}

function buildReadonlyTitleSection(
    view: ProjectView,
): SafeHtml {
    const cfg = PROJECT_STATE_CONFIG[view.stateValue()];
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl font-display'
                + ' font-bold'
            }">
                ${view.titleText()}
            </h1>
            <span class="${
                'badge '
                + cfg.className
                + ' text-xs'
            }">
                ${iconCheckCircle2(14, '')}
                ${cfg.label}
            </span>
        </div>
        ${buildSubtitle(view)}`;
}

function buildEditableTitleSection(
    view: ProjectView,
    draft: ProjectDraftFields,
): SafeHtml {
    const stateOptions =
        Object.entries(
            PROJECT_STATE_CONFIG,
        ).map(([key, cfg]) =>
            html`<option
                value="${key}"
                ${trusted(
                    key === draft.state
                        ? 'selected'
                        : '',
                )}>${cfg.label}</option>`,
        );
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <input class="${
                'input input-md-bold'
            }"
                id="project-edit-title"
                data-project-field="title"
                value="${draft.title}" />
            <select class="${
                'input select-auto'
            }"
                id="project-edit-state"
                data-project-field="state">
                ${stateOptions}
            </select>
        </div>
        ${buildSubtitle(view)}`;
}

function buildReadonlyActionButtons(
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="project-edit-btn"
            data-project-action="edit">
            ${iconEdit(16, '')} Edit
        </button>`;
}

function buildEditableActionButtons(
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="project-cancel-btn"
            data-project-action="cancel">
            ${iconX(16, '')} Cancel
        </button>
        <button
            class="${
                'btn btn-primary gap-2'
            }"
            id="project-save-btn"
            data-project-action="save">
            ${iconSave(16, '')} Save
        </button>`;
}

function buildReadonlyDateCell(
    icon: (
        size: number, cls: string,
    ) => SafeHtml,
    label: string,
    savedDate: string,
): SafeHtml {
    return html`
        <div class="${
            'flex items-center gap-3'
            + ' summary-stat-cell'
        }">
            ${icon(20, 'text-primary')}
            <div>
                <p class="${
                    'text-xs text-muted'
                }">${label}</p>
                <p class="${
                    'text-sm font-medium'
                }">${formatCalendarDate(savedDate)}</p>
            </div>
        </div>`;
}

function buildEditableDateCell(
    icon: (
        size: number, cls: string,
    ) => SafeHtml,
    label: string,
    id: string,
    field: ProjectFieldKey,
    value: string,
): SafeHtml {
    return html`
        <div class="${
            'flex items-center gap-3'
            + ' summary-stat-cell'
        }">
            ${icon(20, 'text-primary')}
            <div>
                <p class="${
                    'text-xs text-muted'
                }">${label}</p>
                <input type="date"
                    id="${id}"
                    data-project-field="${field}"
                    value="${value}"
                    class="input mt-1" />
            </div>
        </div>`;
}

function buildScheduleProgress(
    view: ProjectView,
): SafeHtml {
    return html`
        <div class="mt-6">
            <div class="${
                'flex items-center'
                + ' justify-between mb-2'
            }">
                <span class="${
                    'text-sm font-medium'
                }">
                    Schedule Progress
                </span>
                <span class="${
                    'text-sm font-bold'
                    + ' text-primary'
                }">${
                    view.progressPercent()
                }%</span>
            </div>
            <div class="progress"><div
                class="progress-fill"
                style="--progress-fill:${
                    view.progressPercent()
                }%"></div></div>
        </div>`;
}

function buildReadonlyProjectSummary(
    view: ProjectView,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h2 class="${
                'text-lg font-display'
                + ' font-semibold mb-4'
            }">
                Project Summary
            </h2>
            <p class="${
                'text-sm text-muted mb-6'
            }">${view.descriptionText()}</p>
            <div class="${
                'grid grid-cols-2 gap-4'
            }">
                ${buildReadonlyDateCell(
                    iconCalendar,
                    'Start Date',
                    view.startDateValue(),
                )}
                ${buildReadonlyDateCell(
                    iconTarget,
                    'Target End',
                    view.targetEndDateValue(),
                )}
            </div>
            ${buildScheduleProgress(view)}
        </div>`;
}

function buildEditableProjectSummary(
    view: ProjectView,
    draft: ProjectDraftFields,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h2 class="${
                'text-lg font-display'
                + ' font-semibold mb-4'
            }">
                Project Summary
            </h2>
            <textarea class="${
                'textarea mb-6'
                + ' resize-none'
            }"
                id="${
                    'project-edit-description'
                }"
                data-project-field="${
                    'description'
                }"
                rows="3">${
                    draft.description
                }</textarea>
            <div class="${
                'grid grid-cols-2 gap-4'
            }">
                ${buildEditableDateCell(
                    iconCalendar,
                    'Start Date',
                    'project-edit-start-date',
                    'startDate',
                    draft.startDate,
                )}
                ${buildEditableDateCell(
                    iconTarget,
                    'Target End',
                    'project-edit-end-date',
                    'targetEndDate',
                    draft.targetEndDate,
                )}
            </div>
            ${buildScheduleProgress(view)}
        </div>`;
}

interface MetricArgs {
    label: string;
    inputId: string;
    field: ProjectFieldKey | null;
    icon: (
        s: number, c: string,
    ) => SafeHtml;
    baseline: number | null;
    actual: number | null;
    unit: string;
    prefix: string;
    isLowerBetter: boolean;
}

function buildVariance(
    baseline: number | null,
    actual: number | null,
    isLowerBetter: boolean,
    unit: string,
    prefix: string,
): SafeHtml {
    if (baseline === null || actual === null) {
        return html`<span class="text-muted"
            >${DISPLAY_ABSENT}</span>`;
    }
    const diff = actual - baseline;
    if (diff === 0)
        return html`<span class="text-muted"
            >${iconMinus(16, '')} 0</span>`;
    const good = isLowerBetter
        ? diff < 0
        : diff > 0;
    const icon = diff < 0
        ? iconArrowDownRight(16, '')
        : iconArrowUpRight(16, '');
    const tone = good
        ? 'variance-good'
        : 'variance-bad';
    return html`<span class="${
        'flex items-center gap-1'
        + ' font-bold text-sm '
        + tone
    }">${icon} ${prefix}${
        Math.abs(diff)
    }${unit}</span>`;
}

function buildMetricCell(
    m: MetricArgs,
    baselineCell: SafeHtml,
): SafeHtml {
    return html`
        <div class="metric-cell">
            <div class="${
                'flex items-center'
                + ' gap-2 mb-3'
            }">
                ${m.icon(20, 'text-primary')}
                <span class="font-medium">
                    ${m.label}
                </span>
            </div>
            <div class="${
                'flex flex-col gap-2'
            }">
                <div class="${
                    'flex items-center'
                    + ' justify-between'
                }">
                    <span class="${
                        'text-xs text-muted'
                    }">Actual</span>
                    <span class="${
                        'text-sm font-medium'
                    }">${
                        m.actual
                            ? m.prefix
                                + m.actual
                                + m.unit
                            : DISPLAY_ABSENT
                    }</span>
                </div>
                <div class="${
                    'flex items-center'
                    + ' justify-between'
                }">
                    <span class="${
                        'text-xs text-muted'
                    }">Baseline</span>
                    ${baselineCell}
                </div>
                <div class="${
                    'flex items-center'
                    + ' justify-between'
                    + ' metric-cell-row-divider'
                }">
                    <span class="${
                        'text-xs font-medium'
                        + ' text-muted'
                    }">Variance</span>
                    ${buildVariance(
                        m.baseline,
                        m.actual,
                        m.isLowerBetter,
                        m.unit,
                        m.prefix,
                    )}
                </div>
            </div>
        </div>`;
}

function buildReadonlyBaselineCell(
    m: MetricArgs,
): SafeHtml {
    return html`<span class="${
        'text-sm font-medium'
    }">${
        m.baseline
            ? m.prefix + m.baseline + m.unit
            : DISPLAY_ABSENT
    }</span>`;
}

function buildEditableBaselineCell(
    m: MetricArgs,
): SafeHtml {
    if (!m.field) {
        return buildReadonlyBaselineCell(m);
    }
    return html`<input
        type="number"
        id="${
            'project-edit-'
            + m.inputId
            + '-baseline'
        }"
        data-project-field="${m.field}"
        value="${String(m.baseline)}"
        class="${
            'input input-narrow-num'
        }"
        min="0"
        step="any" />`;
}

function buildReadonlyMetrics(
    view: ProjectView,
): SafeHtml {
    const metrics: MetricArgs[] = [
        {
            label: 'Time',
            inputId: 'time',
            field: null,
            icon: iconClock,
            baseline: view.timeBaselineDays(),
            actual: view.timeActualDays(),
            unit: 'd',
            prefix: '',
            isLowerBetter: true,
        },
        {
            label: 'Cost',
            inputId: 'cost',
            field: 'costBaseline',
            icon: iconDollarSign,
            baseline: view.costBaselineK(),
            actual: view.costActualK(),
            unit: 'k',
            prefix: '$',
            isLowerBetter: true,
        },
        {
            label: 'Impact',
            inputId: 'impact',
            field: null,
            icon: iconTrendingUp,
            baseline: view.impactBaselineMean(),
            actual: view.impactActualMean(),
            unit: ' pts',
            prefix: '',
            isLowerBetter: false,
        },
    ];
    return html`
        <div class="card p-6">
            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <h2 class="${
                    'text-lg font-display'
                    + ' font-semibold'
                }">
                    Project Metrics
                </h2>
                <span class="${
                    'text-xs text-muted'
                }">
                    Real-time comparison
                </span>
            </div>
            <div class="score-grid">
                ${metrics.map(m =>
                    buildMetricCell(
                        m,
                        buildReadonlyBaselineCell(
                            m,
                        ),
                    ))}
            </div>
        </div>`;
}

function buildEditableMetrics(
    view: ProjectView,
    draft: ProjectDraftFields,
): SafeHtml {
    const metrics: MetricArgs[] = [
        {
            label: 'Time',
            inputId: 'time',
            field: null,
            icon: iconClock,
            baseline: view.timeBaselineDays(),
            actual: view.timeActualDays(),
            unit: 'd',
            prefix: '',
            isLowerBetter: true,
        },
        {
            label: 'Cost',
            inputId: 'cost',
            field: 'costBaseline',
            icon: iconDollarSign,
            baseline:
                Number(draft.costBaseline),
            actual: view.costActualK(),
            unit: 'k',
            prefix: '$',
            isLowerBetter: true,
        },
        {
            label: 'Impact',
            inputId: 'impact',
            field: null,
            icon: iconTrendingUp,
            baseline: view.impactBaselineMean(),
            actual: view.impactActualMean(),
            unit: ' pts',
            prefix: '',
            isLowerBetter: false,
        },
    ];
    return html`
        <div class="card p-6">
            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <h2 class="${
                    'text-lg font-display'
                    + ' font-semibold'
                }">
                    Project Metrics
                </h2>
                <span class="${
                    'text-xs text-muted'
                }">
                    Real-time comparison
                </span>
            </div>
            <div class="score-grid">
                ${metrics.map(m =>
                    buildMetricCell(
                        m,
                        buildEditableBaselineCell(
                            m,
                        ),
                    ))}
            </div>
        </div>`;
}

function buildFlowCard(
    flow: FlowListItem,
): SafeHtml {
    return html`
        <button
            type="button"
            data-flow-id="${flow.id}"
            class="${
                'card card-hover'
                + ' flow-card-link'
            }">
            <div class="${
                'flex items-center gap-3'
            }">
                <div class="flow-icon-pill">
                    ${iconGitBranch(
                        20, 'text-primary',
                    )}
                </div>
                <div class="flex-fill">
                    <p class="${
                        'font-medium text-sm'
                    }">${flow.name}</p>
                </div>
                <div class="flex gap-3">
                    <span class="${
                        'badge badge-muted'
                        + ' text-xs'
                    }">${String(
                        flow.nodeCount,
                    )} nodes</span>
                    <span class="${
                        'badge badge-muted'
                        + ' text-xs'
                    }">${String(
                        flow.edgeCount,
                    )} edges</span>
                </div>
            </div>
        </button>`;
}

function buildFlowsSection(
    isApproved: boolean,
    flows: FlowListItem[],
): SafeHtml {
    const header = html`
        <div class="${
            'flex items-center'
            + ' justify-between mb-4'
        }">
            <h2 class="${
                'text-lg font-display'
                + ' font-semibold'
            }">Flows</h2>
            ${isApproved
                ? html`<button
                    id="new-flow-btn"
                    data-dialog-open="${
                        'new-flow'
                    }"
                    class="${
                        'btn btn-primary'
                        + ' btn-sm gap-2'
                    }">
                    ${iconPlus(14, '')}
                    New Flow
                </button>`
                : html`<span class="${
                    'status-badge'
                    + ' status-badge-info'
                }">
                    ${iconInfo(14, '')}
                    Approve to add flows
                </span>`}
        </div>`;

    if (flows.length === 0) {
        return html`
            <div class="card p-6">
                ${header}
                <div class="${
                    'text-center py-8'
                }">
                    ${iconGitBranch(
                        48, 'text-muted',
                    )}
                    <p class="${
                        'text-muted mt-4'
                    }">
                        ${isApproved
                            ? 'No flows yet'
                            : 'Flow creation'
                            + ' limited to'
                            + ' approved'
                            + ' projects only'}
                    </p>
                </div>
            </div>`;
    }

    return html`
        <div class="card p-6">
            ${header}
            <div class="${
                'flex flex-col gap-3'
            }">
                ${flows.map(
                    f => buildFlowCard(f),
                )}
            </div>
        </div>`;
}

function buildSidebar(
    flows: FlowListItem[],
    isApproved: boolean,
): SafeHtml {
    return html`
        <div class="stack-lg">
            ${buildFlowsSection(
                isApproved, flows,
            )}
        </div>`;
}

function buildNewFlowDialog(): SafeHtml {
    return html`<dialog class="${
    'dialog dialog-narrow'
}"
    id="new-flow-dialog">
<div class="${
    'dialog-section'
    + ' dialog-section-divider-bottom'
}">
<h3 class="${
    'text-lg font-display'
    + ' font-semibold'
}">New Flow</h3>
<p class="text-sm text-muted"
    >Name this flow</p>
</div>
<div class="${
    'dialog-section flex flex-col gap-4'
}">
<div>
<label class="label mb-1"
    for="new-flow-name"
    >Flow Name</label>
<input class="input"
    id="new-flow-name"
    placeholder="${
        'e.g., Customer Onboarding'
    }" />
</div>
</div>
<div class="${
    'dialog-actions-row'
    + ' dialog-section-divider-top'
}">
<button class="btn btn-outline"
    id="new-flow-cancel"
    data-dialog-cancel="new-flow"
    >Cancel</button>
<button class="btn btn-primary"
    id="new-flow-submit"
    data-project-action="${
        'new-flow-submit'
    }"
    >Create</button>
</div>
</dialog>`;
}

export class ProjectDetailPresenter {
    readonly #view: ProjectView;
    readonly #flows: FlowListItem[];

    constructor(
        view: ProjectView,
        flows: FlowListItem[],
    ) {
        this.#view = view;
        this.#flows = flows;
    }

    idForLink(): string {
        return this.#view.idForLink();
    }

    isApproved(): boolean {
        return this.#view.isApproved();
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateSlot(
            container,
            '.project-title-slot',
            buildReadonlyTitleSection(
                this.#view,
            ),
        );
        mutateSlot(
            container,
            '.project-actions-slot',
            buildReadonlyActionButtons(),
        );
        mutateSlot(
            container,
            '.project-summary-slot',
            buildReadonlyProjectSummary(
                this.#view,
            ),
        );
        mutateSlot(
            container,
            '.project-metrics-slot',
            buildReadonlyMetrics(this.#view),
        );
        mutateSlot(
            container,
            '.project-sidebar-slot',
            buildSidebar(
                this.#flows,
                this.isApproved(),
            ),
        );
    }
}

export class ProjectDetailEditPresenter {
    readonly #view: ProjectView;
    readonly #flows: FlowListItem[];
    readonly #draft: ProjectDraftFields;

    constructor(
        view: ProjectView,
        flows: FlowListItem[],
        draft: ProjectDraftFields,
    ) {
        this.#view = view;
        this.#flows = flows;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#view.idForLink();
    }

    isApproved(): boolean {
        return this.#view.isApproved();
    }

    draft(): ProjectDraftFields {
        return this.#draft;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateSlot(
            container,
            '.project-title-slot',
            buildEditableTitleSection(
                this.#view, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.project-actions-slot',
            buildEditableActionButtons(),
        );
        mutateSlot(
            container,
            '.project-summary-slot',
            buildEditableProjectSummary(
                this.#view, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.project-metrics-slot',
            buildEditableMetrics(
                this.#view, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.project-sidebar-slot',
            buildSidebar(
                this.#flows,
                this.isApproved(),
            ),
        );
    }
}
