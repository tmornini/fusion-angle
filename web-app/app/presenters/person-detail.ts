import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { $required } from '../dom.ts';
import { initials } from '../core.ts';
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
    iconShield,
    iconTrash,
} from '../icons.ts';
import {
    Person,
    Role,
    USER_STATUS_CONFIG,
    type PersonStatus,
    type PersonEntity,
    type Member,
    isPersonStatus,
    jsonArrayField,
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

export interface PersonDraftFields {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    title: string;
    department: string;
    status: PersonStatus;
    bio: string;
    strengths: readonly string[];
}

export type PersonFieldKey =
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'title'
    | 'department'
    | 'status'
    | 'bio';

const FIELD_KEYS: ReadonlySet<PersonFieldKey> =
    new Set([
        'firstName', 'lastName', 'email',
        'phone', 'title', 'department',
        'status', 'bio',
    ]);

export function isPersonFieldKey(
    s: string | null,
): s is PersonFieldKey {
    return s !== null
        && FIELD_KEYS.has(s as PersonFieldKey);
}

export function personDraftFromPerson(
    person: Person,
): PersonDraftFields {
    return {
        firstName: person.firstNameText(),
        lastName: person.lastNameText(),
        email: person.emailAddress(),
        phone: person.phoneNumber(),
        title: person.titleLabel(),
        department: person.departmentLabel(),
        status: person.statusValue(),
        bio: person.bioText(),
        strengths: person.parsedStrengths(),
    };
}

export function personPatchFromDraft(
    draft: PersonDraftFields,
): Pick<PersonEntity,
    | 'first_name' | 'last_name' | 'email'
    | 'phone' | 'title' | 'department'
    | 'status' | 'bio' | 'strengths'> {
    return {
        first_name: draft.firstName,
        last_name: draft.lastName,
        email: draft.email,
        phone: draft.phone,
        title: draft.title,
        department: draft.department,
        status: draft.status,
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
<div class="person-detail-host">
    <div class="person-detail-wrap">
        <div class="${
            'flex items-center gap-2'
            + ' text-sm text-muted mb-4'
            + ' person-breadcrumb-slot'
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
                    id="person-back-btn"
                    data-person-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(20, '')}
                </button>
                <div class="person-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
                + ' person-actions-slot'
            }"></div>
        </div>
        <div class="${
            'stack-lg person-cards-slot'
        }"></div>
        <div class="${
            'person-roles-slot mt-6'
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
    fullName: string,
): SafeHtml {
    return html`
        <a href="../people/index.html"
            class="hover-link">
            People
        </a>
        <span>/</span>
        <span>${fullName}</span>`;
}

function buildAvatar(
    initialsStr: string,
): SafeHtml {
    return html`
        <div class="person-avatar">
            <span class="${
                'text-3xl font-bold'
                + ' text-primary'
            }">${initialsStr}</span>
        </div>`;
}

function buildReadonlyTitleSection(
    person: Person,
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
                ${person.fullName()}
            </h1>
            <span class="${
                'badge '
                + person.statusClassName()
                + ' text-xs'
            }">
                ${person.statusLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${person.titleLabel()}
            •
            ${person.departmentLabel()}
        </p>`;
}

function buildEditableTitleSection(
    person: Person,
    draft: PersonDraftFields,
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
                ${person.fullName()}
            </h1>
            <span class="${
                'badge '
                + person.statusClassName()
                + ' text-xs'
            }">
                ${person.statusLabel()}
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
                ${value === '' ? '—' : value}
            </p>
        </div>`;
}

function buildEditableField(
    id: string,
    field: PersonFieldKey,
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
                data-person-field="${field}"
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
            }" for="person-department"
            >Department</label>
            <select class="input"
                id="person-department"
                data-person-field="department"
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

