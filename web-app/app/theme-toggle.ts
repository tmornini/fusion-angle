import {
    getThemeIcon,
    isValidTheme,
    persistThemePreference,
} from './state.ts';
import { $, $$ } from './dom.ts';
import { setHtml } from './safe-html.ts';
import { showToast } from './toast.ts';
import { log } from './logger.ts';

const THEME_TOGGLE_IDS = [
    'theme-toggle',
    'mobile-theme-toggle',
] as const;

export function mutateThemeToggleIcon(
): void {
    const themeIcon = getThemeIcon(20, '');
    const themeLabel = 'Toggle theme';
    THEME_TOGGLE_IDS.forEach(id => {
        const button =
            $(`#${id}`, document);
        if (button) {
            setHtml(button, themeIcon);
            button.setAttribute(
                'aria-label',
                themeLabel,
            );
        }
    });
}

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
                    if (
                        isValidTheme(theme)
                    ) {
                        // persistThemePreference
                        // applies theme to memory
                        // and DOM BEFORE writing,
                        // so the icon must update
                        // on every branch — the
                        // live state is the new
                        // theme even when persist
                        // throws.
                        let persisted: boolean;
                        try {
                            persisted =
                                persistThemePreference(
                                    theme,
                                );
                        } catch (e) {
                            log.warn(
                                'persistThemePreference'
                                    + ' failed',
                                'theme-toggle',
                                e,
                            );
                            showToast(
                                'Theme applied,'
                                + ' but could not'
                                + ' be saved.'
                                + ' It will reset'
                                + ' on next load.',
                                'error',
                            );
                            mutateThemeToggleIcon();
                            return;
                        }
                        if (!persisted) {
                            showToast(
                                'Theme applied,'
                                + ' but could not'
                                + ' be saved.'
                                + ' It will reset'
                                + ' on next load.',
                                'warning',
                            );
                        }
                        mutateThemeToggleIcon();
                        $$(
                            '.dropdown-content',
                            document,
                        ).forEach(
                            dropdown =>
                                dropdown
                                    .classList
                                    .add(
                                        'hidden',
                                    ),
                        );
                    }
                },
            );
        },
    );
}
