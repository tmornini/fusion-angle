import {
    html, SafeHtml, trusted,
} from '../safe-html';
import {
    iconTrendingUp, iconClock,
    iconDollarSign, iconUsers,
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
} from '../adapters/projects';
import type {
    FlowListItem,
} from '../adapters/flows';
import {
    PROJECT_STATUS_CONFIG,
} from '../adapters';

export class ProjectDetailPresenter {
    readonly #view: ProjectView;

    constructor(view: ProjectView) {
        this.#view = view;
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
        const tone = good
            ? 'variance-good'
            : 'variance-bad';
        return html`<span
            class="${
                'flex items-center '
                + 'gap-1 font-bold text-sm '
                + tone
            }">${icon} ${
                prefix
            }${Math.abs(diff)}${
                unit
            }</span>`;
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
                            + ' resize-none'
                        }"
                        id="${
                            'project-edit-'
                            + 'description'
                        }"
                        rows="3">${
                            this.#view.descriptionText()
                        }</textarea>`
                    : html`<p class="${
                        'text-sm '
                        + 'text-muted mb-6'
                    }">${
                        this.#view.descriptionText()
                    }</p>`}
                <div class="${
                    'grid grid-cols-2 gap-4'
                }">
                    <div class="${
                        'flex items-center '
                        + 'gap-3 summary-stat-cell'
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
                                        toDateInputValue(
                                            this
                                                .#view
                                                .startDateValue(),
                                        )
                                    }"
                                    class="${
                                        'input mt-1'
                                    }" />`
                                : html`<p
                                    class="${
                                        'text-sm '
                                        + 'font-'
                                        + 'medium'
                                    }">${
                                        formatDate(
                                            this
                                                .#view
                                                .startDateValue(),
                                        )
                                    }</p>`}
                        </div>
                    </div>
                    <div class="${
                        'flex items-center '
                        + 'gap-3 summary-stat-cell'
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
                                        toDateInputValue(
                                            this
                                                .#view
                                                .targetEndDateValue(),
                                        )
                                    }"
                                    class="${
                                        'input mt-1'
                                    }" />`
                                : html`<p
                                    class="${
                                        'text-sm '
                                        + 'font-'
                                        + 'medium'
                                    }">${
                                        formatDate(
                                            this
                                                .#view
                                                .targetEndDateValue(),
                                        )
                                    }</p>`}
                        </div>
                    </div>
                </div>
                <div class="mt-6">
                    <div class="${
                        'flex items-center '
                        + 'justify-between mb-2'
                    }">
                        <span class="${
                            'text-sm font-medium'
                        }">
                            Schedule Progress
                        </span>
                        <span
                            class="${
                                'text-sm '
                                + 'font-bold '
                                + 'text-primary'
                            }">${
                                this.#view.progressPercent()
                            }%</span>
                    </div>
                    <div class="${
                        'progress'
                    }"><div
                        class="${
                            'progress-fill'
                        }"
                        style="--progress-fill:${
                            this.#view.progressPercent()
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
                        Metrics
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
                                this.#view
                                    .timeBaselineDays(),
                            current:
                                this.#view
                                    .timeCurrentDays(),
                            unit: 'd',
                            prefix: '',
                            isLowerBetter: true,
                            editable: false,
                        },
                        {
                            label: 'Cost',
                            inputId: 'cost',
                            icon: iconDollarSign,
                            baseline:
                                this.#view
                                    .costBaselineK(),
                            current:
                                this.#view
                                    .costCurrentK(),
                            unit: 'k',
                            prefix: '$',
                            isLowerBetter: true,
                            editable: true,
                        },
                        {
                            label: 'Impact',
                            inputId: 'impact',
                            icon: iconTrendingUp,
                            baseline:
                                this.#view
                                    .impactBaseline(),
                            current:
                                this.#view
                                    .impactCurrent(),
                            unit: ' pts',
                            prefix: '',
                            isLowerBetter: false,
                            editable: true,
                        },
                    ].map(metric => html`
                        <div class="metric-cell">
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
                            <div class="${
                                'flex flex-col'
                                + ' gap-2'
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
                                        && metric
                                            .editable
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
                                                + ' input'
                                                + '-narrow'
                                                + '-num'
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
                                    + 'items-center '
                                    + 'justify-between '
                                    + 'metric-cell'
                                    + '-row-divider'
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


    #buildProjectSidebar(
        flows: FlowListItem[],
        projectId: string,
    ): SafeHtml {

        return html`
            <div class="stack-lg">
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
                    <div class="${
                        'flex flex-col gap-3'
                    }">
                        ${this.#view.teamMembers().map(
                            teamMember => html`
                            <div
                                class="${
                                    'flex '
                                    + 'items-center'
                                    + ' gap-3'
                                }">
                                <div class="${
                                    'team-member'
                                    + '-avatar'
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
                                <div class="${
                                    'flex-fill'
                                }">
                                    <p class="${
                                        'text-sm '
                                        + 'font-medium '
                                        + 'truncate'
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
                ${this
                    .#buildFlowsSection(
                    flows,
                    projectId,
                )}
            </div>`;
    }

    #buildFlowsSection(
        flows: FlowListItem[],
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
                    Flows
                </h2>
                ${this.#view.statusValue() === 'approved'
                    ? html`<button
                        id="new-flow-btn"
                        class="${
                            'btn btn-primary '
                            + 'btn-sm gap-2'
                        }">
                        ${iconPlus(14, '')}
                        New Flow
                    </button>`
                    : html`<span
                        class="${
                            'status-badge '
                            + 'status-badge'
                            + '-info'
                        }">
                        ${iconInfo(14, '')}
                        Approve to add
                        flows
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
                            ${this.#view.statusValue()
                                === 'approved'
                                ? 'No flows yet'
                                : 'Flow creation'
                                + ' limited to'
                                + ' approved'
                                + ' projects'
                                + ' only'}
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
                    ${flows.map(wf =>
                        html`
                        <a
                            href="#"
                            data-flow-id="${
                                wf.id
                            }"
                            class="${
                                'card card-hover'
                                + ' flow-card-link'
                            }">
                            <div class="${
                                'flex '
                                + 'items-center '
                                + 'gap-3'
                            }">
                                <div class="${
                                    'flow-icon-pill'
                                }">
                                    ${iconGitBranch(
                                        20,
                                        'text-primary',
                                    )}
                                </div>
                                <div class="${
                                    'flex-fill'
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
        flows: FlowListItem[],
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
                                        .#view
                                        .statusValue()
                                    ? 'selected'
                                    : '',
                            )}>${
                                cfg.label
                        }</option>`,
                );

        return html`
            <div class="${
                'project-detail-wrap'
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
                        this.#view.titleText()
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
                                            + ' input-md'
                                            + '-bold'
                                        }"
                                        id="${
                                            'project'
                                            + '-edit-'
                                            + 'title'
                                        }"
                                        value="${
                                            this
                                                .#view
                                                .titleText()
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
                                                .#view
                                                .titleText()
                                        }
                                    </h1>`}
                                ${isEditing
                                    ? html`<select
                                        class="${
                                            'input'
                                            + ' select'
                                            + '-auto'
                                        }"
                                        id="${
                                            'project'
                                            + '-edit-'
                                            + 'status'
                                        }">
                                        ${
                                            statusOptions
                                        }
                                    </select>`
                                    : html`<span
                                        class="${
                                            'badge '
                                            + this
                                                .#view
                                                .statusClassName()
                                            + ' text-xs'
                                        }">
                                        ${
                                            iconCheckCircle2(
                                                14, '',
                                            )
                                        }
                                        ${
                                            this
                                                .#view
                                                .statusLabel()
                                        }
                                    </span>`}
                            </div>
                            <p class="${
                                'text-sm '
                                + 'text-muted'
                            }">
                                Led by ${
                                    this
                                        .#view
                                        .projectLeadName()
                                }
                                &#x2022; ${
                                    this
                                        .#view
                                        .progressPercent()
                                }%
                                of schedule elapsed
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
                    'detail-grid'
                    + ' detail-grid-spaced'
                }">
                    <div class="stack-lg">
                        ${this
                            .#buildProjectSummary(
                            isEditing,
                        )}
                        ${this
                            .#buildBaselineComparison(
                            isEditing,
                        )}
                    </div>
                    ${this
                        .#buildProjectSidebar(
                        flows,
                        projectId,
                    )}
                </div>
                ${this
                    .#buildNewFlowDialog()}
            </div>`;
    }

    #buildNewFlowDialog(): SafeHtml {
        return html`<div
class="${'dialog-backdrop hidden'}"
id="new-flow-backdrop">
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
    >Cancel</button>
<button class="btn btn-primary"
    id="new-flow-submit"
    >Create</button>
</div>
</div>
</div>`;
    }
}
