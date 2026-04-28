import {
    collapseSidebar
        as persistSidebarCollapsed,
} from './state.ts';
import { $required } from './dom.ts';
import { log } from './logger.ts';
import { showToast } from './toast.ts';
import {
    initActiveNavItem,
} from './nav-highlight.ts';
import {
    mutateThemeToggleIcon,
    initThemeAndDropdowns,
} from './theme-toggle.ts';
import {
    mutateSidebarUser,
} from './sidebar-user.ts';
import {
    initMobileDrawer,
} from './mobile-drawer.ts';
import {
    mutateHeaderInfo,
} from './header-info.ts';

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
