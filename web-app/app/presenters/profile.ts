import { html, SafeHtml } from '../safe-html';
import {
    iconMail,
    iconPhone,
    iconBriefcase,
    iconStar,
    iconSave,
    iconCheckCircle2,
    iconCamera,
    iconEdit,
    iconX,
} from '../icons';
import type { Profile } from '../adapters';
import { allStrengths } from '../adapters';
import {
    WorkingStylesPresenter,
} from './working-styles';

const DEPARTMENTS = [
    'Product',
    'Engineering',
    'Design',
    'Sales',
];

export class ProfilePresenter {
    readonly #profile: Profile;

    constructor(profile: Profile) {
        this.#profile = profile;
    }

    avatarInitials(): string {
        return this.#profile
            .firstName.charAt(0)
            + this.#profile
                .lastName.charAt(0);
    }

    initialStrengths(): Set<string> {
        return new Set(
            this.#profile.strengths,
        );
    }

    buildPage(
        isEditing: boolean,
        selectedStrengths: Set<string>,
    ): SafeHtml {
        return html`
    <div class="idea-detail-wrap">
        ${this.#buildHeader(isEditing)}
        ${this.#buildPersonalInfoCard(
            isEditing,
        )}
        ${this.#buildWorkingStylesCard()}
        ${this.#buildStrengthsCard(
            isEditing,
            selectedStrengths,
        )}
    </div>`;
    }

    #buildHeader(
        isEditing: boolean,
    ): SafeHtml {
        return html`
        <div class="page-header">
            <div>
                <h1 class="page-title">
                    Profile
                </h1>
                <p class="${
                    'text-sm text-muted'
                }">
                    Update your personal
                    information and
                    preferences
                </p>
            </div>
            ${this.#buildHeaderButtons(
                isEditing,
            )}
        </div>`;
    }

    #buildHeaderButtons(
        isEditing: boolean,
    ): SafeHtml {
        if (isEditing) {
            return html`
            <div class="flex gap-2">
                <button class="${
                    'btn btn-outline gap-2'
                }" id="profile-cancel-btn">
                    ${iconX(16, '')} Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="profile-save-btn">
                    ${iconSave(16, '')} Save
                </button>
            </div>`;
        }
        return html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="profile-edit-btn">
                ${iconEdit(16, '')} Edit
            </button>`;
    }

    #buildPersonalInfoCard(
        isEditing: boolean,
    ): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-6 mb-6'
        }">
            <h3 class="${
                'font-display'
                + ' font-semibold mb-4'
            }">Personal Information</h3>
            <div class="${
                'flex items-start gap-6 mb-6'
            }">
                ${this.#buildAvatar(
                    isEditing,
                )}
                ${this.#buildNameFields(
                    isEditing,
                )}
            </div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">
                ${this.#buildField(
                    isEditing,
                    'profile-email',
                    html`${
                        iconMail(16, '')
                    } Email`,
                    this.#profile.email,
                    'email',
                )}
                ${this.#buildField(
                    isEditing,
                    'profile-phone',
                    html`${
                        iconPhone(16, '')
                    } Phone`,
                    this.#profile.phone,
                    'text',
                )}
            </div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">
                ${this.#buildField(
                    isEditing,
                    'profile-role',
                    html`${
                        iconBriefcase(16, '')
                    } Role`,
                    this.#profile.role,
                    'text',
                )}
                ${this.#buildDepartmentField(
                    isEditing,
                )}
            </div>
            ${this.#buildBioField(isEditing)}
        </div>`;
    }

    #buildAvatar(
        isEditing: boolean,
    ): SafeHtml {
        return html`
            <div class="profile-avatar-wrap">
                <div class="profile-avatar">
                    <span class="${
                        'text-3xl font-bold'
                        + ' text-primary'
                    }">${
                        this.avatarInitials()
                    }</span>
                </div>
                ${isEditing
                    ? html`<button class="${
                        'profile-avatar-btn'
                    }"
                        id="profile-avatar-btn"
                        aria-label="${
                            'Change avatar'
                        }">${
                            iconCamera(14, '')
                        }</button>`
                    : html``}
            </div>`;
    }

    #buildNameFields(
        isEditing: boolean,
    ): SafeHtml {
        return html`
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${this.#buildField(
                    isEditing,
                    'profile-first-name',
                    html`First Name`,
                    this.#profile.firstName,
                    'text',
                )}
                ${this.#buildField(
                    isEditing,
                    'profile-last-name',
                    html`Last Name`,
                    this.#profile.lastName,
                    'text',
                )}
            </div>`;
    }

    #buildField(
        isEditing: boolean,
        id: string,
        label: SafeHtml,
        value: string,
        inputType: string,
    ): SafeHtml {
        return html`
            <div>
                <label class="${
                    'label mb-2 flex'
                    + ' items-center gap-2'
                }" for="${id}">${label}</label>
                ${isEditing
                    ? html`<input
                        class="input"
                        id="${id}"
                        type="${inputType}"
                        value="${value}" />`
                    : html`<p class="${
                        'text-sm'
                    }">${value}</p>`}
            </div>`;
    }

    #buildDepartmentField(
        isEditing: boolean,
    ): SafeHtml {
        return html`
            <div>
                <label class="${
                    'label mb-2 block'
                }" for="profile-department"
                >Department</label>
                ${isEditing
                    ? html`<select
                        class="input"
                        id="profile-department"
                    >${DEPARTMENTS.map(d =>
                        html`<option
                            value="${d}"
                            ${this.#profile
                                .department === d
                                    ? 'selected'
                                    : ''}
                        >${d}</option>`)
                    }</select>`
                    : html`<p class="${
                        'text-sm'
                    }">${
                        this.#profile.department
                    }</p>`}
            </div>`;
    }

    #buildBioField(
        isEditing: boolean,
    ): SafeHtml {
        return html`
            <div>
                <label class="${
                    'label mb-2 block'
                }" for="profile-bio">Bio</label>
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        rows="3"
                        id="profile-bio"
                    >${
                        this.#profile.bio
                    }</textarea>`
                    : html`<p class="${
                        'text-sm'
                    }">${
                        this.#profile.bio
                    }</p>`}
            </div>`;
    }

    #buildWorkingStylesCard(): SafeHtml {
        return new WorkingStylesPresenter(
            this.#profile.teamDimensions,
        ).buildCard();
    }

    #buildStrengthsCard(
        isEditing: boolean,
        selectedStrengths: Set<string>,
    ): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-6 mb-6'
        }">
            <h3 class="${
                'font-display font-semibold'
                + ' mb-4 flex items-center gap-2'
            }">${
                iconStar(20, 'text-primary')
            } My Strengths</h3>
            <div class="${
                'flex flex-wrap gap-2'
            }" id="profile-strengths">
                ${this.#buildStrengthChips(
                    isEditing,
                    selectedStrengths,
                )}
            </div>
        </div>`;
    }

    #buildStrengthChips(
        isEditing: boolean,
        selectedStrengths: Set<string>,
    ): SafeHtml {
        if (!isEditing) {
            const selected = allStrengths
                .filter(
                    s => selectedStrengths
                        .has(s),
                );
            return html`${selected.map(
                name => html`<span class="${
                    'pill-tag'
                    + ' pill-tag-strength'
                }">${
                    iconStar(10, '')
                } ${name}</span>`,
            )}`;
        }
        return html`${allStrengths.map(
            name => this.#buildEditableChip(
                name,
                selectedStrengths.has(name),
            ),
        )}`;
    }

    #buildEditableChip(
        name: string,
        isActive: boolean,
    ): SafeHtml {
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
    }
}
