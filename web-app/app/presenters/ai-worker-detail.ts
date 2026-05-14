import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { $required } from '../dom.ts';
import {
    iconArrowLeft,
    iconEdit,
    iconSave,
    iconX,
    iconBrain,
    iconShield,
    iconAlertTriangle,
} from '../icons.ts';
import {
    AIWorker,
    type AIWorkerEntity,
} from '../adapters/index.ts';

export interface AIWorkerDraftFields {
    name: string;
    provider: string;
    description: string;
    // Empty string means "do not change the
    // stored token" — the existing value is
    // preserved at save time. The validator
    // forbids persisting an empty token, so
    // the page module merges this draft into
    // the existing row before calling
    // putAIWorker.
    authTokenOverride: string;
}

export type AIWorkerFieldKey =
    | 'name'
    | 'provider'
    | 'description'
    | 'authTokenOverride';

const FIELD_KEYS: ReadonlySet<AIWorkerFieldKey> =
    new Set([
        'name', 'provider', 'description',
        'authTokenOverride',
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
        provider: worker.providerText(),
        description: worker.descriptionText(),
        authTokenOverride: '',
    };
}

// Returns the patch to merge into the
// existing entity. If authTokenOverride is
// empty (after trim), omit the auth_token
// field so the caller preserves the prior
// value (the validator forbids persisting
// an empty token).
export function aiWorkerPatchFromDraft(
    draft: AIWorkerDraftFields,
): Partial<
    Pick<AIWorkerEntity,
        | 'name' | 'provider'
        | 'description' | 'auth_token'>
> {
    const base: Partial<AIWorkerEntity> = {
        name: draft.name,
        provider: draft.provider,
        description: draft.description,
    };
    const trimmedOverride =
        draft.authTokenOverride.trim();
    if (trimmedOverride !== '') {
        base.auth_token = trimmedOverride;
    }
    return base;
}

function buildShell(
    container: HTMLElement,
): void {
    setHtml(container, html`
<div class="worker-detail-host">
    <div class="worker-detail-wrap">
        <div class="${
            'flex items-center gap-2'
            + ' text-sm text-muted mb-4'
            + ' worker-breadcrumb-slot'
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

function buildBreadcrumb(
    name: string,
): SafeHtml {
    return html`
        <a href="../workers/index.html"
            class="hover-link">
            Workers
        </a>
        <span>/</span>
        <span>${name}</span>`;
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
        </div>
        <p class="text-sm text-muted">
            ${worker.providerText()}
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
        </div>
        <p class="text-sm text-muted">
            ${draft.provider}
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
                ${value === '' ? '—' : value}
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
                ${value === '' ? '—' : value}
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

function buildReadonlyTokenRow(
    worker: AIWorker,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }">${
                iconShield(16, '')
            } Auth Token</p>
            <p class="${
                'text-sm font-mono'
            }">
                ${worker.maskedToken()}
            </p>
        </div>`;
}

function buildEditableTokenRow(
    draft: AIWorkerDraftFields,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }" for="ai-auth-token">${
                iconShield(16, '')
            } Auth Token</label>
            <input class="input"
                id="ai-auth-token"
                type="password"
                placeholder="${
                    'Leave blank to keep'
                    + ' current token'
                }"
                data-worker-field="${
                    'authTokenOverride'
                }"
                value="${
                    draft.authTokenOverride
                }" />
            ${buildSecurityWarning()}
        </div>`;
}

function buildSecurityWarning(): SafeHtml {
    return html`
        <p class="${
            'text-xs text-warning mt-2'
            + ' flex items-start gap-1'
        }">
            ${iconAlertTriangle(14, '')}
            <span>${
                'Auth tokens are stored'
                + ' unencrypted in this'
                + " browser's local storage."
                + ' Do not enter production'
                + ' keys today; secure'
                + ' storage arrives with the'
                + ' AI-invocation feature.'
            }</span>
        </p>`;
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
                ${buildReadonlyField(
                    'Provider',
                    worker.providerText(),
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
        ${buildReadonlyTokenRow(worker)}`;
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
                ${buildEditableField(
                    'ai-provider',
                    'provider',
                    'Provider',
                    draft.provider,
                    'text',
                )}
            </div>
        </div>
        <div class="mb-4">
            ${buildEditableDescription(
                draft.description,
            )}
        </div>
        ${buildEditableTokenRow(draft)}`;
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
            '.worker-breadcrumb-slot',
            buildBreadcrumb(
                this.#worker.nameText(),
            ),
        );
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
            '.worker-breadcrumb-slot',
            buildBreadcrumb(
                this.#worker.nameText(),
            ),
        );
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
