import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html';
import { $ } from '../dom';
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
} from '../icons';
import {
    initials, formatDate,
    toDateInputValue,
} from '../core';
import type {
    ProjectView,
    ProjectEntity,
} from '../adapters';
import {
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
    isProjectStatus,
} from '../adapters';
import type {
    FlowListItem,
} from '../adapters/flows';
import type { EditMode } from './edit-mode';

interface ProjectDraftFields {
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

export class ProjectDetailPresenter {
    #view: ProjectView;
    #flows: FlowListItem[];
    #mode: EditMode<ProjectDraftFields>
        = { kind: 'reading' };

    constructor(
        view: ProjectView,
        flows: FlowListItem[],
    ) {
        this.#view = view;
        this.#flows = flows;
    }

    update(
        view: ProjectView,
        flows: FlowListItem[],
    ): void {
        this.#view = view;
        this.#flows = flows;
        this.#mode = { kind: 'reading' };
    }

    beginEdit(): void {
        this.#mode = {
            kind: 'editing',
            draft: {
                title: this.#view.titleText(),
                description:
                    this.#view.descriptionText(),
                status:
                    this.#view.statusValue(),
                startDate: toDateInputValue(
                    this.#view.startDateValue(),
                ),
                targetEndDate: toDateInputValue(
                    this.#view
                        .targetEndDateValue(),
                ),
                costBaseline: String(
                    this.#view.costBaselineK(),
                ),
                impactBaseline: String(
                    this.#view.impactBaseline(),
                ),
            },
        };
    }

    cancelEdit(): void {
        this.#mode = { kind: 'reading' };
    }

    isEditing(): boolean {
        return this.#mode.kind === 'editing';
    }

    setDraftField(
        field: ProjectFieldKey,
        value: string,
    ): void {
        if (this.#mode.kind !== 'editing') {
            throw new Error(
                'setDraftField requires'
                + ' editing mode',
            );
        }
        this.#mode.draft[field] = value;
    }

    buildEntityPatch(): ProjectEntityPatch {
        if (this.#mode.kind !== 'editing') {
            throw new Error(
                'buildEntityPatch requires'
                + ' editing mode',
            );
        }
        const d = this.#mode.draft;
        const status = isProjectStatus(d.status)
            ? d.status
            : this.#view.statusValue();
        return {
            title: d.title,
            description: d.description,
            status,
            start_date: d.startDate,
            target_end_date: d.targetEndDate,
            estimated_cost:
                Number(d.costBaseline)
                * COST_DIVISOR,
            estimated_impact:
                Number(d.impactBaseline),
        };
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
        setHtml(container, html`
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
                <div class="project-summary-slot"></div>
                <div class="project-metrics-slot"></div>
            </div>
            <div class="project-sidebar-slot"></div>
        </div>
    </div>
    ${this.#buildNewFlowDialog()}
</div>`);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        this.#updateBreadcrumb(container);
        this.#updateTitle(container);
        this.#updateActions(container);
        this.#updateSummary(container);
        this.#updateMetrics(container);
        this.#updateSidebar(container);
    }

