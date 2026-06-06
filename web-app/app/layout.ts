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
    mutateSidebarMember,
} from './sidebar-member.ts';
import {
    initMobileDrawer,
} from './mobile-drawer.ts';
import {
    mutateHeaderInfo,
} from './header-info.ts';
import { navigateTo } from './navigation.ts';
import { sessionContext } from './adapters/shared.ts';
import {
    postSessionLogout,
} from './adapters/session-logout.ts';

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
        }
    }

    $required(
        '#sidebar-toggle', document,
    ).addEventListener(
        'click', toggleSidebar,
    );
}

// Bind every [data-signout] control (both the desktop and the
// mobile sidebar carry one). The server revoke is best-effort:
// postSessionLogout always scrubs the local session in its
// finally, so we navigate to the login page regardless — a
// failed revoke is logged, never a reason to strand the user.
function initSignOut(): void {
    const signOut = async (): Promise<void> => {
        try {
            await postSessionLogout(sessionContext());
        } catch (err) {
            log.warn('sign-out revoke failed', 'layout', err);
        } finally {
            navigateTo('auth');
        }
    };
    document
        .querySelectorAll('[data-signout]')
        .forEach(el =>
            el.addEventListener('click', signOut));
}

async function initSidebarLayout(
    hasSchema = true,
): Promise<void> {
    initActiveNavItem();
    initSidebar();
    initSignOut();
    initThemeAndDropdowns();
    initMobileDrawer();
    mutateThemeToggleIcon();
    if (hasSchema) {
        await Promise.all([
            mutateSidebarMember(),
            mutateHeaderInfo(),
        ]);
    }
}

export { initSidebarLayout };
