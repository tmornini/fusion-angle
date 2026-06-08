import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { $required } from '../dom.ts';
import {
    makeFieldKeyValidator,
} from '../field-key-validator.ts';
import { initials } from '../core.ts';
import { displayText } from '../format.ts';
import {
    iconArrowLeft,
    iconEdit,
    iconSave,
    iconX,
    iconMail,
    iconPhone,
    iconBriefcase,
    iconStar,
    iconCheckCircle2,
} from '../icons.ts';
import {
    HumanMember,
    MEMBER_STATE_CONFIG,
    type MemberState,
    type HumanMemberDraft,
    isMemberState,
    jsonArrayField,
    MEMBER_WITHOUT_PII_NAME,
} from '../adapters/index.ts';
import {
    WorkingStylesPresenter,
} from './working-styles.ts';

const ALL_STRENGTHS: readonly string[] = [
    'Strategic Planning',
    'Data Analysis',
    'Stakeholder Management',
    'Agile Methods',
    'Team Leadership',
    'Risk Management',
    'Budget Planning',
    'Technical Writing',
    'User Research',
    'Prototyping',
];

const DEPARTMENTS: readonly string[] = [
    'Product',
    'Engineering',
    'Design',
    'Sales',
    'Operations',
    'Analytics',
];

export interface HumanMemberDraftFields {
    name: string;
    email: string;
    phone: string;
    title: string;
    department: string;
    state: MemberState;
    bio: string;
    strengths: readonly string[];
}

export type HumanMemberFieldKey =
    | 'name'
    | 'email'
    | 'phone'
    | 'title'
    | 'department'
    | 'state'
    | 'bio';

const FIELD_KEYS:
    ReadonlySet<HumanMemberFieldKey> =
    new Set([
        'name', 'email',
        'phone', 'title', 'department',
        'state', 'bio',
    ]);

export const isHumanMemberFieldKey =
    makeFieldKeyValidator(FIELD_KEYS);

export function humanMemberDraftFromMember(
    member: HumanMember,
): HumanMemberDraftFields {
    const pii = member.pii();
    return {
        name: pii.erased ? '' : pii.name,
        email: pii.erased ? '' : pii.email,
        phone: pii.erased ? '' : pii.phone,
        title: member.titleLabel(),
        department: member.departmentLabel(),
        state: member.stateValue(),
        bio: pii.erased ? '' : pii.bio,
        strengths: member.parsedStrengths(),
    };
}

