import {
    setSidebarCollapsed
        as persistSidebarCollapsed,
} from './state';
import { $required } from './dom';
import { log } from './logger';
import { showToast } from './toast';
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
        const root =
            document.documentElement;
        const isCollapsed = !root
            .classList
            .contains('sidebar-collapsed');
        try {
            persistSidebarCollapsed(
                isCollapsed,
            );
        } catch (err) {
            log.warn(
                'sidebar persist failed',
                'layout',
                err,
            );
            showToast(
                'Failed to save'
                + ' sidebar state.',
                'error',
            );
            return;
        }
        root.classList.toggle(
            'sidebar-collapsed',
            isCollapsed,
        );
    }

    $required(
        '#sidebar-toggle', document,
    ).addEventListener(
        'click', toggleSidebar,
    );
}

async function initSidebarLayout(
    hasSchema = true,
): Promise<void> {
    initActiveNavItem();
    initSidebar();
    initThemeAndDropdowns();
    initMobileDrawer();
    mutateThemeToggleIcon();
    if (hasSchema) {
        await Promise.all([
            mutateSidebarUser(),
            mutateHeaderInfo(),
        ]);
    }
}

export { initSidebarLayout };
