import {
    collapseSidebar
        as persistSidebarCollapsed,
} from './state.ts';
import { $$, $required } from './dom.ts';
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
import {
    mutateInvitationsBell,
} from './invitations-indicator.ts';
import { navigateTo } from './navigation.ts';
import { sessionContext } from './adapters/shared.ts';
import type {
    OrganizationEntity,
} from '../../api/types.ts';
import {
    sessionIsOrganizationScoped,
    sessionIsAuthenticated,
} from './adapters/init.ts';
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
    $$('[data-signout]', document)
        .forEach(el =>
            el.addEventListener('click', signOut));
}

async function initSidebarLayout(
    hasSchema: boolean,
    bootOrganizations:
        readonly OrganizationEntity[] | null = null,
): Promise<void> {
    initActiveNavItem();
    initSidebar();
    initSignOut();
    initThemeAndDropdowns();
    initMobileDrawer();
    mutateThemeToggleIcon();
    // The identity-scoped widgets — the member chip name and the
    // invitations bell — render for any logged-in visitor, even a
    // zero-membership identity on its invitations page. The header
    // strip is org-bound, so it joins only for a scoped session. On
    // an auth-exempt page with no logged-in visitor the holder is
    // the anonymous seed, so we skip every read rather than fire one
    // that 401s 'anonymous principal' or throws 'no active org'.
    if (hasSchema && sessionIsAuthenticated()) {
        // Each widget settles independently: a member with no admin
        // role is forbidden the org reads the chip and header strip
        // make, and a zero-membership identity is forbidden them
        // all, but the identity-scoped invitations bell must still
        // appear. allSettled keeps one widget's denial from
        // suppressing the others; rejections are logged, never
        // swallowed.
        const widgets: Array<Promise<void>> = [
            mutateSidebarMember(bootOrganizations),
            mutateInvitationsBell(),
        ];
        if (sessionIsOrganizationScoped()) {
            widgets.push(mutateHeaderInfo());
        }
        const results = await Promise.allSettled(widgets);
        for (const result of results) {
            if (result.status === 'rejected') {
                log.warn(
                    'sidebar widget failed to load',
                    'layout', result.reason,
                );
            }
        }
    }
}

export { initSidebarLayout };
