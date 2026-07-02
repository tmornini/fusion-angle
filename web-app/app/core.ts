import {
    initState,
    initListeners,
} from './state.ts';
import {
    getPageName,
} from './navigation.ts';
import {
    initSidebarLayout,
} from './layout.ts';
import {
    initDatabase,
    handleDatabaseError,
} from './database-init.ts';
import {
    initPageModule,
    handlePageLoadError,
} from './page-loader.ts';
import { log } from './logger.ts';
import {
    MissingTableError,
    UnauthorizedError,
} from './adapters/index.ts';
import {
    getDbAdapter,
    getSessionToken,
    putSessionToken,
} from './adapters/init.ts';
import {
    sessionContext,
    createRequestContext,
} from './adapters/shared.ts';
import {
    getOrganizations,
} from './adapters/organizations.ts';
import {
    resolveActiveOrganization,
    postOrganizationSessionExchange,
    ACTIVE_ORGANIZATION_KEY,
} from './adapters/organization-session.ts';
import {
    getIdentityDefaultOrganization,
} from './adapters/identity-default-organization.ts';
import {
    nowEpochSeconds,
} from '../../api/types.ts';
import {
    getPreference,
    putPreference,
} from './adapters/preferences.ts';
import {
    type SessionCredentials,
    getSessionCredentials,
    putSessionCredentials,
    deleteSessionCredentials,
} from './adapters/session-credentials.ts';
import {
    resolveCredentialDecision,
} from './credential-resolution.ts';
import {
    postSessionRefresh,
} from './adapters/session-refresh.ts';
import { initErrorSurfacing } from './error-helpers.ts';
import {
    putSchemaPresent,
} from './adapters/schema-marker.ts';
import { redirectToLogin } from './auth-redirect.ts';
import { navigateTo } from './navigation.ts';
import { PAGE_REGISTRY } from './page-registry.ts';

export { navigateTo } from './navigation.ts';
export {
    DISPLAY_ABSENT,
    displayText,
    formatDate,
    formatCalendarDate,
    formatDateTime,
    getTimeOfDay,
    initials,
    pluralize,
    toDateInputValue,
    trimStrings,
    formatCompactCurrency,
    SECONDS_PER_DAY,
} from './format.ts';
export {
    openDialog,
    closeDialog,
    clickedOutside,
    initTabs,
    parseDialogClick,
    handleDialogClick,
} from './dialog.ts';
export { initDropdown } from './theme-toggle.ts';

async function loadAndInitCommandPalette(): Promise<void> {
    const cp = await import('./command-palette');
    cp.initCommandPalette();
}

// Navigate to `page` unless already there. Returns true when it
// redirected (the caller must stop booting), false when the
// current page IS the target — the loop-guard that keeps a boot
// redirect from bouncing to itself forever.
function bounceTo(
    page: string,
    params?: Record<string, string>,
): boolean {
    if (getPageName() === page) return false;
    navigateTo(page, params);
    return true;
}

function redirectIfMissingTable(
    err: unknown,
): boolean {
    if (!(err instanceof MissingTableError)) {
        return false;
    }
    if (
        !bounceTo('snapshots', {
            'missing-table': err.table,
        })
    ) {
        log.warn(
            'missing table on snapshots page',
            'core',
            err,
        );
        return false;
    }
    log.warn(
        'missing table; redirecting to snapshots',
        'core',
        err,
    );
    return true;
}

// Scope the session to an active org and report whether it
// could: enumerate the member's reachable orgs, resolve the
// active one (the persisted choice, else the identity's default,
// else the first reachable), and install an org-scoped token
// BEFORE first render so every read is fenced to one tenant.
// Returns false when the identity reaches no org — the caller
// decides what that means (bounce when auth-gated, degrade to
// anonymous when the page is auth-exempt).
async function scopeBootToActiveOrganization(): Promise<boolean> {
    const ctx = sessionContext();
    const reachable =
        (await getOrganizations(ctx)).map(o => o.id);
    if (reachable.length === 0) return false;
    const active = resolveActiveOrganization(
        reachable,
        getPreference(ACTIVE_ORGANIZATION_KEY),
        await getIdentityDefaultOrganization(ctx),
    );
    putSessionToken(
        await postOrganizationSessionExchange(
            ctx, getSessionToken(), active));
    putPreference(ACTIVE_ORGANIZATION_KEY, active);
    return true;
}

// Best-effort scoping for an auth-EXEMPT page that still renders the
// shared sidebar (snapshots, design-system). A logged-in visitor
// gets an org-scoped session so the sidebar shows their real member
// and org — installing a live access token OR silently refreshing a
// dead one, exactly as the auth gate does, so an expired access token
// no longer renders these pages anonymously. Everyone else keeps the
// anonymous seed and the sidebar renders without a member chip — the
// org-bound reads gate on sessionIsOrganizationScoped(). Never bounces and
// never scrubs (the page is reachable without auth); a dead or failed
// refresh degrades to the unscoped state rather than aborting boot.
async function scopeBootIfCredentialed(): Promise<void> {
    let creds: SessionCredentials | null;
    try {
        creds = getSessionCredentials();
    } catch {
        return;   // a corrupt blob here just stays anonymous
    }
    const now = nowEpochSeconds();
    const decision = resolveCredentialDecision(creds, now);
    if (decision.kind === 'login') {
        return;   // nothing usable — keep the anonymous seed
    }
    try {
        if (decision.kind === 'install') {
            putSessionToken(decision.accessToken);
        } else if (
            !(await refreshAndInstall(decision.refreshToken))
        ) {
            return;   // dead refresh — stay anonymous, no scrub
        }
        await scopeBootToActiveOrganization();
    } catch (err) {
        log.warn('opportunistic org scope failed', 'core', err);
    }
}

