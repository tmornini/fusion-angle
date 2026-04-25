import {
    $, $$, $input, $select, $textarea,
    attr, bindEnterToClick,
} from '../app/dom';
import {
    ProfilePresenter,
} from '../app/presenters';
import {
    html, setHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import { iconCheckCircle2 } from '../app/icons';
import {
    buildErrorState,
} from '../app/loading-states';
import { log } from '../app/logger';
import { trimStrings } from '../app/core';
import {
    getProfile,
    putProfile,
    type Profile,
} from '../app/adapters';

const escapeController =
    { current: new AbortController() };

let currentProfile: Profile | null = null;
let selectedStrengths: Set<string> =
    new Set();

function mutateProfilePage(
    profile: Profile,
    isEditing: boolean,
): void {
    currentProfile = profile;
    selectedStrengths =
        new Set(profile.strengths);
    const container = $(
        '#profile-content', document,
    );
    if (!container) return;
    const presenter =
        new ProfilePresenter(profile);
    setHtml(
        container,
        presenter.buildPage(
            isEditing,
            selectedStrengths,
        ),
    );
    bindProfileEvents(profile, isEditing);
}

function bindProfileEvents(
    profile: Profile,
    isEditing: boolean,
): void {
    escapeController.current.abort();
    escapeController.current =
        new AbortController();
    if (isEditing) {
        document.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    $(
                        '#profile-cancel-btn',
                        document,
                    )?.click();
                }
            },
            {
                signal: escapeController
                    .current.signal,
            },
        );
        bindStrengthChips();
        bindEditFieldEnter();
    }
    $('#profile-edit-btn', document)
        ?.addEventListener(
            'click',
            () => mutateProfilePage(
                profile, true,
            ),
        );
    $('#profile-cancel-btn', document)
        ?.addEventListener(
            'click',
            () => mutateProfilePage(
                profile, false,
            ),
        );
    $('#profile-save-btn', document)
        ?.addEventListener(
            'click',
            handleSave,
        );
}

function bindStrengthChips(): void {
    $$('.strength-chip', document)
        .forEach(chip => {
            chip.addEventListener(
                'click',
                () => toggleChip(chip),
            );
        });
}

function toggleChip(
    chip: HTMLElement,
): void {
    const name =
        attr(chip, 'data-strength');
    if (selectedStrengths.has(name)) {
        selectedStrengths.delete(name);
        chip.className =
            'strength-chip btn'
            + ' btn-secondary btn-sm';
        chip.textContent = name;
    } else {
        selectedStrengths.add(name);
        chip.className =
            'strength-chip btn'
            + ' btn-primary btn-sm';
        setHtml(
            chip,
            html`${
                iconCheckCircle2(12, '')
            } ${name}`,
        );
    }
}

function bindEditFieldEnter(): void {
    const saveSel = '#profile-save-btn';
    bindEnterToClick(
        '#profile-first-name', saveSel,
    );
    bindEnterToClick(
        '#profile-last-name', saveSel,
    );
    bindEnterToClick(
        '#profile-email', saveSel,
    );
    bindEnterToClick(
        '#profile-phone', saveSel,
    );
    bindEnterToClick(
        '#profile-role', saveSel,
    );
}

async function handleSave(): Promise<void> {
    if (!currentProfile) return;
    const updated = readFormValues(
        currentProfile,
    );
    try {
        await putProfile(updated);
    } catch (err) {
        log.error(
            'putProfile failed',
            'profile',
            err,
        );
        showToast(
            'Failed to save profile',
            'error',
        );
        return;
    }
    showToast('Profile saved', 'success');
    mutateProfilePage(updated, false);
}

function readFormValues(
    profile: Profile,
): Profile {
    return trimStrings({
        firstName: $input(
            '#profile-first-name', document,
        )!.value,
        lastName: $input(
            '#profile-last-name', document,
        )!.value,
        email: $input(
            '#profile-email', document,
        )!.value,
        phone: $input(
            '#profile-phone', document,
        )!.value,
        role: $input(
            '#profile-role', document,
        )!.value,
        department: $select(
            '#profile-department', document,
        )!.value,
        bio: $textarea(
            '#profile-bio', document,
        )!.value,
        strengths: [...selectedStrengths],
        teamDimensions:
            profile.teamDimensions,
    });
}

export async function init(): Promise<void> {
    const container = $(
        '#profile-content', document,
    );
    if (!container) return;
    let profile: Profile;
    try {
        profile = await getProfile();
    } catch (err) {
        log.error(
            'getProfile failed',
            'profile',
            err,
        );
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
    mutateProfilePage(profile, false);
}