function buildEditableStatus(
    value: PersonStatus,
): SafeHtml {
    const options = (
        Object.keys(
            USER_STATUS_CONFIG,
        ) as PersonStatus[]
    ).filter(isPersonStatus);
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="person-status"
            >Status</label>
            <select class="input"
                id="person-status"
                data-person-field="status"
            >${options.map(s =>
                html`<option
                    value="${s}"
                    ${trusted(
                        value === s
                            ? 'selected'
                            : '',
                    )}
                >${
                    USER_STATUS_CONFIG[s].label
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
                ${value === '' ? '—' : value}
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
            }" for="person-bio">Bio</label>
            <textarea class="textarea"
                rows="3"
                id="person-bio"
                data-person-field="bio"
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
    person: Person,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar(
                initials(person.fullName()),
            )}
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${buildReadonlyField(
                    'First Name',
                    person.firstNameText(),
                )}
                ${buildReadonlyField(
                    'Last Name',
                    person.lastNameText(),
                )}
            </div>
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildReadonlyField(
                'Email',
                person.emailAddress(),
                iconMail(16, ''),
            )}
            ${buildReadonlyField(
                'Phone',
                person.phoneNumber(),
                iconPhone(16, ''),
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildReadonlyField(
                'Title',
                person.titleLabel(),
                iconBriefcase(16, ''),
            )}
            ${buildReadonlyField(
                'Department',
                person.departmentLabel(),
            )}
        </div>
        ${buildReadonlyBio(person.bioText())}`;
}

function buildEditablePersonalInfoBody(
    person: Person,
    draft: PersonDraftFields,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar(
                initials(person.fullName()),
            )}
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${buildEditableField(
                    'person-first-name',
                    'firstName',
                    'First Name',
                    draft.firstName,
                    'text',
                )}
                ${buildEditableField(
                    'person-last-name',
                    'lastName',
                    'Last Name',
                    draft.lastName,
                    'text',
                )}
            </div>
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableField(
                'person-email',
                'email',
                'Email',
                draft.email,
                'email',
                iconMail(16, ''),
            )}
            ${buildEditableField(
                'person-phone',
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
                'person-title',
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
            ${buildEditableStatus(draft.status)}
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
            }" id="person-strengths">
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
            id="person-edit-btn"
            data-person-action="edit">
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
            id="person-cancel-btn"
            data-person-action="cancel">
            ${iconX(16, '')} Cancel
        </button>
        <button
            class="${
                'btn btn-primary gap-2'
            }"
            id="person-save-btn"
            data-person-action="save">
            ${iconSave(16, '')} Save
        </button>`;
}

function buildTeamDimensionsCard(
    person: Person,
): SafeHtml {
    return new WorkingStylesPresenter(
        person.parsedTeamDimensions(),
    ).buildCard();
}

export function buildPersonRolesSection(
    members: readonly Member[],
    userPrivateRole: Role | null,
    availableRoles: readonly Role[],
): SafeHtml {
    return html`
<section class="${
    'person-roles-card card p-4'
}">
    <h2 class="${
        'text-base font-semibold mb-3 flex'
        + ' items-center gap-2'
    }">
        ${iconShield(16, '')}
        Roles
    </h2>
    ${buildMembershipsList(
        members, userPrivateRole,
    )}
    ${buildAddToRoleSelect(availableRoles)}
