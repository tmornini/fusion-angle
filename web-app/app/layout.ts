import type { AppState } from './state';
import {
    state,
    setState,
    setTheme,
    setSidebarCollapsed
        as persistSidebarCollapsed,
    isValidTheme,
} from './state';
import {
    $, $$, attr, FOCUSABLE_SELECTOR,
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
    const themeLabel = 'Toggle theme';
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

async function fetchSidebarUser(
): Promise<{
    name: string;
    company: string;
}> {
    const { getCurrentUser } =
        await import('./adapters');
    const { user, company } =
        await getCurrentUser();
    return {
        name: user.fullName(),
        company,
    };
}

async function mutateSidebarUser(
): Promise<void> {
    let data: {
        name: string;
        company: string;
    };
    try {
        data =
            await fetchSidebarUser();
    } catch (err) {
        log.debug(
            'Sidebar user info'
            + ' load failed',
            'layout',
            err,
        );
        return;
    }
    for (const id of
        SIDEBAR_USER_NAME_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent = data.name;
    }
    for (const id of
        SIDEBAR_USER_COMPANY_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent =
                data.company;
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
        ],
    };

function initActiveNavItem(): void {
    const pageName = getPageName();
    $$('[data-page-link]', document).forEach(
        navLink => {
            const linkPage = attr(
                navLink,
                'data-page-link',
            );
            const children =
                NAV_GROUP_CHILDREN[
                    linkPage
                ];
            const isActive =
                linkPage === pageName
                || (children
                    ? children.includes(
                        pageName,
                    )
                    : false);
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

    if (state.isSidebarCollapsed) {
        sidebar?.classList.add(
            'sidebar-collapsed',
        );
        mainContent?.classList.add(
            'sidebar-collapsed',
        );
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
        persistSidebarCollapsed(collapsed);
    }

    $('#sidebar-collapse', document)?.addEventListener(
        'click',
        () => setSidebarCollapsed(true),
    );
    $('#sidebar-expand', document)?.addEventListener(
        'click',
        () => setSidebarCollapsed(false),
    );

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

interface HeaderData {
    userName: string;
    company: string;
    greeting: string;
    stats: ReadonlyArray<{
        value: string | number;
        label: string;
    }>;
}

async function fetchHeaderData(
): Promise<HeaderData> {
    const {
        getCurrentUser,
        getDashboardStats,
    } = await import('./adapters');
    const { getTimeOfDay } =
        await import('./format');
    const [auth, stats] =
        await Promise.all([
            getCurrentUser(),
            getDashboardStats(),
        ]);
    return {
        userName: auth.user.fullName(),
        company: auth.company,
        greeting: getTimeOfDay(),
        stats,
    };
}

async function mutateHeaderInfo(
): Promise<void> {
    let data: HeaderData;
    try {
        data = await fetchHeaderData();
    } catch (err) {
        log.debug(
            'Header info load failed',
            'layout',
            err,
        );
        return;
    }
    const { html, setHtml } =
        await import('./safe-html');
    const greetingEl =
        $('#header-greeting', document);
    if (greetingEl) {
        setHtml(
            greetingEl,
            html`<span
style="font-weight:400">Good ${
data.greeting},</span> ${
data.userName}`,
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
data.company}</span>${
data.stats.map(
    (stat) =>
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