export function humanMemberPatchFromDraft(
    draft: HumanMemberDraftFields,
): Omit<HumanMemberDraft, 'team_dimensions'> {
    return {
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        title: draft.title,
        department: draft.department,
        bio: draft.bio,
        strengths: jsonArrayField(
            [...draft.strengths],
        ),
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
                    ${iconArrowLeft(20, '')}
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

function mutateSlot(
    container: HTMLElement,
    cls: string,
    markup: SafeHtml,
): void {
    setHtml($required(cls, container), markup);
}

function buildAvatar(
    initialsStr: string,
): SafeHtml {
    return html`
        <div class="member-avatar">
            <span class="${
                'text-3xl font-bold'
                + ' text-primary'
            }">${initialsStr}</span>
        </div>`;
}

function buildReadonlyTitleSection(
    member: HumanMember,
): SafeHtml {
    const pii = member.pii();
    const name = pii.erased
        ? MEMBER_WITHOUT_PII_NAME
        : pii.name;
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
                ${name}
            </h1>
            <span class="${
                'badge '
                + member.stateClassName()
                + ' text-xs'
            }">
                ${member.stateLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${member.titleLabel()}
            •
            ${member.departmentLabel()}
        </p>`;
}

function buildEditableTitleSection(
    member: HumanMember,
    draft: HumanMemberDraftFields,
): SafeHtml {
    const pii = member.pii();
    const name = pii.erased
        ? MEMBER_WITHOUT_PII_NAME
        : pii.name;
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
                ${name}
            </h1>
            <span class="${
                'badge '
                + member.stateClassName()
                + ' text-xs'
            }">
                ${member.stateLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${draft.title}
            • ${draft.department}
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
    field: HumanMemberFieldKey,
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

function buildEditableDepartment(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="member-department"
            >Department</label>
            <select class="input"
                id="member-department"
                data-member-field="department"
            >${DEPARTMENTS.map(d =>
                html`<option
                    value="${d}"
                    ${trusted(
                        value === d
                            ? 'selected'
                            : '',
                    )}
                >${d}</option>`)
            }</select>
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
            }" for="member-state"
            >State</label>
            <select class="input"
                id="member-state"
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

function buildReadonlyBio(
    value: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 block'
            }">Bio</p>
            <p class="text-sm">
                ${displayText(value)}
            </p>
        </div>`;
}

function buildEditableBio(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="member-bio">Bio</label>
            <textarea class="textarea"
                rows="3"
                id="member-bio"
                data-member-field="bio"
            >${value}</textarea>
        </div>`;
}

function buildPersonalInfoCard(
    body: SafeHtml,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display'
                + ' font-semibold mb-4'
            }">Personal Information</h3>
            ${body}
        </div>`;
}

function buildReadonlyPersonalInfoBody(
    member: HumanMember,
): SafeHtml {
    const pii = member.pii();
    const name = pii.erased
        ? MEMBER_WITHOUT_PII_NAME
        : pii.name;
    const email = pii.erased ? '' : pii.email;
    const phone = pii.erased ? '' : pii.phone;
    const bio = pii.erased ? '' : pii.bio;
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar(
                initials(name),
            )}
            <div class="flex-1">
                ${buildReadonlyField(
                    'Name',
                    name,
                )}
            </div>
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildReadonlyField(
                'Email',
                email,
                iconMail(16, ''),
            )}
            ${buildReadonlyField(
                'Phone',
                phone,
                iconPhone(16, ''),
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildReadonlyField(
                'Title',
                member.titleLabel(),
                iconBriefcase(16, ''),
            )}
            ${buildReadonlyField(
                'Department',
                member.departmentLabel(),
            )}
        </div>
        ${buildReadonlyBio(bio)}`;
}

function buildEditablePersonalInfoBody(
    member: HumanMember,
    draft: HumanMemberDraftFields,
): SafeHtml {
    const pii = member.pii();
    const name = pii.erased
        ? MEMBER_WITHOUT_PII_NAME
        : pii.name;
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar(
                initials(name),
            )}
            <div class="flex-1">
                ${buildEditableField(
                    'member-name',
                    'name',
                    'Name',
                    draft.name,
                    'text',
                )}
            </div>
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableField(
                'member-email',
                'email',
                'Email',
                draft.email,
                'email',
                iconMail(16, ''),
            )}
            ${buildEditableField(
                'member-phone',
                'phone',
                'Phone',
                draft.phone,
                'text',
                iconPhone(16, ''),
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableField(
                'member-title',
                'title',
                'Title',
                draft.title,
                'text',
                iconBriefcase(16, ''),
            )}
            ${buildEditableDepartment(
                draft.department,
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableState(draft.state)}
        </div>
        ${buildEditableBio(draft.bio)}`;
}

function buildStrengthsCard(
    chips: SafeHtml,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold'
                + ' mb-4 flex items-center gap-2'
            }">${
                iconStar(20, 'text-primary')
            } Strengths</h3>
            <div class="${
                'flex flex-wrap gap-2'
            }" id="member-strengths">
                ${chips}
            </div>
        </div>`;
}

function buildSelectedStrengthChips(
    strengths: readonly string[],
): SafeHtml {
    return html`${strengths.map(
        name => html`<span class="${
            'pill-tag'
            + ' pill-tag-strength'
        }">${
            iconStar(10, '')
        } ${name}</span>`,
    )}`;
}

function buildEditableStrengthChips(
    strengths: readonly string[],
): SafeHtml {
    const draftSet = new Set(strengths);
    return html`${ALL_STRENGTHS.map(name => {
        const isActive = draftSet.has(name);
        const variant = isActive
            ? 'btn-primary'
            : 'btn-secondary';
        return html`<button class="${
            'strength-chip btn '
            + variant
            + ' btn-sm'
        }" data-strength="${name}">${
            isActive
                ? html`${
                    iconCheckCircle2(12, '')
                } `
                : html``
        }${name}</button>`;
    })}`;
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
            id="member-cancel-btn"
            data-member-action="cancel">
            ${iconX(16, '')} Cancel
        </button>
        <button
            class="${
                'btn btn-primary gap-2'
            }"
            id="member-save-btn"
            data-member-action="save">
            ${iconSave(16, '')} Save
        </button>`;
}

function buildTeamDimensionsCard(
    member: HumanMember,
): SafeHtml {
    return new WorkingStylesPresenter(
        member.parsedTeamDimensions(),
    ).buildCard();
}

export class HumanMemberDetailPresenter {
    readonly #member: HumanMember;

    constructor(member: HumanMember) {
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
            html`
                ${buildPersonalInfoCard(
                    buildReadonlyPersonalInfoBody(
                        this.#member,
                    ),
                )}
                ${buildTeamDimensionsCard(
                    this.#member,
                )}
                ${buildStrengthsCard(
                    buildSelectedStrengthChips(
                        this.#member
                            .parsedStrengths(),
                    ),
                )}`,
        );
    }
}

export class HumanMemberDetailEditPresenter {
    readonly #member: HumanMember;
    readonly #draft: HumanMemberDraftFields;

    constructor(
        member: HumanMember,
        draft: HumanMemberDraftFields,
    ) {
        this.#member = member;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    draft(): HumanMemberDraftFields {
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
            html`
                ${buildPersonalInfoCard(
                    buildEditablePersonalInfoBody(
                        this.#member,
                        this.#draft,
                    ),
                )}
                ${buildTeamDimensionsCard(
                    this.#member,
                )}
                ${buildStrengthsCard(
                    buildEditableStrengthChips(
                        this.#draft.strengths,
                    ),
                )}`,
        );
    }
}
