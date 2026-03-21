import {
    $, $$, $input, $textarea, $select,
} from '../app/dom';
import {
    html, setHtml, type SafeHtml, trusted,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, buildEmptyState,
    withLoadingState,
} from '../app/loading-states';
import {
    iconGitBranch, iconPlus, iconTrash,
    iconCheck, iconUsers, iconClock,
    iconChevronRight, iconChevronDown,
    iconChevronUp, iconGripVertical,
    iconFileText, iconMail, iconDatabase,
    iconGlobe, iconPhone, iconMessageSquare,
    iconFolderOpen, iconArrowLeft, iconSave,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getFlow, putFlow, putFlowStep,
    type FlowStep, type Flow,
} from '../app/adapters';
import {
    isFlowStepType,
    FLOW_STEP_TYPE_CONFIG,
    type FlowStepType,
} from '../../api/types';

const toolIconConfig: Record<
    string,
    (size: number, cssClass: string) => SafeHtml
> = {
    Email: iconMail,
    Database: iconDatabase,
    Website: iconGlobe,
    Phone: iconPhone,
    Chat: iconMessageSquare,
    Files: iconFolderOpen,
    Document: iconFileText,
};

function buildStepFieldSelector(
    stepId: string,
    fieldName: string,
): string {
    return '[data-step-id="' + stepId + '"]'
        + '[data-field-name="'
        + fieldName + '"]';
}

interface FlowDetailState {
    flowSteps: FlowStep[];
    flowName: string;
    flowDescription: string;
    flowDepartment: string;
    currentFlowId: string;
    expandedStepId: string | null;
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const root = $('#flow-detail-content', document);
    if (!root) return;

    const flowId =
        params?.flowId ?? params?.processId;
    if (!flowId) {
        navigateTo('flow');
        return;
    }

    const state: FlowDetailState = {
        flowSteps: [],
        flowName: '',
        flowDescription: '',
        flowDepartment: '',
        currentFlowId: flowId,
        expandedStepId: null,
    };

    function syncFormFields(): void {
        const nameInput =
            $input('#flow-name', document);
        const descInput =
            $textarea('#flow-description', document);
        const dept =
            $select('#flow-department', document);
        if (nameInput) {
            state.flowName =
                nameInput.value;
        }
        if (descInput) {
            state.flowDescription =
                descInput.value;
        }
        if (dept) {
            state.flowDepartment =
                dept.value;
        }

        state.flowSteps =
            state.flowSteps.map(step => {
                const title = $input(
                    buildStepFieldSelector(
                        step.id, 'title',
                    ), document,
                );
                const desc = $textarea(
                    buildStepFieldSelector(
                        step.id,
                        'description',
                    ), document,
                );
                const owner = $input(
                    buildStepFieldSelector(
                        step.id, 'owner',
                    ), document,
                );
                const role = $input(
                    buildStepFieldSelector(
                        step.id, 'role',
                    ), document,
                );
                const dur = $input(
                    buildStepFieldSelector(
                        step.id, 'duration',
                    ), document,
                );
                const type = $select(
                    buildStepFieldSelector(
                        step.id, 'type',
                    ), document,
                );
                return {
                    ...step,
                    ...(title
                        ? {
                            title:
                                title.value,
                        }
                        : {}),
                    ...(desc
                        ? {
                            description:
                                desc.value,
                        }
                        : {}),
                    ...(owner
                        ? {
                            owner:
                                owner.value,
                        }
                        : {}),
                    ...(role
                        ? {
                            role:
                                role.value,
                        }
                        : {}),
                    ...(dur
                        ? {
                            duration:
                                dur.value,
                        }
                        : {}),
                    ...(type
                        && isFlowStepType(
                            type.value,
                        )
                        ? {
                            type:
                                type.value,
                        }
                        : {}),
                };
            });
    }

