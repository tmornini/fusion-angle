import {
    persistThemePreference,
    mutateThemeToggleIcon,
} from './state.ts';
import {
    isStoredTheme,
    type StoredTheme,
} from './adapters/preferences.ts';
import { $, $$ } from './dom.ts';
import { showToast } from './toast.ts';
import { log } from './logger.ts';

export { mutateThemeToggleIcon };

export function initDropdown(
    toggleId: string,
    contentId: string,
): void {
    const toggle =
        $(`#${toggleId}`, document);
    const content =
        $(`#${contentId}`, document);
    if (!toggle || !content) return;

    toggle.addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            $$(
                '.dropdown-content',
                document,
            ).forEach(
                dropdown => {
                    if (
                        dropdown.id
                            !== contentId
                    )
                        dropdown
                            .classList
                            .add('hidden');
                },
            );
            content.classList.toggle(
                'hidden',
            );
        },
    );

    document.addEventListener(
        'click',
        (e) => {
            if (
                e.target instanceof Node
                && !content.contains(
                    e.target,
                )
                && !toggle.contains(
                    e.target,
                )
            ) {
                content.classList.add(
                    'hidden',
                );
            }
        },
    );
}

const THEME_NOT_SAVED_MESSAGE =
    'Theme applied, but could not be saved.'
    + ' It will reset on next load.';

// persistThemePreference applies theme to memory and DOM
// BEFORE writing, so the icon must update on every branch
// — the live state is the new theme even when persist
// throws. The dropdown stays open on a thrown persist so
// the failure toast reads in place.
function applyAndPersistTheme(
    theme: StoredTheme,
): void {
    let persisted: boolean;
    try {
        persisted =
            persistThemePreference(theme);
    } catch (e) {
        log.warn(
            'persistThemePreference failed',
            'theme-toggle',
            e,
        );
        showToast(
            THEME_NOT_SAVED_MESSAGE, 'error',
        );
        mutateThemeToggleIcon();
        return;
    }
    if (!persisted) {
        showToast(
            THEME_NOT_SAVED_MESSAGE, 'warning',
        );
    }
    mutateThemeToggleIcon();
    closeAllDropdowns();
}

function closeAllDropdowns(): void {
    $$(
        '.dropdown-content', document,
    ).forEach(
        dropdown =>
            dropdown.classList.add('hidden'),
    );
}

export function initThemeAndDropdowns(
): void {
    for (const prefix of
        ['', 'mobile-'] as const
    ) {
        initDropdown(
            `${prefix}theme-toggle`,
            `${prefix}theme-dropdown`,
        );
    }

    $$(
        '[data-theme-set]', document,
    ).forEach(
        themeButton => {
            themeButton.addEventListener(
                'click',
                () => {
                    const theme =
                        themeButton
                            .getAttribute(
                                'data-theme-set',
                            );
                    if (isStoredTheme(theme)) {
                        applyAndPersistTheme(
                            theme,
                        );
                    }
                },
            );
        },
    );
}
