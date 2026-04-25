import {
    html, setHtml, SafeHtml,
} from '../safe-html';
import { $ } from '../dom';
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
import type { EditMode } from './edit-mode';

const DEPARTMENTS = [
    'Product',
    'Engineering',
    'Design',
    'Sales',
];

export type ProfileFieldKey =
    | 'firstName' | 'lastName' | 'email'
    | 'phone' | 'role' | 'department'
    | 'bio';

export class ProfilePresenter {
    #profile: Profile;
    #mode: EditMode<Profile>
        = { kind: 'reading' };

    constructor(profile: Profile) {
        this.#profile = profile;
    }

    update(profile: Profile): void {
        this.#profile = profile;
        this.#mode = { kind: 'reading' };
    }

    beginEdit(): void {
        this.#mode = {
            kind: 'editing',
            draft: {
                ...this.#profile,
                strengths: [
                    ...this.#profile.strengths,
                ],
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
        field: ProfileFieldKey,
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

    toggleStrength(name: string): void {
        if (this.#mode.kind !== 'editing') {
            throw new Error(
                'toggleStrength requires'
                + ' editing mode',
            );
        }
        const strengths
            = this.#mode.draft.strengths;
        const i = strengths.indexOf(name);
        if (i >= 0) {
            strengths.splice(i, 1);
        } else {
            strengths.push(name);
        }
    }

    draft(): Profile {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft
            : this.#profile;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        setHtml(container, html`
<div class="idea-detail-wrap">
    <div class="profile-header-slot"></div>
    <div class="profile-info-slot"></div>
    <div class="profile-styles-slot"></div>
    <div class="profile-strengths-slot"></div>
</div>`);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        this.#updateHeader(container);
        this.#updateInfo(container);
        this.#updateStyles(container);
        this.#updateStrengths(container);
    }

    #updateHeader(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.profile-header-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildHeader());
    }

    #updateInfo(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.profile-info-slot', container,
        );
        if (!slot) return;
        setHtml(
            slot,
            this.#buildPersonalInfoCard(),
        );
    }

    #updateStyles(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.profile-styles-slot', container,
        );
        if (!slot) return;
        setHtml(
            slot,
            this.#buildWorkingStylesCard(),
        );
    }

    #updateStrengths(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.profile-strengths-slot',
            container,
        );
        if (!slot) return;
        setHtml(
            slot, this.#buildStrengthsCard(),
        );
    }

    #avatarInitials(): string {
        const p = this.draft();
        return p.firstName.charAt(0)
            + p.lastName.charAt(0);
    }

    #buildHeader(): SafeHtml {
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
            ${this.#buildHeaderButtons()}
        </div>`;
    }

    #buildHeaderButtons(): SafeHtml {
        if (this.isEditing()) {
            return html`
            <div class="flex gap-2">
                <button class="${
                    'btn btn-outline gap-2'
                }" id="profile-cancel-btn"
                    data-profile-action="cancel">
                    ${iconX(16, '')} Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="profile-save-btn"
                    data-profile-action="save">
                    ${iconSave(16, '')} Save
                </button>
            </div>`;
        }
        return html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="profile-edit-btn"
                data-profile-action="edit">
                ${iconEdit(16, '')} Edit
            </button>`;
    }

    #buildPersonalInfoCard(): SafeHtml {
        const p = this.draft();
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
                ${this.#buildAvatar()}
                ${this.#buildNameFields()}
            </div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">
                ${this.#buildField(
                    'profile-email',
                    'email',
                    html`${
                        iconMail(16, '')
                    } Email`,
                    p.email,
                    'email',
                )}
                ${this.#buildField(
                    'profile-phone',
                    'phone',
                    html`${
                        iconPhone(16, '')
                    } Phone`,
                    p.phone,
                    'text',
                )}
            </div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">
                ${this.#buildField(
                    'profile-role',
                    'role',
                    html`${
                        iconBriefcase(16, '')
                    } Role`,
                    p.role,
                    'text',
                )}
                ${this.#buildDepartmentField()}
            </div>
            ${this.#buildBioField()}
        </div>`;
    }

    #buildAvatar(): SafeHtml {
        return html`
            <div class="profile-avatar-wrap">
                <div class="profile-avatar">
                    <span class="${
                        'text-3xl font-bold'
                        + ' text-primary'
                    }">${
                        this.#avatarInitials()
                    }</span>
                </div>
                ${this.isEditing()
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

    #buildNameFields(): SafeHtml {
        const p = this.draft();
        return html`
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${this.#buildField(
                    'profile-first-name',
                    'firstName',
                    html`First Name`,
                    p.firstName,
                    'text',
                )}
                ${this.#buildField(
                    'profile-last-name',
                    'lastName',
                    html`Last Name`,
                    p.lastName,
                    'text',
                )}
            </div>`;
    }

    #buildField(
        id: string,
        field: ProfileFieldKey,
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
                ${this.isEditing()
                    ? html`<input
                        class="input"
                        id="${id}"
                        type="${inputType}"
                        data-profile-field="${
                            field
                        }"
                        value="${value}" />`
                    : html`<p class="${
                        'text-sm'
                    }">${value}</p>`}
            </div>`;
    }

    #buildDepartmentField(): SafeHtml {
        const p = this.draft();
        return html`
            <div>
                <label class="${
                    'label mb-2 block'
                }" for="profile-department"
                >Department</label>
                ${this.isEditing()
                    ? html`<select
                        class="input"
                        id="profile-department"
                        data-profile-field="${
                            'department'
                        }"
                    >${DEPARTMENTS.map(d =>
                        html`<option
                            value="${d}"
                            ${p.department === d
                                ? 'selected'
                                : ''}
                        >${d}</option>`)
                    }</select>`
                    : html`<p class="${
                        'text-sm'
                    }">${p.department}</p>`}
            </div>`;
    }

    #buildBioField(): SafeHtml {
        const p = this.draft();
        return html`
            <div>
                <label class="${
                    'label mb-2 block'
                }" for="profile-bio">Bio</label>
                ${this.isEditing()
                    ? html`<textarea
                        class="textarea"
                        rows="3"
                        id="profile-bio"
                        data-profile-field="${
                            'bio'
                        }"
                    >${p.bio}</textarea>`
                    : html`<p class="${
                        'text-sm'
                    }">${p.bio}</p>`}
            </div>`;
    }

    #buildWorkingStylesCard(): SafeHtml {
        return new WorkingStylesPresenter(
            this.#profile.teamDimensions,
        ).buildCard();
    }

    #buildStrengthsCard(): SafeHtml {
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
                ${this.#buildStrengthChips()}
            </div>
        </div>`;
    }

    #buildStrengthChips(): SafeHtml {
        const p = this.draft();
        const draftSet = new Set(p.strengths);
        if (!this.isEditing()) {
            const selected = allStrengths
                .filter(s => draftSet.has(s));
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
                name, draftSet.has(name),
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
