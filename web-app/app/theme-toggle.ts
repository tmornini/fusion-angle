import {
    getThemeIcon,
    isValidTheme,
    persistThemePreference,
} from './state';
import { $, $$ } from './dom';
import { mutateHtml } from './safe-html';
import { showToast } from './toast';
import { log } from './logger';

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
            mutateHtml(button, themeIcon);
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
                        try {
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
                                'Failed to'
                                + ' save theme'
                                + ' preference.',
                                'error',
                            );
                            return;
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
