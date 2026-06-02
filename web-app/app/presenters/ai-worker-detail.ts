import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { $required } from '../dom.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import {
    iconArrowLeft,
    iconEdit,
    iconSave,
    iconX,
    iconBrain,
} from '../icons.ts';
import {
    AIWorker,
    WORKER_STATE_CONFIG,
    isWorkerState,
    type AIWorkerDraft,
    type WorkerState,
} from '../adapters/index.ts';
import {
    findProviderModel,
    getModelsByProvider,
} from '../../../api/provider-models.ts';

export interface AIWorkerDraftFields {
    name: string;
    description: string;
    skillFocus: string;
    model: string;
    state: WorkerState;
}

export type AIWorkerFieldKey =
    | 'name'
    | 'description'
    | 'skillFocus'
    | 'model'
    | 'state';

const FIELD_KEYS: ReadonlySet<AIWorkerFieldKey> =
    new Set([
        'name', 'description', 'skillFocus',
        'model', 'state',
    ]);

export function isAIWorkerFieldKey(
    s: string | null,
): s is AIWorkerFieldKey {
    return s !== null
        && FIELD_KEYS.has(
            s as AIWorkerFieldKey,
        );
}

export function aiWorkerDraftFromWorker(
    worker: AIWorker,
): AIWorkerDraftFields {
    return {
        name: worker.nameText(),
        description: worker.descriptionText(),
        skillFocus: worker.skillFocusText(),
        model: worker.modelId(),
        state: worker.stateValue(),
    };
}

export function aiWorkerPatchFromDraft(
    draft: AIWorkerDraftFields,
): Partial<AIWorkerDraft> {
    return {
        name: draft.name,
        description: draft.description,
        skill_focus: draft.skillFocus,
        model: draft.model,
    };
}

function buildShell(
    container: HTMLElement,
): void {
    setHtml(container, html`
<div class="worker-detail-host">
    <div class="entity">
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
                    id="worker-back-btn"
                    data-worker-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(20, '')}
                </button>
                <div class="worker-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
                + ' worker-actions-slot'
            }"></div>
        </div>
        <div class="${
            'stack-lg worker-cards-slot'
        }"></div>
    </div>
</div>`);
}

function mutateSlot(
    container: HTMLElement,
    cls: string,
    markup: SafeHtml,
): void {
    setHtml($required(cls, container), markup);
}

function buildAvatar(): SafeHtml {
    return html`
        <div class="worker-avatar">
            ${iconBrain(40, 'text-primary')}
        </div>`;
}

function buildReadonlyTitleSection(
    worker: AIWorker,
): SafeHtml {
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl'
                + ' font-display'
                + ' font-bold'
            }">
                ${worker.nameText()}
            </h1>
            <span class="${
                'badge badge-default'
                + ' text-xs'
            }">AI</span>
            <span class="${
                'badge '
                + worker.stateClassName()
                + ' text-xs'
            }">
                ${worker.stateLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${findProviderModel(
                worker.modelId(),
            )?.provider ?? DISPLAY_ABSENT}
        </p>`;
}

function buildEditableTitleSection(
    worker: AIWorker,
    draft: AIWorkerDraftFields,
): SafeHtml {
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl'
                + ' font-display'
                + ' font-bold'
            }">
                ${worker.nameText()}
            </h1>
            <span class="${
                'badge badge-default'
                + ' text-xs'
            }">AI</span>
            <span class="${
                'badge '
                + worker.stateClassName()
                + ' text-xs'
            }">
                ${worker.stateLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${findProviderModel(
                draft.model,
            )?.provider ?? DISPLAY_ABSENT}
        </p>`;
}

function buildReadonlyField(
    label: string,
    value: string,
    icon?: SafeHtml,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }">${
                icon ?? html``
            } ${label}</p>
            <p class="text-sm">
                ${value === '' ? DISPLAY_ABSENT : value}
            </p>
        </div>`;
}

function buildEditableField(
    id: string,
    field: AIWorkerFieldKey,
    label: string,
    value: string,
    inputType: string,
    icon?: SafeHtml,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }" for="${id}">${
                icon ?? html``
            } ${label}</label>
            <input class="input"
                id="${id}"
                type="${inputType}"
                data-worker-field="${field}"
                value="${value}" />
        </div>`;
}

function buildReadonlyDescription(
    value: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 block'
            }">Description</p>
            <p class="text-sm">
                ${value === '' ? DISPLAY_ABSENT : value}
            </p>
        </div>`;
}

function buildEditableDescription(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="ai-description"
            >Description</label>
            <textarea class="textarea"
                rows="3"
                id="ai-description"
                data-worker-field="description"
            >${value}</textarea>
        </div>`;
}

