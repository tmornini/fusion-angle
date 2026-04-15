import {
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
    function toggleSidebar(): void {
        const isCollapsed = document
            .documentElement.classList
            .toggle('sidebar-collapsed');
        persistSidebarCollapsed(isCollapsed);
    }

    $required(
        '#sidebar-toggle', document,
    ).addEventListener(
        'click', toggleSidebar,
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
