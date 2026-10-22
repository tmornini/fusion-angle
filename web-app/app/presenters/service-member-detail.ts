import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { mutateSlot } from '../dom.ts';
import {
    makeFieldKeyValidator,
} from '../field-key-validator.ts';
import { displayText } from '../format.ts';
import {
    ICON_SIZE,
    iconArrowLeft,
    iconEdit,
    iconExternalLink,
    iconSave,
    iconX,
    iconMonitor,
} from '../icons.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    type ServiceMemberDraft,
} from '../../../client/index.ts';
import { ServiceMember } from '../../../shared/types.ts';
import { buildReadonlyField } from './detail-field.ts';
import {
    buildRemoveAffordance,
    type SeatRemoval,
} from './human-member-detail.ts';

export interface ServiceMemberDraftFields {
    name: string;
    description: string;
}

export type ServiceMemberFieldKey =
    | 'name'
    | 'description';

const FIELD_KEYS: ReadonlySet<ServiceMemberFieldKey> =
    new Set(['name', 'description']);

export const isServiceMemberFieldKey =
    makeFieldKeyValidator(FIELD_KEYS);

export function serviceMemberDraftFromMember(
    member: ServiceMember,
): ServiceMemberDraftFields {
    return {
        name: member.nameText(),
        description: member.descriptionText(),
    };
}

export function serviceMemberPatchFromDraft(
    draft: ServiceMemberDraftFields,
): ServiceMemberDraft {
    return {
        name: draft.name,
        description: draft.description,
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
            ${iconMonitor(ICON_SIZE['5xl'], 'text-primary')}
        </div>`;
}

function buildTitleSection(
    member: ServiceMember,
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
                ${member.nameText()}
            </h1>
            <span class="${
                'badge badge-default'
                + ' text-xs'
            }">Service</span>
        </div>`;
}

function buildEditableName(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="service-name">Name</label>
            <input class="input"
                id="service-name"
                type="text"
                data-member-field="name"
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
            }" for="service-description"
            >Description</label>
            <textarea class="textarea"
                rows="3"
                id="service-description"
                data-member-field="description"
            >${value}</textarea>
        </div>`;
}

// The identity the member signs in as; its client
// registration lives on the identity page.
function buildIdentityLink(
    member: ServiceMember,
): SafeHtml {
    return html`
        <a class="btn btn-outline gap-2"
            href="${buildPageUrl(
                'identity-detail',
                { identityId: member.idForLink() },
            )}">
            ${iconExternalLink(ICON_SIZE.base, '')}
            Identity
        </a>`;
}

function buildServiceCard(
    body: SafeHtml,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display'
                + ' font-semibold mb-4'
            }">Service Member</h3>
            ${body}
        </div>`;
}

function buildReadonlyBody(
    member: ServiceMember,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar()}
            <div class="flex-1">
                ${buildReadonlyField(
                    'Name',
                    member.nameText(),
                )}
            </div>
        </div>
        ${buildReadonlyDescription(
            member.descriptionText(),
        )}
        <div class="mt-6">
            ${buildIdentityLink(member)}
        </div>`;
}

function buildEditableBody(
    draft: ServiceMemberDraftFields,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar()}
            <div class="flex-1">
                ${buildEditableName(draft.name)}
            </div>
        </div>
        ${buildEditableDescription(
            draft.description,
        )}`;
}

function buildReadonlyActionButtons(
    removal: SeatRemoval,
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="member-edit-btn"
            data-member-action="edit">
            ${iconEdit(ICON_SIZE.base, '')} Edit
        </button>
        ${buildRemoveAffordance(removal)}`;
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

export class ServiceMemberDetailPresenter {
    readonly #member: ServiceMember;
    readonly #removal: SeatRemoval;

    constructor(
        member: ServiceMember,
        removal: SeatRemoval,
    ) {
        this.#member = member;
        this.#removal = removal;
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
            buildTitleSection(this.#member),
        );
        mutateSlot(
            container,
            '.member-actions-slot',
            buildReadonlyActionButtons(this.#removal),
        );
        mutateSlot(
            container,
            '.member-cards-slot',
            buildServiceCard(
                buildReadonlyBody(this.#member),
            ),
        );
    }
}

export class ServiceMemberDetailEditPresenter {
    readonly #member: ServiceMember;
    readonly #draft: ServiceMemberDraftFields;

    constructor(
        member: ServiceMember,
        draft: ServiceMemberDraftFields,
    ) {
        this.#member = member;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    draft(): ServiceMemberDraftFields {
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
            buildTitleSection(this.#member),
        );
        mutateSlot(
            container,
            '.member-actions-slot',
            buildEditableActionButtons(),
        );
        mutateSlot(
            container,
            '.member-cards-slot',
            buildServiceCard(
                buildEditableBody(this.#draft),
            ),
        );
    }
}
