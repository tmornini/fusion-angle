import type { AppState } from './state';
import {
    STORAGE_KEY_SIDEBAR,
    state,
    setState,
    setTheme,
    isValidTheme,
} from './state';
import {
    $, $$, FOCUSABLE_SELECTOR,
} from './dom';
import { setHtml } from './safe-html';
import {
    iconSun,
    iconMoon,
    iconMonitor,
} from './icons';
import {
    getPageName,
    navigateTo,
} from './navigation';
import { log } from './logger';
import { showToast } from './toast';

const THEME_TOGGLE_IDS = [
    'theme-toggle',
    'mobile-theme-toggle',
] as const;

const SIDEBAR_USER_NAME_IDS = [
    'sidebar-user-name',
    'mobile-sidebar-user-name',
] as const;

const SIDEBAR_USER_COMPANY_IDS = [
    'sidebar-user-company',
    'mobile-sidebar-user-company',
] as const;

function mutateThemeToggleIcon(): void {
    const themeIcon =
        state.theme === 'dark'
            ? iconMoon(20, '')
            : state.theme === 'light'
                ? iconSun(20, '')
                : iconMonitor(20, '');
    const themeLabel =
        state.theme === 'dark'
            ? 'Switch to light theme'
            : state.theme === 'light'
                ? 'Switch to dark theme'
                : 'Toggle theme';
    THEME_TOGGLE_IDS.forEach(id => {
        const button = $(`#${id}`, document);
        if (button) {
            setHtml(button, themeIcon);
            button.setAttribute(
                'aria-label',
                themeLabel,
            );
        }
    });
}

async function mutateSidebarUser(
): Promise<void> {
    try {
        const { getCurrentUser } =
            await import('./adapters');
        const user =
            await getCurrentUser();
        for (const id of
            SIDEBAR_USER_NAME_IDS
        ) {
            const el = $(`#${id}`, document);
            if (el)
                el.textContent = user.name;
        }
        for (const id of
            SIDEBAR_USER_COMPANY_IDS
        ) {
            const el = $(`#${id}`, document);
            if (el)
                el.textContent = user.company;
        }
    } catch (err) {
        log.debug(
            'Sidebar user info load failed',
            'layout',
            err,
        );
    }
}

const NAV_GROUP_CHILDREN:
    Record<string, string[]> = {
        account: [
            'profile',
            'settings',
            'users',
            'activity-feed',
        ],
        ideas: [
            'idea-create',
            'idea-convert',
            'idea-review-queue',
            'approval-detail',
        ],
        projects: [
            'project-detail',
            'engineering-requirements',
        ],
        edges: ['edge-detail'],
    };

function initActiveNavItem(): void {
    const pageName = getPageName();
    $$('[data-page-link]', document).forEach(
        navLink => {
            const linkPage =
                navLink.getAttribute(
                    'data-page-link',
                ) || '';
            const isActive =
                linkPage === pageName
                || (NAV_GROUP_CHILDREN[
                    linkPage
                ]?.includes(pageName)
                    ?? false);
            if (isActive)
                navLink.setAttribute(
                    'aria-current',
                    'page',
                );
            else
                navLink.removeAttribute(
                    'aria-current',
                );
        },
    );
}

function initSidebar(): void {
    const sidebar =
        $('#desktop-sidebar', document);
    const mainContent =
        $('.main-content', document);

    if (
        localStorage.getItem(
            STORAGE_KEY_SIDEBAR,
        ) === 'true'
    ) {
        sidebar?.classList.add(
            'sidebar-collapsed',
        );
        mainContent?.classList.add(
            'sidebar-collapsed',
        );
        setState({
            isSidebarCollapsed: true,
        });
    }

    function setSidebarCollapsed(
        collapsed: boolean,
    ): void {
        const action = collapsed
            ? 'add' : 'remove';
        sidebar?.classList[action](
            'sidebar-collapsed',
        );
        mainContent?.classList[action](
            'sidebar-collapsed',
        );
        setState({
            isSidebarCollapsed: collapsed,
        });
        try {
            localStorage.setItem(
                STORAGE_KEY_SIDEBAR,
                String(collapsed),
            );
        } catch {
            showToast(
                'Failed to save'
                + ' sidebar state.',
                'error',
            );
        }
    }

    $('#sidebar-collapse', document)?.addEventListener(
        'click',
        () => setSidebarCollapsed(true),
    );
    $('#sidebar-expand', document)?.addEventListener(
        'click',
        () => setSidebarCollapsed(false),
    );

    $$('[data-section]', document).forEach(btn => {
        btn.addEventListener(
            'click',
            () => {
                const label =
                    btn.getAttribute(
                        'data-section',
                    );
                const items = $(
                    `[data-section-items=`
                    + `"${label}"]`, document,
                );
                if (items) {
                    const isCollapsed =
                        items.style.display
                            === 'none';
                    items.style.display =
                        isCollapsed
                            ? '' : 'none';
                    btn.setAttribute(
                        'aria-expanded',
                        String(isCollapsed),
                    );
                    const chevron =
                        btn.querySelector(
                            'svg',
                        );
                    if (chevron)
                        chevron
                            .style
                            .transform =
                                isCollapsed
                                    ? ''
                                    : 'rotate('
                                    + '-90deg)';
                }
            },
        );
    });
}

