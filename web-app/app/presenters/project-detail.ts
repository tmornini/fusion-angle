import {
    html, mutateHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { $required } from '../dom.ts';
import {
    iconTrendingUp, iconClock,
    iconDollarSign,
    iconCalendar, iconTarget,
    iconCheckCircle2,
    iconArrowLeft, iconPlus,
    iconArrowUpRight, iconArrowDownRight,
    iconMinus,
    iconGitBranch, iconInfo,
    iconEdit, iconSave, iconX,
} from '../icons.ts';
import {
    initials, formatDate,
    toDateInputValue,
    DISPLAY_ABSENT,
} from '../core.ts';
import type {
    ProjectView,
    ProjectEntity,
} from '../adapters/index.ts';
import {
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
    isProjectStatus,
} from '../adapters/index.ts';
import type {
    FlowListItem,
} from '../adapters/flows.ts';

export interface ProjectDraftFields {
    title: string;
    description: string;
    status: string;
    startDate: string;
    targetEndDate: string;
    costBaseline: string;
    impactBaseline: string;
}

export type ProjectFieldKey =
    keyof ProjectDraftFields;

export type ProjectEntityPatch =
    Pick<ProjectEntity,
        | 'title'
        | 'description'
        | 'status'
        | 'start_date'
        | 'target_end_date'
        | 'estimated_cost'
        | 'estimated_impact'>;

export function projectDraftFromView(
    view: ProjectView,
): ProjectDraftFields {
    return {
        title: view.titleText(),
        description: view.descriptionText(),
        status: view.statusValue(),
        startDate: toDateInputValue(
            view.startDateValue(),
        ),
        targetEndDate: toDateInputValue(
            view.targetEndDateValue(),
        ),
        costBaseline: String(
            view.costBaselineK(),
        ),
        impactBaseline: String(
            view.impactBaseline(),
        ),
    };
}

export function projectPatchFromDraft(
    view: ProjectView,
    draft: ProjectDraftFields,
): ProjectEntityPatch {
    const fallbackStatus = view.statusValue();
    const status = isProjectStatus(draft.status)
        ? draft.status
        : (isProjectStatus(fallbackStatus)
            ? fallbackStatus
            : 'submitted');
    return {
        title: draft.title,
        description: draft.description,
        status,
        start_date: draft.startDate,
        target_end_date: draft.targetEndDate,
        estimated_cost:
            Number(draft.costBaseline)
            * COST_DIVISOR,
        estimated_impact:
            Number(draft.impactBaseline),
    };
}

function buildShell(
    container: HTMLElement,
): void {
    mutateHtml(container, html`
<div class="project-detail-host">
    <div class="project-detail-wrap">
        <div class="${
            'flex items-center gap-2'
            + ' text-sm text-muted mb-4'
            + ' project-breadcrumb-slot'
        }"></div>

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
                'flex gap-2'
                + ' project-actions-slot'
            }"></div>
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
            </div>
            <div class="project-sidebar-slot"></div>
        </div>
    </div>
    ${buildNewFlowDialog()}
</div>`);
}

function mutateSlot(
    container: HTMLElement,
    cls: string,
    markup: SafeHtml,
): void {
    mutateHtml($required(cls, container), markup);
}

function buildBreadcrumb(
    title: string,
): SafeHtml {
    return html`
        <a href="${
            '../projects/index.html'
        }"
            class="hover-link">
            Projects
        </a>
        <span>/</span>
        <span>${title}</span>`;
}

function buildSubtitle(
    view: ProjectView,
): SafeHtml {
    return html`
        <p class="text-sm text-muted">
            Led by ${view.projectLeadName()}
            &#x2022; ${
                view.progressPercent()
            }% of schedule elapsed
        </p>`;
}

function buildReadonlyTitleSection(
    view: ProjectView,
): SafeHtml {
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
                + view.statusClassName()
                + ' text-xs'
            }">
                ${iconCheckCircle2(14, '')}
                ${view.statusLabel()}
            </span>
        </div>
        ${buildSubtitle(view)}`;
}

function buildEditableTitleSection(
    view: ProjectView,
    draft: ProjectDraftFields,
): SafeHtml {
    const statusOptions =
        Object.entries(
            PROJECT_STATUS_CONFIG,
        ).map(([key, cfg]) =>
            html`<option
                value="${key}"
                ${trusted(
                    key === draft.status
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
                id="project-edit-status"
                data-project-field="status">
                ${statusOptions}
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
                }">${formatDate(savedDate)}</p>
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
    baseline: number;
    current: number;
    unit: string;
    prefix: string;
    isLowerBetter: boolean;
}

function buildVariance(
    baseline: number,
    current: number,
    isLowerBetter: boolean,
    unit: string,
    prefix: string,
): SafeHtml {
    const diff = current - baseline;
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
                    }">Current</span>
                    <span class="${
                        'text-sm font-medium'
                    }">${
                        m.current
                            ? m.prefix
                                + m.current
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
                        m.current,
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
            current: view.timeCurrentDays(),
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
            current: view.costCurrentK(),
            unit: 'k',
            prefix: '$',
            isLowerBetter: true,
        },
        {
            label: 'Impact',
            inputId: 'impact',
            field: 'impactBaseline',
            icon: iconTrendingUp,
            baseline: view.impactBaseline(),
            current: view.impactCurrent(),
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
                    Metrics
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
            current: view.timeCurrentDays(),
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
            current: view.costCurrentK(),
            unit: 'k',
            prefix: '$',
            isLowerBetter: true,
        },
        {
            label: 'Impact',
            inputId: 'impact',
            field: 'impactBaseline',
            icon: iconTrendingUp,
            baseline:
                Number(draft.impactBaseline),
            current: view.impactCurrent(),
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
                    Metrics
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

function buildTeamMember(
    m: { name: string; role: string },
): SafeHtml {
    return html`
        <div class="${
            'flex items-center gap-3'
        }">
            <div class="${
                'team-member-avatar'
            }">
                <span class="${
                    'text-xs font-bold'
                    + ' text-primary'
                }">${initials(m.name)}</span>
            </div>
            <div class="flex-fill">
                <p class="${
                    'text-sm font-medium'
                    + ' truncate'
                }">${m.name}</p>
                <p class="${
                    'text-xs text-muted'
                }">${m.role}</p>
            </div>
        </div>`;
}

function buildFlowCard(
    flow: FlowListItem,
): SafeHtml {
    return html`
        <a
            href="#"
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
                    ${flow.description
                        ? html`<p class="${
                            'text-xs text-muted'
                        }">${
                            flow.description
                        }</p>`
                        : html``}
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
        </a>`;
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
    view: ProjectView,
    flows: FlowListItem[],
    isApproved: boolean,
): SafeHtml {
    return html`
        <div class="stack-lg">
            <div class="card p-6">
                <div class="${
                    'flex items-center'
                    + ' justify-between mb-4'
                }">
                    <h3 class="${
                        'font-display'
                        + ' font-semibold'
                    }">
                        Team
                    </h3>
                    <button class="${
                        'btn btn-ghost'
                        + ' btn-sm gap-1'
                    }">
                        ${iconPlus(14, '')}
                        Add
                    </button>
                </div>
                <div class="${
                    'flex flex-col gap-3'
                }">
                    ${view.teamMembers()
                        .map(m =>
                            buildTeamMember(m))}
                </div>
            </div>
            ${buildFlowsSection(
                isApproved, flows,
            )}
        </div>`;
}

function buildNewFlowDialog(): SafeHtml {
    return html`<div
class="${'dialog-backdrop hidden'}"
id="new-flow-backdrop"
data-dialog-id="new-flow">
<div class="${
    'dialog dialog-narrow hidden'
}"
    id="new-flow-dialog"
    aria-hidden="true">
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
</div>
</div>`;
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
        return this.#view.statusValue()
            === 'approved';
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
            '.project-breadcrumb-slot',
            buildBreadcrumb(
                this.#view.titleText(),
            ),
        );
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
                this.#view,
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
        return this.#view.statusValue()
            === 'approved';
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
            '.project-breadcrumb-slot',
            buildBreadcrumb(this.#draft.title),
        );
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
                this.#view,
                this.#flows,
                this.isApproved(),
            ),
        );
    }
}