    #updateBreadcrumb(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.project-breadcrumb-slot',
            container,
        );
        if (!slot) return;
        setHtml(slot, html`
            <a href="${
                '../projects/index.html'
            }"
                class="hover-link">
                Projects
            </a>
            <span>/</span>
            <span>${
                this.#displayedTitle()
            }</span>`);
    }

    #displayedTitle(): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft.title
            : this.#view.titleText();
    }

    #updateTitle(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.project-title-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildTitleSection());
    }

    #buildTitleSection(): SafeHtml {
        const statusOptions =
            Object.entries(
                PROJECT_STATUS_CONFIG,
            ).map(([key, cfg]) =>
                html`<option
                    value="${key}"
                    ${trusted(
                        key === this.#displayedStatus()
                            ? 'selected'
                            : '',
                    )}>${cfg.label}</option>`,
            );
        return html`
            <div class="${
                'flex flex-wrap items-center'
                + ' gap-3 mb-2'
            }">
                ${this.isEditing()
                    ? html`<input
                        class="${
                            'input input-md-bold'
                        }"
                        id="project-edit-title"
                        data-project-field="title"
                        value="${
                            this.#displayedTitle()
                        }" />`
                    : html`<h1 class="${
                        'text-xl font-display'
                        + ' font-bold'
                    }">
                        ${this.#view.titleText()}
                    </h1>`}
                ${this.isEditing()
                    ? html`<select
                        class="${
                            'input select-auto'
                        }"
                        id="project-edit-status"
                        data-project-field="status">
                        ${statusOptions}
                    </select>`
                    : html`<span class="${
                        'badge '
                        + this.#view.statusClassName()
                        + ' text-xs'
                    }">
                        ${iconCheckCircle2(14, '')}
                        ${this.#view.statusLabel()}
                    </span>`}
            </div>
            <p class="text-sm text-muted">
                Led by ${
                    this.#view.projectLeadName()
                }
                &#x2022; ${
                    this.#view.progressPercent()
                }% of schedule elapsed
            </p>`;
    }

    #displayedStatus(): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft.status
            : this.#view.statusValue();
    }

    #updateActions(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.project-actions-slot',
            container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildActionButtons());
    }

    #buildActionButtons(): SafeHtml {
        if (this.isEditing()) {
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

    #updateSummary(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.project-summary-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildProjectSummary());
    }

    #displayedDescription(): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft.description
            : this.#view.descriptionText();
    }

    #displayedStartDate(): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft.startDate
            : toDateInputValue(
                this.#view.startDateValue(),
            );
    }

    #displayedEndDate(): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft.targetEndDate
            : toDateInputValue(
                this.#view.targetEndDateValue(),
            );
    }

    #buildProjectSummary(): SafeHtml {
        return html`
            <div class="card p-6">
                <h2 class="${
                    'text-lg font-display'
                    + ' font-semibold mb-4'
                }">
                    Project Summary
                </h2>
                ${this.isEditing()
                    ? html`<textarea
                        class="${
                            'textarea mb-6'
                            + ' resize-none'
                        }"
                        id="${
                            'project-edit'
                            + '-description'
                        }"
                        data-project-field="${
                            'description'
                        }"
                        rows="3">${
                            this.#displayedDescription()
                        }</textarea>`
                    : html`<p class="${
                        'text-sm text-muted mb-6'
                    }">${
                        this.#view.descriptionText()
                    }</p>`}
                <div class="${
                    'grid grid-cols-2 gap-4'
                }">
                    ${this.#buildDateCell(
                        iconCalendar,
                        'Start Date',
                        'project-edit-start-date',
                        'startDate',
                        this.#displayedStartDate(),
                        this.#view.startDateValue(),
                    )}
                    ${this.#buildDateCell(
                        iconTarget,
                        'Target End',
                        'project-edit-end-date',
                        'targetEndDate',
                        this.#displayedEndDate(),
                        this.#view.targetEndDateValue(),
                    )}
                </div>
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
                            this.#view.progressPercent()
                        }%</span>
                    </div>
                    <div class="progress"><div
                        class="progress-fill"
                        style="--progress-fill:${
                            this.#view.progressPercent()
                        }%"></div></div>
                </div>
            </div>`;
    }

    #buildDateCell(
        icon: (
            size: number,
            cssClass: string,
        ) => SafeHtml,
        label: string,
        id: string,
        field: ProjectFieldKey,
        value: string,
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
                    ${this.isEditing()
                        ? html`<input
                            type="date"
                            id="${id}"
                            data-project-field="${
                                field
                            }"
                            value="${value}"
                            class="input mt-1" />`
                        : html`<p class="${
                            'text-sm font-medium'
                        }">${
                            formatDate(savedDate)
                        }</p>`}
                </div>
            </div>`;
    }

    #updateMetrics(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.project-metrics-slot',
            container,
        );
        if (!slot) return;
        setHtml(
            slot,
            this.#buildBaselineComparison(),
        );
    }

    #displayedCostBaseline(): number {
        return this.#mode.kind === 'editing'
            ? Number(
                this.#mode.draft.costBaseline,
            )
            : this.#view.costBaselineK();
    }

    #displayedImpactBaseline(): number {
        return this.#mode.kind === 'editing'
            ? Number(
                this.#mode.draft.impactBaseline,
            )
            : this.#view.impactBaseline();
    }

    #buildBaselineComparison(): SafeHtml {
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
                    ${this.#buildMetricCell({
                        label: 'Time',
                        inputId: 'time',
                        field: null,
                        icon: iconClock,
                        baseline: this.#view
                            .timeBaselineDays(),
                        current: this.#view
                            .timeCurrentDays(),
                        unit: 'd',
                        prefix: '',
                        isLowerBetter: true,
                    })}
                    ${this.#buildMetricCell({
                        label: 'Cost',
                        inputId: 'cost',
                        field: 'costBaseline',
                        icon: iconDollarSign,
                        baseline: this
                            .#displayedCostBaseline(),
                        current: this.#view
                            .costCurrentK(),
                        unit: 'k',
                        prefix: '$',
                        isLowerBetter: true,
                    })}
                    ${this.#buildMetricCell({
                        label: 'Impact',
                        inputId: 'impact',
                        field: 'impactBaseline',
                        icon: iconTrendingUp,
                        baseline: this
                            .#displayedImpactBaseline(),
                        current: this.#view
                            .impactCurrent(),
                        unit: ' pts',
                        prefix: '',
                        isLowerBetter: false,
                    })}
                </div>
            </div>`;
    }

    #buildMetricCell(
        m: {
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
        },
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
                                : '—'
                        }</span>
                    </div>
                    <div class="${
                        'flex items-center'
                        + ' justify-between'
                    }">
                        <span class="${
                            'text-xs text-muted'
                        }">Baseline</span>
                        ${this.#buildBaselineCell(
                            m,
                        )}
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
                        ${this.#buildVariance(
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

    #buildBaselineCell(
        m: {
            inputId: string;
            field: ProjectFieldKey | null;
            baseline: number;
            unit: string;
            prefix: string;
        },
    ): SafeHtml {
        if (this.isEditing() && m.field) {
            return html`<input
                type="number"
                id="${
                    'project-edit-'
                    + m.inputId
                    + '-baseline'
                }"
                data-project-field="${
                    m.field
                }"
                value="${String(m.baseline)}"
                class="${
                    'input input-narrow-num'
                }"
                min="0"
                step="any" />`;
        }
        return html`<span class="${
            'text-sm font-medium'
        }">${
            m.baseline
                ? m.prefix + m.baseline + m.unit
                : '—'
        }</span>`;
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

    #updateSidebar(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.project-sidebar-slot',
            container,
        );
        if (!slot) return;
        setHtml(
            slot, this.#buildProjectSidebar(),
        );
    }

    #buildProjectSidebar(): SafeHtml {
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
                        ${this.#view.teamMembers()
                            .map(m => this
                                .#buildTeamMember(m))}
                    </div>
                </div>
                ${this.#buildFlowsSection()}
            </div>`;
    }

    #buildTeamMember(
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

    #buildFlowsSection(): SafeHtml {
        const header = html`
            <div class="${
                'flex items-center'
                + ' justify-between mb-4'
            }">
                <h2 class="${
                    'text-lg font-display'
                    + ' font-semibold'
                }">Flows</h2>
                ${this.isApproved()
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

        if (this.#flows.length === 0) {
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
                            ${this.isApproved()
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
                    ${this.#flows.map(
                        f => this.#buildFlowCard(f),
                    )}
                </div>
            </div>`;
    }

    #buildFlowCard(
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

    #buildNewFlowDialog(): SafeHtml {
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
}