function initDropdown(
    toggleId: string,
    contentId: string,
): void {
    const toggle = $(`#${toggleId}`, document);
    const content = $(`#${contentId}`, document);
    if (!toggle || !content) return;

    toggle.addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            $$('.dropdown-content', document).forEach(
                dropdown => {
                    if (
                        dropdown.id
                            !== contentId
                    )
                        dropdown.classList.add(
                            'hidden',
                        );
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

function initThemeAndDropdowns(): void {
    for (const prefix of
        ['', 'mobile-'] as const
    ) {
        initDropdown(
            `${prefix}theme-toggle`,
            `${prefix}theme-dropdown`,
        );
    }

    $$('[data-theme-set]', document).forEach(
        themeButton => {
            themeButton.addEventListener(
                'click',
                () => {
                    const theme =
                        themeButton
                            .getAttribute(
                                'data-theme-set',
                            );
                    if (isValidTheme(theme)) {
                        setTheme(theme);
                        mutateThemeToggleIcon();
                        $$(
                            '.dropdown-content', document,
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

function initMobileDrawer(): void {
    const sheet =
        $('#mobile-sheet', document);
    const backdrop =
        $('#mobile-sheet-backdrop', document);
    let drawerPreviousFocus:
        HTMLElement | null = null;

    function openDrawer(): void {
        drawerPreviousFocus =
            document.activeElement
                instanceof HTMLElement
                ? document.activeElement
                : null;
        sheet?.classList.remove('hidden');
        backdrop?.classList.remove(
            'hidden',
        );
        const firstFocusable =
            sheet
                ?.querySelector<HTMLElement>(
                    FOCUSABLE_SELECTOR,
                );
        firstFocusable?.focus();
    }

    function closeDrawer(): void {
        sheet?.classList.add('hidden');
        backdrop?.classList.add('hidden');
        drawerPreviousFocus?.focus();
        drawerPreviousFocus = null;
    }

    $(
        '#mobile-sidebar-open', document,
    )?.addEventListener(
        'click',
        openDrawer,
    );
    backdrop?.addEventListener(
        'click',
        closeDrawer,
    );

    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Escape') return;
            if (
                sheet
                && !sheet.classList.contains(
                    'hidden',
                )
            ) {
                closeDrawer();
            }
        },
    );

    sheet?.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Tab') return;
            const focusable =
                sheet
                    .querySelectorAll<
                        HTMLElement
                    >(FOCUSABLE_SELECTOR);
            if (focusable.length === 0)
                return;
            const first = focusable[0]!;
            const last = focusable[
                focusable.length - 1
            ]!;
            if (
                e.shiftKey
                && document.activeElement
                    === first
            ) {
                e.preventDefault();
                last.focus();
            } else if (
                !e.shiftKey
                && document.activeElement
                    === last
            ) {
                e.preventDefault();
                first.focus();
            }
        },
    );

    $(
        '#mobile-search-toggle', document,
    )?.addEventListener(
        'click',
        () => {
            $(
                '#mobile-search-bar', document,
            )?.classList.remove('hidden');
        },
    );
    $(
        '#mobile-search-close', document,
    )?.addEventListener(
        'click',
        () => {
            $(
                '#mobile-search-bar', document,
            )?.classList.add('hidden');
        },
    );
}

async function mutateHeaderInfo(
): Promise<void> {
    try {
        const {
            getCurrentUser,
            getDashboardStats,
        } = await import('./adapters');
        const { getTimeOfDay } =
            await import('./format');
        const { html, setHtml } =
            await import('./safe-html');

        const [user, stats] =
            await Promise.all([
                getCurrentUser(),
                getDashboardStats(),
            ]);

        const greetingEl =
            $('#header-greeting', document);
        if (greetingEl) {
            setHtml(
                greetingEl,
                html`<span
style="font-weight:400">Good ${
getTimeOfDay()},</span> ${user.name}`,
            );
            greetingEl.addEventListener(
                'click',
                () =>
                    navigateTo('profile'),
            );
        }

        const statsEl =
            $('#header-stats', document);
        if (statsEl) {
            setHtml(
                statsEl,
                html`<span
class="header-stat-label">${
user.company}</span>${
stats.map(
    (stat, i) =>
        html`<div
class="header-stat-divider"></div>
<div class="header-stat-item">
<span class="header-stat-value">${
stat.value}</span>
<span class="header-stat-label">${
stat.label}</span></div>`,
)}`,
            );
        }
    } catch (err) {
        log.debug(
            'Header info load failed',
            'layout',
            err,
        );
    }
}

async function initSidebarLayout(
): Promise<void> {
    initActiveNavItem();
    initSidebar();
    initThemeAndDropdowns();
    initMobileDrawer();
    mutateThemeToggleIcon();
    await Promise.all([
        mutateSidebarUser(),
        mutateHeaderInfo(),
    ]);
}

export { initSidebarLayout };