</section>`;
}

function hasAnyRolesToShow(
    members: readonly Member[],
    userPrivateRole: Role | null,
): boolean {
    return members.length > 0
        || userPrivateRole !== null;
}

function buildMembershipsList(
    members: readonly Member[],
    userPrivateRole: Role | null,
): SafeHtml {
    if (!hasAnyRolesToShow(members, userPrivateRole)) {
        return html`<p class="${
            'text-sm text-muted mb-3'
        }">
            Not a member of any role yet.
        </p>`;
    }
    return html`<ul class="${
        'stack-sm mb-3'
    }">
        ${members.map(buildMembershipRow)}
        ${userPrivateRole === null
            ? html``
            : buildUserPrivateRow(
                userPrivateRole,
            )}
    </ul>`;
}

function buildMembershipRow(
    m: Member,
): SafeHtml {
    return html`<li class="${
        'flex items-center'
        + ' justify-between gap-2'
        + ' role-membership-row'
    }">
        <span class="${
            'inline-flex items-center'
            + ' gap-2'
        }">${m.role.nameText()}</span>
        <button class="${
            'btn btn-ghost btn-icon btn-xs'
        }"
            aria-label="${
                'Remove from '
                + m.role.nameText()
            }"
            data-role-action="remove"
            data-membership-id="${
                m.membershipId
            }">
            ${iconTrash(14, '')}
        </button>
    </li>`;
}

function buildUserPrivateRow(
    role: Role,
): SafeHtml {
    return html`<li class="${
        'flex items-center'
        + ' justify-between gap-2'
        + ' role-membership-row'
    }"
        data-role-private="user">
        <span class="${
            'inline-flex items-center'
            + ' gap-2'
        }">
            ${role.nameText()}
            <span class="${
                'text-xs text-muted'
            }">(your private role)</span>
        </span>
    </li>`;
}

function buildAddToRoleSelect(
    availableRoles: readonly Role[],
): SafeHtml {
    if (availableRoles.length === 0) {
        return html``;
    }
    return html`<div class="${
        'flex items-center gap-2'
    }">
        <select id="person-add-role-select"
            class="${
                'input input-narrow flex-1'
            }"
            aria-label="${
                'Add this person to a role'
            }">
            ${availableRoles.map(
                r => html`<option
                    value="${r.idForLink()}">
                    ${r.nameText()}
                </option>`,
            )}
        </select>
        <button class="${
            'btn btn-secondary btn-sm'
        }"
            data-role-action="add">
            Add
        </button>
    </div>`;
}

export class PersonDetailPresenter {
    readonly #person: Person;

    constructor(person: Person) {
        this.#person = person;
    }

    idForLink(): string {
        return this.#person.idForLink();
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
            '.person-breadcrumb-slot',
            buildBreadcrumb(
                this.#person.fullName(),
            ),
        );
        mutateSlot(
            container,
            '.person-title-slot',
            buildReadonlyTitleSection(
                this.#person,
            ),
        );
        mutateSlot(
            container,
            '.person-actions-slot',
            buildReadonlyActionButtons(),
        );
        mutateSlot(
            container,
            '.person-cards-slot',
            html`
                ${buildPersonalInfoCard(
                    buildReadonlyPersonalInfoBody(
                        this.#person,
                    ),
                )}
                ${buildTeamDimensionsCard(
                    this.#person,
                )}
                ${buildStrengthsCard(
                    buildSelectedStrengthChips(
                        this.#person
                            .parsedStrengths(),
                    ),
                )}`,
        );
    }
}

export class PersonDetailEditPresenter {
    readonly #person: Person;
    readonly #draft: PersonDraftFields;

    constructor(
        person: Person,
        draft: PersonDraftFields,
    ) {
        this.#person = person;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#person.idForLink();
    }

    draft(): PersonDraftFields {
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
            '.person-breadcrumb-slot',
            buildBreadcrumb(
                this.#person.fullName(),
            ),
        );
        mutateSlot(
            container,
            '.person-title-slot',
            buildEditableTitleSection(
                this.#person, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.person-actions-slot',
            buildEditableActionButtons(),
        );
        mutateSlot(
            container,
            '.person-cards-slot',
            html`
                ${buildPersonalInfoCard(
                    buildEditablePersonalInfoBody(
                        this.#person,
                        this.#draft,
                    ),
                )}
                ${buildTeamDimensionsCard(
                    this.#person,
                )}
                ${buildStrengthsCard(
                    buildEditableStrengthChips(
                        this.#draft.strengths,
                    ),
                )}`,
        );
    }
}