    function buildEditMode(): SafeHtml {
        return html`
        <div
            style="display:flex;
                   flex-direction:column;
                   gap:0.75rem"
        >
            <div
                class="flex items-center
                       justify-between"
            >
                <h2
                    class="${
                        'text-lg'
                        + ' font-display'
                        + ' font-semibold'
                    }"
                >Process Steps</h2>
                <span class="${
                    'text-sm text-muted'
                }">
                    ${
                        state.flowSteps.length
                    } steps
                </span>
            </div>
            ${state.flowSteps.map((step, i) => {
                const isExpanded =
                    state.expandedStepId
                    === step.id;
                const isLast =
                    i
                    === state.flowSteps.length
                    - 1;
                return html`
                <div style="${
                    'position:relative'
                }">
                    ${i < state.flowSteps
                        .length - 1
                        ? html`
                    <div
                        style="${trusted(
                            'position:'
                            + 'absolute;'
                            + 'left:1.5rem;'
                            + 'top:100%;'
                            + 'width:2px;'
                            + 'height:'
                            + '0.75rem;'
                            + 'background:'
                            + 'hsl(var('
                            + '--border));'
                            + 'z-index:0'
                        )}"
                    ></div>
                    ` : html``}
                    <div
                        class="card"
                        style="${trusted(
                            isExpanded
                            ? 'box-shadow:'
                              + '0 0 0 2px'
                              + ' hsl(var('
                              + '--primary))'
                            : ''
                        )};overflow:hidden"
                    >
                        <div
                            style="${trusted(
                                'padding:1rem;'
                                + 'cursor:'
                                + 'pointer'
                            )}"
                            data-step-header="${
                                step.id}"
                        >
                            <div
                                class="${
                                    'flex'
                                    + ' items-center'
                                    + ' gap-3'
                                }"
                            >
                                <div
                                    class="${
                                        'hidden'
                                        + '-mobile'
                                        + ' text'
                                        + '-muted'
                                    }"
                                    style="${
                                        'cursor'
                                        + ':grab'
                                    }"
                                >${
                                    iconGripVertical(
                                        16, '',
                                    )
                                }</div>
                                <div
                                    style="${
                                        trusted(
                                        'width:'
                                        + '2.5rem;'
                                        + 'height:'
                                        + '2.5rem;'
                                        + 'border-'
                                        + 'radius:'
                                        + '0.5rem;'
                                        + 'display:'
                                        + 'flex;'
                                        + 'align-'
                                        + 'items:'
                                        + 'center;'
                                        + 'justify-'
                                        + 'content:'
                                        + 'center;'
                                        + 'flex-'
                                        + 'shrink:0;'
                                        + (
                                        FLOW_STEP_TYPE_CONFIG[
                                            step
                                            .type
                                        ]!
                                        ).style
                                    )}"
                                >
                                    <span
                                        class="${
                                            'text-sm'
                                            + ' font'
                                            + '-bold'
                                        }"
                                    >${
                                        i + 1
                                    }</span>
                                </div>
                                <div
                                    style="${
                                        'flex:1;'
                                        + 'min-'
                                        + 'width:0'
                                    }"
                                >
                                    <div
                                        class="${
                                            'flex'
                                            + ' flex'
                                            + '-wrap'
                                            + ' items'
                                            + '-center'
                                            + ' gap-2'
                                            + ' mb-0.5'
                                        }"
                                    >
                                        <span
                                            class="${
                                                'font'
                                                + '-medium'
                                                + ' text'
                                                + '-sm'
                                            }"
                                            style="${
                                                trusted(
                                                'overflow'
                                                + ':hidden;'
                                                + 'text-'
                                                + 'overflow:'
                                                + 'ellipsis;'
                                                + 'white-'
                                                + 'space:'
                                                + 'nowrap'
                                            )}"
                                        >
                                            ${
                                                step
                                                .title
                                                || 'Untitled'
                                                + ' Step'
                                            }
                                        </span>
                                        ${!step.title
                                            ? html`
                                        <span
                                            class="${
                                                'pill'
                                            }"
                                            style="${
                                                trusted(
                                                'background'
                                                + ':hsl('
                                                + 'var('
                                                + '--warning'
                                                + ')/0.1);'
                                                + 'color:'
                                                + 'hsl(var('
                                                + '--warning'
                                                + '));'
                                                + 'border:'
                                                + '1px '
                                                + 'solid '
                                                + 'hsl(var('
                                                + '--warning'
                                                + ')/0.2)'
                                            )}"
                                        >${
                                            'Needs info'
                                        }</span>
                                        ` : html``}
                                    </div>
                                    ${step.owner
                                        ? html`
                                    <div
                                        class="${
                                            'flex'
                                            + ' items'
                                            + '-center'
                                            + ' gap-2'
                                            + ' text'
                                            + '-xs'
                                            + ' text'
                                            + '-muted'
                                        }"
                                    >
                                        ${
                                            iconUsers(
                                                12, '',
                                            )
                                        }
                                        <span>
                                            ${
                                                step
                                                .owner
                                            }
                                        </span>
                                        ${step
                                            .duration
                                            ? html`
                                        <span
                                            class="${
                                                'hidden'
                                                + '-mobile'
                                            }"
                                        >${
                                            '•'
                                        }</span>
                                        ${
                                            iconClock(
                                                12, '',
                                            )
                                        }
                                        <span
                                            class="${
                                                'hidden'
                                                + '-mobile'
                                            }"
                                        >
                                            ${
                                                step
                                                .duration
                                            }
                                        </span>
                                        `
                                        : html``}
                                    </div>
                                    ` : html``}
                                </div>
                                <div
                                    class="${
                                        'flex'
                                        + ' items'
                                        + '-center'
                                        + ' gap-1'
                                    }"
                                >
                                    <button
                                        class="${
                                            'btn'
                                            + ' btn'
                                            + '-ghost'
                                            + ' btn'
                                            + '-icon'
                                            + ' btn'
                                            + '-sm'
                                        }"
                                        data-action="${
                                            'move'
                                            + '-step'
                                        }"
                                        data-step-id="${
                                            step.id
                                        }"
                                        data-direction="${
                                            'up'
                                        }"
                                        ${trusted(
                                            i === 0
                                            ? 'disabled'
                                            : ''
                                        )}
                                    >${
                                        iconChevronUp(
                                            16, '',
                                        )
                                    }</button>
                                    <button
                                        class="${
                                            'btn'
                                            + ' btn'
                                            + '-ghost'
                                            + ' btn'
                                            + '-icon'
                                            + ' btn'
                                            + '-sm'
                                        }"
                                        data-action="${
                                            'move'
                                            + '-step'
                                        }"
                                        data-step-id="${
                                            step.id
                                        }"
                                        data-direction="${
                                            'down'
                                        }"
                                        ${trusted(
                                            isLast
                                            ? 'disabled'
                                            : ''
                                        )}
                                    >
                                        ${
                                            iconChevronDown(
                                                16, '',
                                            )
                                        }
                                    </button>
                                    <button
                                        class="${
                                            'btn'
                                            + ' btn'
                                            + '-ghost'
                                            + ' btn'
                                            + '-icon'
                                            + ' btn'
                                            + '-sm'
                                        }"
                                        data-remove-step="${
                                            step.id
                                        }"
                                        style="${
                                            trusted(
                                            'color:'
                                            + 'hsl('
                                            + 'var('
                                            + '--error'
                                            + '))'
                                        )}"
                                    >${
                                        iconTrash(
                                            16, '',
                                        )
                                    }</button>
                                    ${isExpanded
                                        ? iconChevronDown(
                                            20,
                                            'text-muted',
                                        )
                                        : iconChevronRight(
                                            20,
                                            'text-muted',
                                        )}
                                </div>
                            </div>
                        </div>
                        ${isExpanded ? html`
                        <div
                            style="${trusted(
                                'padding:'
                                + '0 1rem 1rem;'
                                + 'border-top:'
                                + '1px solid '
                                + 'hsl(var('
                                + '--border));'
                                + 'padding-top:'
                                + '1rem;'
                                + 'background:'
                                + 'hsl(var('
                                + '--muted)/0.2)'
                            )}"
                        >
                            <div
                                class="${
                                    'convert-grid'
                                }"
                                style="gap:1rem"
                            >
                                <div
                                    style="${
                                        'grid-column'
                                        + ':span 2'
                                    }"
                                >
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >
                                        ${
                                            'What'
                                            + ' happens'
                                            + ' in'
                                            + ' this'
                                            + ' step?'
                                        }
                                    </label>
                                    <input
                                        class="${
                                            'input'
                                        }"
                                        data-step-id="${
                                            step
                                            .id}"
                                        data-field-name="${
                                            'title'
                                        }"
                                        value="${
                                            step
                                            .title
                                        }"
                                        placeholder="${
                                            'e.g.,'
                                            + ' Review'
                                            + ' and'
                                            + ' approve'
                                            + ' customer'
                                            + ' app'
                                            + 'lication'
                                        }"
                                    />
                                </div>
                                <div
                                    style="${
                                        'grid-column'
                                        + ':span 2'
                                    }"
                                >
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >
                                        ${
                                            'Describe'
                                            + ' this'
                                            + ' step'
                                            + ' in'
                                            + ' detail'
                                        }
                                    </label>
                                    <textarea
                                        class="${
                                            'textarea'
                                        }"
                                        data-step-id="${
                                            step
                                            .id}"
                                        data-field-name="${
                                            'description'
                                        }"
                                        style="${
                                            'resize'
                                            + ':none'
                                        }"
                                        placeholder="${
                                            'Explain'
                                            + ' what'
                                            + ' needs'
                                            + ' to'
                                            + ' happen'
                                            + '...'
                                        }"
                                    >${
                                        step
                                        .description
                                    }</textarea>
                                </div>
                                <div>
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >${
                                        'Who is'
                                        + ' responsible?'
                                    }
                                    </label>
                                    <input
                                        class="${
                                            'input'
                                        }"
                                        data-step-id="${
                                            step
                                            .id}"
                                        data-field-name="${
                                            'owner'
                                        }"
                                        value="${
                                            step
                                            .owner
                                        }"
                                        placeholder="${
                                            'e.g.,'
                                            + ' Customer'
                                            + ' Success'
                                            + ' Team'
                                        }"
                                    />
                                </div>
                                <div>
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >${
                                        'Specific'
                                        + ' Role'
                                    }</label>
                                    <input
                                        class="${
                                            'input'
                                        }"
                                        data-step-id="${
                                            step
                                            .id}"
                                        data-field-name="${
                                            'role'
                                        }"
                                        value="${
                                            step
                                            .role
                                        }"
                                        placeholder="${
                                            'e.g.,'
                                            + ' Account'
                                            + ' Manager'
                                        }"
                                    />
                                </div>
                                <div>
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >
                                        ${
                                            'How long'
                                            + ' does'
                                            + ' this'
                                            + ' take?'
                                        }
                                    </label>
                                    <input
                                        class="${
                                            'input'
                                        }"
                                        data-step-id="${
                                            step
                                            .id}"
                                        data-field-name="${
                                            'duration'
                                        }"
                                        value="${
                                            step
                                            .duration
                                        }"
                                        placeholder="${
                                            'e.g.,'
                                            + ' 30'
                                            + ' minutes'
                                        }"
                                    />
                                </div>
                                <div>
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >${
                                        'Step Type'
                                    }</label>
                                    <select
                                        class="${
                                            'input'
                                        }"
                                        data-step-id="${
                                            step
                                            .id}"
                                        data-field-name="${
                                            'type'
                                        }"
                                    >
                                        <option
                                            value="${
                                                'start'
                                            }"
                                            ${trusted(
                                                step
                                                .type
                                                === 'start'
                                                ? 'selected'
                                                : ''
                                            )}
                                        >${
                                            'Start'
                                        }</option>
                                        <option
                                            value="${
                                                'action'
                                            }"
                                            ${trusted(
                                                step
                                                .type
                                                === 'action'
                                                ? 'selected'
                                                : ''
                                            )}
                                        >${
                                            'Action'
                                        }</option>
                                        <option
                                            value="${
                                                'decision'
                                            }"
                                            ${trusted(
                                                step
                                                .type
                                                === 'decision'
                                                ? 'selected'
                                                : ''
                                            )}
                                        >${
                                            'Decision'
                                        }</option>
                                        <option
                                            value="${
                                                'end'
                                            }"
                                            ${trusted(
                                                step
                                                .type
                                                === 'end'
                                                ? 'selected'
                                                : ''
                                            )}
                                        >${
                                            'End'
                                        }</option>
                                    </select>
                                </div>
                                <div
                                    style="${
                                        'grid-column'
                                        + ':span 2'
                                    }"
                                >
                                    <label
                                        class="${
                                            'label'
                                            + ' mb-1'
                                            + ' text'
                                            + '-xs'
                                        }"
                                    >${
                                        'Tools Used'
                                    }</label>
                                    <div
                                        class="${
                                            'flex'
                                            + ' flex'
                                            + '-wrap'
                                            + ' gap'
                                            + '-1.5'
                                        }"
                                    >
                                    ${Object.entries(
                                        toolIconConfig,
                                    ).map(
                                      ([
                                          name,
                                          iconFn,
                                      ]) => {
                                      const
                                      isSelected =
                                          step
                                          .tools
                                          .includes(
                                              name,
                                          );
                                      const
                                      btnStyle =
                                          'display:'
                                          + 'flex;'
                                          + 'align-'
                                          + 'items:'
                                          + 'center;'
                                          + 'gap:'
                                          + '0.375'
                                          + 'rem;'
                                          + 'padding:'
                                          + '0.25rem'
                                          + ' 0.75'
                                          + 'rem;'
                                          + 'border-'
                                          + 'radius:'
                                          + '0.5rem;'
                                          + 'font-'
                                          + 'size:'
                                          + '0.75'
                                          + 'rem;'
                                          + 'border:'
                                          + 'none;'
                                          + 'cursor:'
                                          + 'pointer;';
                                      const
                                      colorStyle
                                          = isSelected
                                          ? 'background'
                                            + ':hsl('
                                            + 'var('
                                            + '--'
                                            + 'primary'
                                            + '));'
                                            + 'color:'
                                            + 'hsl('
                                            + 'var('
                                            + '--'
                                            + 'primary'
                                            + '-fore'
                                            + 'ground'
                                            + '))'
                                          : 'background'
                                            + ':hsl('
                                            + 'var('
                                            + '--'
                                            + 'muted'
                                            + '));'
                                            + 'color:'
                                            + 'hsl('
                                            + 'var('
                                            + '--'
                                            + 'muted-'
                                            + 'fore'
                                            + 'ground'
                                            + '))';
                                      return html`
                                        <button
                                            data-action="${
                                                'toggle'
                                                + '-tool'
                                            }"
                                            data-step-id="${
                                                step
                                                .id
                                            }"
                                            data-tool-name="${
                                                name
                                            }"
                                            style="${
                                                trusted(
                                                btnStyle
                                                + colorStyle
                                            )}"
                                        >
                                            ${
                                                iconFn(
                                                    14, '',
                                                )
                                            }
                                            ${name}
                                        </button>`;
                                    })}
                                    </div>
                                </div>
                            </div>
                        </div>
                        ` : html``}
                    </div>
                </div>`;
            })}
            <button
                class="${
                    'btn btn-outline gap-2'
                }"
                style="${
                    'width:100%;'
                    + 'border-style:dashed'
                }"
                id="flow-add-step"
            >${iconPlus(16, '')} Add Step</button>
        </div>`;
    }

    function buildFlowDetailPage(): SafeHtml {
        const deptOptions = [
            'Sales', 'Customer Success',
            'Engineering', 'Operations',
            'Finance', 'HR',
        ];
        return html`
        <div
            style="max-width:64rem;
                   margin:0 auto"
        >
            <div class="${
                'flex items-center gap-2'
                + ' text-sm text-muted mb-4'
            }">
                <a href="${
                    '../flow/index.html'
                }" class="hover-link"
                >Flow</a>
                <span>/</span>
                <span>${
                    state.flowName
                }</span>
            </div>
            <div
                class="${
                    'flex items-start'
                    + ' justify-between'
                    + ' gap-4 mb-6'
                }"
            >
                <div
                    class="${
                        'flex items-center'
                        + ' gap-4'
                    }"
                >
                    <button
                        class="${
                            'btn btn-ghost'
                            + ' btn-icon'
                        }"
                        id="${
                            'flow-detail'
                            + '-back-btn'
                        }"
                    >${
                        iconArrowLeft(20, '')
                    }</button>
                    <div>
                        <div
                            class="${
                                'badge'
                                + ' badge'
                                + '-primary'
                                + ' text-sm'
                                + ' mb-3'
                            }"
                        >
                            ${iconGitBranch(14, '')}
                            ${'Process'
                                + ' Documentation'}
                        </div>
                        <h1
                            class="${
                                'text-2xl'
                                + ' font'
                                + '-display'
                                + ' font-bold'
                                + ' mb-1'
                            }"
                        >${
                            state.flowName
                        }</h1>
                        <p
                            class="${
                                'text-sm'
                                + ' text-muted'
                            }"
                            style="${
                                'max-width'
                                + ':32rem'
                            }"
                        >${
                            state
                            .flowDescription
                        }</p>
                    </div>
                </div>
                <button
                    class="${
                        'btn btn-primary'
                        + ' gap-2'
                    }"
                    id="flow-save-btn"
                >${
                    iconSave(16, '')
                } Save</button>
            </div>

            <div
                class="card"
                style="${
                    'padding:1.5rem;'
                    + 'margin-bottom'
                    + ':1.5rem'
                }"
            >
                <div class="${
                    'convert-grid'
                }">
                    <div>
                        <label
                            class="${
                                'label mb-1'
                                + ' text-xs'
                            }"
                        >${
                            'Process Name'
                        }</label>
                        <input
                            class="input"
                            id="flow-name"
                            value="${
                                state
                                .flowName
                            }"
                            placeholder="${
                                'e.g.,'
                                + ' Customer'
                                + ' Onboarding'
                            }"
                            style="${
                                'font-size:'
                                + '1.125rem;'
                                + 'font-weight'
                                + ':500'
                            }"
                        />
                    </div>
                    <div>
                        <label
                            class="${
                                'label mb-1'
                                + ' text-xs'
                            }"
                        >${
                            'Department'
                        }</label>
                        <select
                            class="input"
                            id="${
                                'flow'
                                + '-department'
                            }"
                        >
                            ${deptOptions.map(
                                department =>
                                    html`
                            <option
                                ${trusted(
                                    department
                                    === state
                                    .flowDepartment
                                    ? 'selected'
                                    : ''
                                )}
                            >${
                                department
                            }</option>
                            `)}
                        </select>
                    </div>
                    <div
                        style="${
                            'grid-column'
                            + ':span 2'
                        }"
                    >
                        <label
                            class="${
                                'label mb-1'
                                + ' text-xs'
                            }"
                        >${
                            'Description'
                        }</label>
                        <textarea
                            class="textarea"
                            id="${
                                'flow'
                                + '-description'
                            }"
                            style="resize:none"
                            placeholder="${
                                'Briefly'
                                + ' describe'
                                + ' what this'
                                + ' process'
                                + ' accomplishes'
                                + '...'
                            }"
                        >${
                            state
                            .flowDescription
                        }</textarea>
                    </div>
                </div>
            </div>

            ${buildEditMode()}
        </div>`;
    }

    function mutateFlowDetailPage(): void {
        if (!root) return;
        setHtml(
            root, buildFlowDetailPage(),
        );
        bindFlowDetailEvents();
    }

    function bindFlowDetailEvents(): void {
        $('#flow-detail-back-btn', document)
            ?.addEventListener(
                'click',
                () => navigateTo('flow'),
            );

        $$('[data-step-header]', document).forEach(
            el => {
                el.addEventListener(
                    'click',
                    () => {
                        syncFormFields();
                        const id =
                            el.getAttribute(
                                'data-step'
                                + '-header',
                            );
                        state.expandedStepId =
                            state
                            .expandedStepId
                            === id
                                ? null
                                : id;
                        mutateFlowDetailPage();
                    },
                );
            },
        );

        $$('[data-action="move-step"]', document)
            .forEach(el => {
                el.addEventListener(
                    'click',
                    (e) => {
                        e.stopPropagation();
                        syncFormFields();
                        const id =
                            el.getAttribute(
                                'data-step'
                                + '-id',
                            );
                        const dir =
                            el.getAttribute(
                                'data-'
                                + 'direction',
                            );
                        const stepIdx =
                            state
                            .flowSteps
                            .findIndex(
                                step =>
                                    step.id
                                    === id,
                            );
                        if (stepIdx < 0) {
                            return;
                        }
                        const targetIdx =
                            dir === 'up'
                                ? stepIdx - 1
                                : stepIdx + 1;
                        if (
                            targetIdx < 0
                            || targetIdx
                                >= state
                                .flowSteps
                                .length
                        ) {
                            return;
                        }
                        const swapped = [
                            ...state.flowSteps,
                        ];
                        const temp =
                            swapped[
                                stepIdx
                            ]!;
                        swapped[stepIdx] =
                            swapped[
                                targetIdx
                            ]!;
                        swapped[targetIdx] =
                            temp;
                        state.flowSteps =
                            swapped;
                        mutateFlowDetailPage();
                    },
                );
            });

        $$('[data-remove-step]', document).forEach(
            el => {
                el.addEventListener(
                    'click',
                    (e) => {
                        e.stopPropagation();
                        syncFormFields();
                        state.flowSteps =
                            state.flowSteps
                            .filter(
                                step =>
                                    step.id
                                    !== el
                                    .getAttribute(
                                        'data-'
                                        + 'remove'
                                        + '-step',
                                    ),
                            );
                        mutateFlowDetailPage();
                    },
                );
            },
        );

        $$('[data-action="toggle-tool"]', document)
            .forEach(el => {
                el.addEventListener(
                    'click',
                    () => {
                        syncFormFields();
                        const stepId =
                            el.getAttribute(
                                'data-step'
                                + '-id',
                            ) ?? '';
                        const tool =
                            el.getAttribute(
                                'data-tool'
                                + '-name',
                            ) ?? '';
                        state.flowSteps =
                            state.flowSteps
                            .map(
                                s =>
                                    s.id
                                    !== stepId
                                    ? s
                                    : {
                                        ...s,
                                        tools:
                                            s
                                            .tools
                                            .includes(
                                                tool,
                                            )
                                            ? s
                                            .tools
                                            .filter(
                                                t =>
                                                    t
                                                    !== tool,
                                            )
                                            : [
                                                ...s
                                                .tools,
                                                tool,
                                            ],
                                    },
                            );
                        mutateFlowDetailPage();
                    },
                );
            });

        $('#flow-add-step', document)?.addEventListener(
            'click',
            () => {
                syncFormFields();
                const newStep: FlowStep = {
                    id: crypto.randomUUID(),
                    title: '',
                    description: '',
                    owner: '',
                    role: '',
                    tools: [],
                    duration: '',
                    sortOrder:
                        state.flowSteps
                        .length + 1,
                    type: 'action',
                };
                state.flowSteps = [
                    ...state.flowSteps,
                    newStep,
                ];
                state.expandedStepId =
                    newStep.id;
                mutateFlowDetailPage();
            },
        );

        $('#flow-save-btn', document)?.addEventListener(
            'click',
            async () => {
                syncFormFields();
                try {
                    await putFlow(
                        state.currentFlowId,
                        {
                            name:
                                state
                                .flowName,
                            description:
                                state
                                .flowDescription,
                            department:
                                state
                                .flowDepartment,
                        },
                    );
                    await Promise.all(
                        state.flowSteps.map(
                            step =>
                                putFlowStep(
                                    state
                                    .currentFlowId,
                                    step.id,
                                    {
                                        title:
                                            step
                                            .title,
                                        description:
                                            step
                                            .description,
                                        owner:
                                            step
                                            .owner,
                                        role:
                                            step
                                            .role,
                                        tools:
                                            JSON
                                            .stringify(
                                                step
                                                .tools,
                                            ),
                                        duration:
                                            step
                                            .duration,
                                        sort_order:
                                            step
                                            .sortOrder,
                                        type:
                                            step
                                            .type,
                                    } as Record<
                                        string,
                                        unknown
                                    >,
                                ),
                        ),
                    );
                    showToast(
                        'Flow saved',
                        'success',
                    );
                } catch {
                    showToast(
                        'Failed to save'
                        + ' flow',
                        'error',
                    );
                }
            },
        );
    }

    const flowData = await withLoadingState(
        root,
        buildSkeleton('card-list', 4),
        () => getFlow(state.currentFlowId),
        init,
    );
    if (!flowData) return;

    if (flowData.steps.length === 0) {
        setHtml(
            root,
            buildEmptyState(
                iconGitBranch(24, ''),
                'No Process Documented',
                'Start documenting your'
                + ' processes to improve'
                + ' visibility and'
                + ' consistency.',
            ),
        );
        return;
    }

    state.flowName = flowData.name;
    state.flowDescription =
        flowData.description;
    state.flowDepartment =
        flowData.department;
    state.flowSteps = flowData.steps;
    state.expandedStepId = null;
    mutateFlowDetailPage();
}
