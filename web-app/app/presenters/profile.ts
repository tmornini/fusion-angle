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

function buildShell(
    container: HTMLElement,
): void {
    setHtml(container, html`
<div class="idea-detail-wrap">
    <div class="profile-header-slot"></div>
    <div class="profile-info-slot"></div>
    <div class="profile-styles-slot"></div>
    <div class="profile-strengths-slot"></div>
</div>`);
}

function setSlot(
    container: HTMLElement,
    cls: string,
    markup: SafeHtml,
): void {
    const slot = $(cls, container);
    if (!slot) return;
    setHtml(slot, markup);
}

function buildHeader(
    buttons: SafeHtml,
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
            ${buttons}
        </div>`;
}

function buildAvatar(
    profile: Profile,
    showCameraButton: boolean,
): SafeHtml {
    const initials =
        profile.firstName.charAt(0)
        + profile.lastName.charAt(0);
    return html`
        <div class="profile-avatar-wrap">
            <div class="profile-avatar">
                <span class="${
                    'text-3xl font-bold'
                    + ' text-primary'
                }">${initials}</span>
            </div>
            ${showCameraButton
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

function buildInfoCard(
    nameFields: SafeHtml,
    avatar: SafeHtml,
    secondRow: SafeHtml,
    thirdRow: SafeHtml,
    bio: SafeHtml,
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
                ${avatar}
                ${nameFields}
            </div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">${secondRow}</div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">${thirdRow}</div>
            ${bio}
        </div>`;
}

function buildReadonlyField(
    id: string,
    label: SafeHtml,
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }" for="${id}">${label}</label>
            <p class="text-sm">${value}</p>
        </div>`;
}

function buildEditableField(
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
            <input class="input"
                id="${id}"
                type="${inputType}"
                data-profile-field="${field}"
                value="${value}" />
        </div>`;
}

function buildReadonlyDepartment(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="profile-department"
            >Department</label>
            <p class="text-sm">${value}</p>
        </div>`;
}

function buildEditableDepartment(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="profile-department"
            >Department</label>
            <select class="input"
                id="profile-department"
                data-profile-field="department"
            >${DEPARTMENTS.map(d =>
                html`<option
                    value="${d}"
                    ${value === d
                        ? 'selected'
                        : ''}
                >${d}</option>`)
            }</select>
        </div>`;
}

function buildReadonlyBio(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="profile-bio">Bio</label>
            <p class="text-sm">${value}</p>
        </div>`;
}

function buildEditableBio(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="profile-bio">Bio</label>
            <textarea class="textarea"
                rows="3"
                id="profile-bio"
                data-profile-field="bio"
            >${value}</textarea>
        </div>`;
}

function buildStrengthsCard(
    chips: SafeHtml,
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
                ${chips}
            </div>
        </div>`;
}

function buildSelectedStrengthChips(
    strengths: readonly string[],
): SafeHtml {
    const draftSet = new Set(strengths);
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

function buildEditableStrengthChips(
    strengths: readonly string[],
): SafeHtml {
    const draftSet = new Set(strengths);
    return html`${allStrengths.map(name => {
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

export class ProfilePresenter {
    readonly #profile: Profile;

    constructor(profile: Profile) {
        this.#profile = profile;
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
        setSlot(
            container,
            '.profile-header-slot',
            this.#buildHeader(),
        );
        setSlot(
            container,
            '.profile-info-slot',
            this.#buildPersonalInfoCard(),
        );
        setSlot(
            container,
            '.profile-styles-slot',
            this.#buildWorkingStylesCard(),
        );
        setSlot(
            container,
            '.profile-strengths-slot',
            this.#buildStrengthsCard(),
        );
    }

    #buildHeader(): SafeHtml {
        return buildHeader(html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="profile-edit-btn"
                data-profile-action="edit">
                ${iconEdit(16, '')} Edit
            </button>`);
    }

    #buildPersonalInfoCard(): SafeHtml {
        const p = this.#profile;
        const nameFields = html`
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${buildReadonlyField(
                    'profile-first-name',
                    html`First Name`,
                    p.firstName,
                )}
                ${buildReadonlyField(
                    'profile-last-name',
                    html`Last Name`,
                    p.lastName,
                )}
            </div>`;
        return buildInfoCard(
            nameFields,
            buildAvatar(p, false),
            html`
                ${buildReadonlyField(
                    'profile-email',
                    html`${
                        iconMail(16, '')
                    } Email`,
                    p.email,
                )}
                ${buildReadonlyField(
                    'profile-phone',
                    html`${
                        iconPhone(16, '')
                    } Phone`,
                    p.phone,
                )}`,
            html`
                ${buildReadonlyField(
                    'profile-role',
                    html`${
                        iconBriefcase(16, '')
                    } Role`,
                    p.role,
                )}
                ${buildReadonlyDepartment(
                    p.department,
                )}`,
            buildReadonlyBio(p.bio),
        );
    }

    #buildWorkingStylesCard(): SafeHtml {
        return new WorkingStylesPresenter(
            this.#profile.teamDimensions,
        ).buildCard();
    }

    #buildStrengthsCard(): SafeHtml {
        return buildStrengthsCard(
            buildSelectedStrengthChips(
                this.#profile.strengths,
            ),
        );
    }
}

export class ProfileEditPresenter {
    readonly #profile: Profile;
    readonly #draft: Profile;

    constructor(
        profile: Profile,
        draft: Profile,
    ) {
        this.#profile = profile;
        this.#draft = draft;
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
        setSlot(
            container,
            '.profile-header-slot',
            this.#buildHeader(),
        );
        setSlot(
            container,
            '.profile-info-slot',
            this.#buildPersonalInfoCard(),
        );
        setSlot(
            container,
            '.profile-styles-slot',
            this.#buildWorkingStylesCard(),
        );
        setSlot(
            container,
            '.profile-strengths-slot',
            this.#buildStrengthsCard(),
        );
    }

    #buildHeader(): SafeHtml {
        return buildHeader(html`
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
            </div>`);
    }

    #buildPersonalInfoCard(): SafeHtml {
        const d = this.#draft;
        const nameFields = html`
            <div class="${
                'grid grid-cols-2 gap-4 flex-1'
            }">
                ${buildEditableField(
                    'profile-first-name',
                    'firstName',
                    html`First Name`,
                    d.firstName,
                    'text',
                )}
                ${buildEditableField(
                    'profile-last-name',
                    'lastName',
                    html`Last Name`,
                    d.lastName,
                    'text',
                )}
            </div>`;
        return buildInfoCard(
            nameFields,
            buildAvatar(d, true),
            html`
                ${buildEditableField(
                    'profile-email',
                    'email',
                    html`${
                        iconMail(16, '')
                    } Email`,
                    d.email,
                    'email',
                )}
                ${buildEditableField(
                    'profile-phone',
                    'phone',
                    html`${
                        iconPhone(16, '')
                    } Phone`,
                    d.phone,
                    'text',
                )}`,
            html`
                ${buildEditableField(
                    'profile-role',
                    'role',
                    html`${
                        iconBriefcase(16, '')
                    } Role`,
                    d.role,
                    'text',
                )}
                ${buildEditableDepartment(
                    d.department,
                )}`,
            buildEditableBio(d.bio),
        );
    }

    #buildWorkingStylesCard(): SafeHtml {
        return new WorkingStylesPresenter(
            this.#profile.teamDimensions,
        ).buildCard();
    }

    #buildStrengthsCard(): SafeHtml {
        return buildStrengthsCard(
            buildEditableStrengthChips(
                this.#draft.strengths,
            ),
        );
    }
}
