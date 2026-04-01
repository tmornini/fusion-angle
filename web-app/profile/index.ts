import {
    $,
    populateIcons,
    attr,
} from '../app/dom';
import {
    ProfilePresenter,
} from '../app/presenters';
import {
    html,
    setHtml,
    SafeHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    iconMail,
    iconPhone,
    iconBriefcase,
    iconStar,
    iconSave,
    iconCheckCircle2,
    iconCamera,
    iconChevronRight,
} from '../app/icons';
import {
    buildErrorState,
} from '../app/loading-states';
import {
    getProfile, putProfile,
    allStrengths,
} from '../app/adapters';
import {
    jsonArrayField,
} from '../../api/types';

export async function init(): Promise<void> {
    const selectedStrengths = new Set<string>(
    );

    function buildStrengthChip(
        name: string,
    ): SafeHtml {
        const isActive =
            selectedStrengths.has(name);
        return html`<button class="${
            'strength-chip btn '
            + (isActive
                ? 'btn-primary'
                : 'btn-secondary')
            + ' btn-sm'
        }" data-strength="${name}">
    ${
        isActive
            ? html`${
                iconCheckCircle2(12, '')
            } `
            : html``
    }${name}
    </button>`;
    }

    const container = $('.page-content', document);
    if (!container) return;
    let profile: Awaited<
        ReturnType<typeof getProfile>
    >;
    try {
        profile = await getProfile();
    } catch {
        setHtml(
            container,
            buildErrorState(
                'Failed to load profile.',
                'Try Again',
            ),
        );
        container
            .querySelector(
                '[data-retry-btn]',
            )
            ?.addEventListener(
                'click',
                () => init(),
            );
        return;
    }

    const presenter =
        new ProfilePresenter(profile);
    presenter.initStrengths(
        selectedStrengths,
    );

    populateIcons([
        [
            '#profile-breadcrumb-separator',
            iconChevronRight(14, ''),
        ],
        [
            '#profile-save-btn-icon',
            iconSave(16, ''),
        ],
        [
            '#profile-avatar-btn',
            iconCamera(14, ''),
        ],
        [
            '#profile-email-label',
            html`${iconMail(16, '')} Email`,
        ],
        [
            '#profile-phone-label',
            html`${iconPhone(16, '')} Phone`,
        ],
        [
            '#profile-role-label',
            html`${
                iconBriefcase(16, '')
            } Role`,
        ],
        [
            '#profile-strengths-header',
            html`${
                iconStar(20, 'text-primary')
            } My Strengths`,
        ],
    ]);

    presenter.populateForm();
    const firstName = $(
        '#profile-first-name', document,
    )! as HTMLInputElement;
    const lastName = $(
        '#profile-last-name', document,
    )! as HTMLInputElement;
    const email = $(
        '#profile-email', document,
    )! as HTMLInputElement;
    const phone = $(
        '#profile-phone', document,
    )! as HTMLInputElement;
    const role = $(
        '#profile-role', document,
    )! as HTMLInputElement;
    const department = $(
        '#profile-department', document,
    )! as HTMLSelectElement;
    const bio = $(
        '#profile-bio', document,
    )! as HTMLTextAreaElement;
    const strengthsContainer = $(
        '#profile-strengths', document,
    );
    if (strengthsContainer) {
        setHtml(
            strengthsContainer,
            html`${allStrengths.map(
                buildStrengthChip,
            )}`,
        );
        strengthsContainer
            .querySelectorAll<HTMLElement>(
                '.strength-chip',
            )
            .forEach(chip => {
                chip.addEventListener(
                    'click',
                    () => {
                        const name = attr(
                            chip,
                            'data-strength',
                        );
                        if (
                            selectedStrengths
                                .has(name)
                        ) {
                            selectedStrengths
                                .delete(name);
                            chip.className =
                                'strength-chip'
                                + ' btn'
                                + ' btn-secondary'
                                + ' btn-sm';
                            chip.textContent =
                                name;
                        } else {
                            selectedStrengths
                                .add(name);
                            chip.className =
                                'strength-chip'
                                + ' btn'
                                + ' btn-primary'
                                + ' btn-sm';
                            setHtml(
                                chip,
                                html`${
                                    iconCheckCircle2(
                                        12, '',
                                    )
                                } ${name}`,
                            );
                        }
                    },
                );
            });
    }

    $(
        '#profile-save-btn', document,
    )?.addEventListener(
        'click',
        async () => {
            const btn = $(
                '#profile-save-btn',
                document,
            )!;
            btn.textContent = 'Saving...';
            btn.setAttribute(
                'disabled', '',
            );
            try {
                await putProfile({
                    first_name:
                        firstName.value,
                    last_name:
                        lastName.value,
                    email: email.value,
                    phone: phone.value,
                    role: role.value,
                    department:
                        department.value,
                    bio: bio.value,
                    strengths:
                        jsonArrayField(
                            [...selectedStrengths],
                        ),
                });
                setHtml(
                    btn,
                    html`${
                        iconCheckCircle2(
                            16, '',
                        )
                    } Saved!`,
                );
                showToast(
                    'Profile saved',
                    'success',
                );
                setTimeout(() => {
                    setHtml(
                        btn,
                        html`${
                            iconSave(16, '')
                        } Save Changes`,
                    );
                }, 2000);
            } catch {
                showToast(
                    'Failed to save'
                    + ' profile',
                    'error',
                );
            }
            btn.removeAttribute(
                'disabled',
            );
        },
    );
}