// Resolve the boot session from the persisted credential: install
// a live access token, silently refresh a dead one, or bounce to
// login when there is nothing usable. Returns false once it has
// redirected — the caller must stop booting.
async function bootAuthGate(): Promise<boolean> {
    let creds: SessionCredentials | null;
    try {
        creds = getSessionCredentials();
    } catch {
        // a corrupt blob is unrecoverable — scrub and bounce
        deleteSessionCredentials();
        redirectToLogin();
        return false;
    }
    const now = nowEpochSeconds();
    const decision = resolveCredentialDecision(creds, now);
    if (decision.kind === 'install') {
        putSessionToken(decision.accessToken);
        return true;
    }
    if (decision.kind === 'refresh') {
        return installRefreshedSession(decision.refreshToken);
    }
    redirectToLogin();   // decision.kind === 'login'
    return false;
}

// Resolve the boot's org scope, or bounce a zero-membership
// identity to its only reachable surface — pending invitations.
// Sibling to bootAuthGate: returns false once it has redirected,
// so the caller stops booting. Accepting an invitation grants the
// first membership and unblocks every org-scoped route.
async function bootOrganizationGate(): Promise<boolean> {
    if (await scopeBootToActiveOrganization()) return true;
    return !bounceTo('invitations');
}

// Refresh a dead-access / live-refresh session and install the new
// token. Returns true on success, false when the refresh itself is
// unauthorized (401 — terminal). NEVER scrubs or redirects: the
// CALLER decides what a failed refresh means — the auth gate bounces,
// an auth-exempt page degrades to anonymous. One refresh voice for
// both callers (Generality). A non-401 fault rethrows.
async function refreshAndInstall(
    refreshToken: string,
): Promise<boolean> {
    const ctx = createRequestContext(
        getDbAdapter(), getSessionToken());
    try {
        const creds = await postSessionRefresh(
            ctx, refreshToken);
        putSessionCredentials(creds);
        putSessionToken(creds.accessToken);
        return true;
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            return false;
        }
        throw err;
    }
}

// The auth gate's refresh: install the new session, or — on a dead
// refresh (recovery-FREE context, a 401 is terminal) — scrub and
// bounce to login. scopeBootToActiveOrganization then re-scopes the org.
async function installRefreshedSession(
    refreshToken: string,
): Promise<boolean> {
    if (await refreshAndInstall(refreshToken)) {
        return true;
    }
    deleteSessionCredentials();
    redirectToLogin();
    return false;
}

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        initErrorSurfacing();
        initState();
        initListeners();

        let hasSchema: boolean;
        try {
            hasSchema =
                await initDatabase();
        } catch (err) {
            // A missing/incompatible table routes to the
            // snapshots recovery page; when boot already
            // landed there, render it with hasSchema=false
            // so its seed/import controls show. Any other
            // init fault is a genuine dead-end.
            if (redirectIfMissingTable(err)) return;
            if (err instanceof MissingTableError) {
                hasSchema = false;
            } else {
                handleDatabaseError(err);
                return;
            }
        }

        putSchemaPresent(hasSchema);

        const pageName = getPageName();

        if (
            !hasSchema
            && PAGE_REGISTRY[pageName]?.requiresSchema
                !== false
        ) {
            navigateTo('snapshots');
            return;
        }

        if (hasSchema) {
            if (
                PAGE_REGISTRY[pageName]?.requiresAuth
                    !== false
            ) {
                if (!(await bootAuthGate())) {
                    return;   // bounced to login
                }
                if (!(await bootOrganizationGate())) {
                    return;   // bounced to invitations
                }
            } else {
                await scopeBootIfCredentialed();
            }
        }

        if (
            PAGE_REGISTRY[pageName]?.layout
                === 'sidebar'
        ) {
            try {
                await initSidebarLayout(
                    hasSchema,
                );
            } catch (err) {
                if (
                    redirectIfMissingTable(err)
                ) return;
                log.warn(
                    'sidebar layout init failed',
                    'core',
                    err,
                );
            }
        }

        try {
            await loadAndInitCommandPalette();
        } catch (err) {
            if (
                redirectIfMissingTable(err)
            ) return;
            log.warn(
                'command palette init failed',
                'core',
                err,
            );
        }

        try {
            await initPageModule(pageName);
        } catch (err) {
            if (
                redirectIfMissingTable(err)
            ) return;
            handlePageLoadError(
                pageName, err,
            );
        }
    },
);
