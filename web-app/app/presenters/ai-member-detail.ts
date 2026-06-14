import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { mutateSlot } from '../dom.ts';
import {
    makeFieldKeyValidator,
} from '../field-key-validator.ts';
import { DISPLAY_ABSENT, displayText } from '../format.ts';
import {
    ICON_SIZE,
    iconArrowLeft,
    iconEdit,
    iconSave,
    iconX,
    iconBrain,
} from '../icons.ts';
import {
    MEMBER_STATE_CONFIG,
} from './state-display.ts';
import {
    AIMember,
    isMemberState,
    type AIMemberDraft,
    type MemberState,
} from '../adapters/index.ts';
import {
    findProviderModel,
    getModelsByProvider,
} from '../../../api/provider-models.ts';

export interface AIMemberDraftFields {
    name: string;
    description: string;
    skillFocus: string;
    model: string;
    state: MemberState;
}

export type AIMemberFieldKey =
    | 'name'
    | 'description'
    | 'skillFocus'
    | 'model'
    | 'state';

const FIELD_KEYS: ReadonlySet<AIMemberFieldKey> =
    new Set([
        'name', 'description', 'skillFocus',
        'model', 'state',
    ]);

export const isAIMemberFieldKey =
    makeFieldKeyValidator(FIELD_KEYS);

export function aiMemberDraftFromMember(
    member: AIMember,
): AIMemberDraftFields {
    return {
        name: member.nameText(),
        description: member.descriptionText(),
        skillFocus: member.skillFocusText(),
        model: member.modelId(),
        state: member.stateValue(),
    };
}

export function aiMemberPatchFromDraft(
    draft: AIMemberDraftFields,
): Partial<AIMemberDraft> {
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
<div class="member-detail-host">
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
                    id="member-back-btn"
                    data-member-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(ICON_SIZE.xl, '')}
                </button>
                <div class="member-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
                + ' member-actions-slot'
            }"></div>
        </div>
        <div class="${
            'stack-lg member-cards-slot'
        }"></div>
    </div>
</div>`);
}

function buildAvatar(): SafeHtml {
    return html`
        <div class="member-avatar">
            ${iconBrain(ICON_SIZE['5xl'], 'text-primary')}
        </div>`;
}

function buildReadonlyTitleSection(
    member: AIMember,
): SafeHtml {
    const cfg = MEMBER_STATE_CONFIG[member.stateValue()];
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
                ${member.nameText()}
            </h1>
            <span class="${
                'badge badge-default'
                + ' text-xs'
            }">AI</span>
            <span class="${
                'badge '
                + cfg.className
                + ' text-xs'
            }">
                ${cfg.label}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${findProviderModel(
                member.modelId(),
            )!.provider}
        </p>`;
}

function buildEditableTitleSection(
    member: AIMember,
    draft: AIMemberDraftFields,
): SafeHtml {
    const cfg = MEMBER_STATE_CONFIG[member.stateValue()];
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
                ${member.nameText()}
            </h1>
            <span class="${
                'badge badge-default'
                + ' text-xs'
            }">AI</span>
            <span class="${
                'badge '
                + cfg.className
                + ' text-xs'
            }">
                ${cfg.label}
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
                ${displayText(value)}
            </p>
        </div>`;
}

function buildEditableField(
    id: string,
    field: AIMemberFieldKey,
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
                data-member-field="${field}"
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
                ${displayText(value)}
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
                data-member-field="description"
            >${value}</textarea>
        </div>`;
}

function buildEditableState(
    value: MemberState,
): SafeHtml {
    const options = (
        Object.keys(
            MEMBER_STATE_CONFIG,
        ) as MemberState[]
    ).filter(isMemberState);
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="ai-state"
            >State</label>
            <select class="input"
                id="ai-state"
                data-member-field="state"
            >${options.map(s =>
                html`<option
                    value="${s}"
                    ${trusted(
                        value === s
                            ? 'selected'
                            : '',
                    )}
                >${
                    MEMBER_STATE_CONFIG[s].label
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
                ${displayText(value)}
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
                data-member-field="skillFocus"
            >${value}</textarea>
        </div>`;
}

function buildReadonlyModel(
    modelId: string,
): SafeHtml {
    const model = findProviderModel(modelId)!;
    const label =
        model.name + ' — ' + model.provider;
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
                data-member-field="model"
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
            }">AI Member</h3>
            ${body}
        </div>`;
}

function buildReadonlyIdentityBody(
    member: AIMember,
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
                    member.nameText(),
                )}
                ${buildReadonlyModel(
                    member.modelId(),
                )}
            </div>
        </div>
        <div class="${
            'mb-4'
        }">
            ${buildReadonlyDescription(
                member.descriptionText(),
            )}
        </div>
        ${buildReadonlySkillFocus(
            member.skillFocusText(),
        )}`;
}

function buildEditableIdentityBody(
    draft: AIMemberDraftFields,
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
            id="member-edit-btn"
            data-member-action="edit">
            ${iconEdit(ICON_SIZE.base, '')} Edit
        </button>`;
}

function buildEditableActionButtons(
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="member-cancel-btn"
            data-member-action="cancel">
            ${iconX(ICON_SIZE.base, '')} Cancel
        </button>
        <button
            class="${
                'btn btn-primary gap-2'
            }"
            id="member-save-btn"
            data-member-action="save">
            ${iconSave(ICON_SIZE.base, '')} Save
        </button>`;
}

export class AIMemberDetailPresenter {
    readonly #member: AIMember;

    constructor(member: AIMember) {
        this.#member = member;
    }

    idForLink(): string {
        return this.#member.idForLink();
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
            '.member-title-slot',
            buildReadonlyTitleSection(
                this.#member,
            ),
        );
        mutateSlot(
            container,
            '.member-actions-slot',
            buildReadonlyActionButtons(),
        );
        mutateSlot(
            container,
            '.member-cards-slot',
            buildIdentityCard(
                buildReadonlyIdentityBody(
                    this.#member,
                ),
            ),
        );
    }
}

export class AIMemberDetailEditPresenter {
    readonly #member: AIMember;
    readonly #draft: AIMemberDraftFields;

    constructor(
        member: AIMember,
        draft: AIMemberDraftFields,
    ) {
        this.#member = member;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    draft(): AIMemberDraftFields {
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
            '.member-title-slot',
            buildEditableTitleSection(
                this.#member, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.member-actions-slot',
            buildEditableActionButtons(),
        );
        mutateSlot(
            container,
            '.member-cards-slot',
            buildIdentityCard(
                buildEditableIdentityBody(
                    this.#draft,
                ),
            ),
        );
    }
}