function buildEditableState(
    value: WorkerState,
): SafeHtml {
    const options = (
        Object.keys(
            WORKER_STATE_CONFIG,
        ) as WorkerState[]
    ).filter(isWorkerState);
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="ai-state"
            >State</label>
            <select class="input"
                id="ai-state"
                data-worker-field="state"
            >${options.map(s =>
                html`<option
                    value="${s}"
                    ${trusted(
                        value === s
                            ? 'selected'
                            : '',
                    )}
                >${
                    WORKER_STATE_CONFIG[s].label
                }</option>`)
            }</select>
        </div>`;
}

function buildReadonlySkillFocus(
    value: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 block'
            }">Skill Focus</p>
            <p class="text-sm">
                ${value === '' ? DISPLAY_ABSENT : value}
            </p>
        </div>`;
}

function buildEditableSkillFocus(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="ai-skill-focus"
            >Skill Focus</label>
            <textarea class="textarea"
                rows="3"
                id="ai-skill-focus"
                data-worker-field="skillFocus"
            >${value}</textarea>
        </div>`;
}

function buildReadonlyModel(
    modelId: string,
): SafeHtml {
    const model = findProviderModel(modelId);
    const label = model
        ? model.name + ' — ' + model.provider
        : DISPLAY_ABSENT;
    return html`
        <div>
            <p class="${
                'label mb-2 block'
            }">Model</p>
            <p class="text-sm">${label}</p>
        </div>`;
}

export function buildModelOptgroups(
    selectedId: string,
): SafeHtml {
    return html`${[...getModelsByProvider()].map(
        ([provider, models]) => html`<optgroup
            label="${provider}">${models.map(
            m => html`<option
                value="${m.id}"
                ${trusted(
                    selectedId === m.id
                        ? 'selected'
                        : '',
                )}
            >${m.name}</option>`)
        }</optgroup>`)
    }`;
}

function buildEditableModel(
    selectedId: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="ai-model"
            >Model</label>
            <select class="input"
                id="ai-model"
                data-worker-field="model"
            >${
                buildModelOptgroups(selectedId)
            }</select>
        </div>`;
}

function buildIdentityCard(
    body: SafeHtml,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display'
                + ' font-semibold mb-4'
            }">AI Worker</h3>
            ${body}
        </div>`;
}

function buildReadonlyIdentityBody(
    worker: AIWorker,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar()}
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${buildReadonlyField(
                    'Name',
                    worker.nameText(),
                )}
                ${buildReadonlyModel(
                    worker.modelId(),
                )}
            </div>
        </div>
        <div class="${
            'mb-4'
        }">
            ${buildReadonlyDescription(
                worker.descriptionText(),
            )}
        </div>
        ${buildReadonlySkillFocus(
            worker.skillFocusText(),
        )}`;
}

function buildEditableIdentityBody(
    worker: AIWorker,
    draft: AIWorkerDraftFields,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar()}
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${buildEditableField(
                    'ai-name',
                    'name',
                    'Name',
                    draft.name,
                    'text',
                )}
                ${buildEditableModel(
                    draft.model,
                )}
            </div>
        </div>
        <div class="mb-4">
            ${buildEditableDescription(
                draft.description,
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableState(draft.state)}
        </div>
        ${buildEditableSkillFocus(
            draft.skillFocus,
        )}`;
}

function buildReadonlyActionButtons(
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="worker-edit-btn"
            data-worker-action="edit">
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
            id="worker-cancel-btn"
            data-worker-action="cancel">
            ${iconX(16, '')} Cancel
        </button>
        <button
            class="${
                'btn btn-primary gap-2'
            }"
            id="worker-save-btn"
            data-worker-action="save">
            ${iconSave(16, '')} Save
        </button>`;
}

export class AIWorkerDetailPresenter {
    readonly #worker: AIWorker;

    constructor(worker: AIWorker) {
        this.#worker = worker;
    }

    idForLink(): string {
        return this.#worker.idForLink();
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
            '.worker-title-slot',
            buildReadonlyTitleSection(
                this.#worker,
            ),
        );
        mutateSlot(
            container,
            '.worker-actions-slot',
            buildReadonlyActionButtons(),
        );
        mutateSlot(
            container,
            '.worker-cards-slot',
            buildIdentityCard(
                buildReadonlyIdentityBody(
                    this.#worker,
                ),
            ),
        );
    }
}

export class AIWorkerDetailEditPresenter {
    readonly #worker: AIWorker;
    readonly #draft: AIWorkerDraftFields;

    constructor(
        worker: AIWorker,
        draft: AIWorkerDraftFields,
    ) {
        this.#worker = worker;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#worker.idForLink();
    }

    draft(): AIWorkerDraftFields {
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
            '.worker-title-slot',
            buildEditableTitleSection(
                this.#worker, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.worker-actions-slot',
            buildEditableActionButtons(),
        );
        mutateSlot(
            container,
            '.worker-cards-slot',
            buildIdentityCard(
                buildEditableIdentityBody(
                    this.#worker,
                    this.#draft,
                ),
            ),
        );
    }
}
