import {
    state,
    setSidebarCollapsed
        as persistSidebarCollapsed,
} from './state';
import { $required } from './dom';
import {
    initActiveNavItem,
} from './nav-highlight';
import {
    mutateThemeToggleIcon,
    initThemeAndDropdowns,
} from './theme-toggle';
import {
    mutateSidebarUser,
} from './sidebar-user';
import {
    initMobileDrawer,
} from './mobile-drawer';
import {
    mutateHeaderInfo,
} from './header-info';

function initSidebar(): void {
    const sidebar = $required(
        '#desktop-sidebar', document,
    );
    const mainContent = $required(
        '.main-content', document,
    );

    if (state.isSidebarCollapsed) {
        sidebar.classList.add(
            'sidebar-collapsed',
        );
        mainContent.classList.add(
            'sidebar-collapsed',
        );
    }

    function setSidebarCollapsed(
        collapsed: boolean,
    ): void {
        const action = collapsed
            ? 'add' : 'remove';
        sidebar.classList[action](
            'sidebar-collapsed',
        );
        mainContent.classList[action](
            'sidebar-collapsed',
        );
        persistSidebarCollapsed(collapsed);
    }

    $required(
        '#sidebar-collapse', document,
    ).addEventListener(
        'click',
        () => setSidebarCollapsed(true),
    );
    $required(
        '#sidebar-expand', document,
    ).addEventListener(
        'click',
        () => setSidebarCollapsed(false),
    );
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
