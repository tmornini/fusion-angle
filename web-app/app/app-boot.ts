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
    initPageModule,
    handlePageLoadError,
} from './page-loader.ts';
import { log } from './logger.ts';
import {
    UnauthorizedError,
} from './adapters/index.ts';
import {
    getSessionToken,
    putSessionToken,
    sessionTokenIsSeeded,
} from './adapters/session-token.ts';
import { getClientFacade } from './adapters/facade-holder.ts';
import {
    sessionContext,
    createRequestContext,
} from './adapters/shared.ts';
import {
    getOrganizations,
} from './adapters/organizations.ts';
import type {
    OrganizationEntity,
} from '../../api/types.ts';
import {
    resolveActiveOrganization,
    postOrganizationSessionExchange,
    ACTIVE_ORGANIZATION_ID,
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
    isCookieSession,
} from './adapters/session-credentials.ts';
import { runSingleFlightRefresh } from
    './adapters/session-refresh-mutex.ts';
import {
    resolveCredentialDecision,
    resolveOrganizationGate,
} from './credential-resolution.ts';
import {
    postSessionRefresh,
} from './adapters/session-refresh.ts';
import { initErrorSurfacing } from './error-helpers.ts';
import { replayPendingToast } from './toast.ts';
import { redirectToLogin } from './auth-redirect.ts';
import { navigateTo } from './navigation.ts';
import {
    PAGE_REGISTRY,
    pageAuthMode,
} from './page-registry.ts';
import {
    markStart,
    markEnd,
    recordPageReady,
    MEASURE_BOOT_AUTH_GATE,
    MEASURE_BOOT_ORGANIZATION_SCOPE,
    MEASURE_BOOT_SIDEBAR_CHROME,
    MEASURE_BOOT_COMMAND_PALETTE,
} from './page-performance.ts';

async function loadAndInitCommandPalette(): Promise<void> {
    const cp = await import('./command-palette');
    cp.initCommandPalette();
}

// Navigate to `page` unless already there. Returns true when
// it redirected (the caller must stop booting), false when
// the current page IS the target — the loop-guard that keeps
// a boot redirect from bouncing to itself forever.
function bounceTo(
    page: string,
    params?: Record<string, string>,
): boolean {
    if (getPageName() === page) return false;
    navigateTo(page, params);
    return true;
}

// Scope the session to an active organization: enumerate
// the member's reachable organizations, resolve the active
// one (the persisted choice, else the identity's default,
// else the first reachable), and install an organization-
// scoped token BEFORE first render so every read is fenced
// to one tenant. Returns the fetched organization rows
// (empty = unscoped). Callers that need a bounce decision
// treat empty as fail; auth-exempt pages degrade
// anonymously.
async function scopeBootToActiveOrganization(
): Promise<readonly OrganizationEntity[]> {
    const ctx = sessionContext();
    // getIdentityDefaultOrganization returns null when no
    // default is set (never throws on absence) — both reads
    // are independent and join before the empty-reachable
    // guard and the exchange.
    const [
        organizations, defaultOrganization,
    ] = await Promise.all([
        getOrganizations(ctx),
        getIdentityDefaultOrganization(ctx),
    ]);
    const reachable = organizations.map(o => o.id);
    if (reachable.length === 0) return [];
    const active = resolveActiveOrganization(
        reachable,
        getPreference(ACTIVE_ORGANIZATION_ID),
        defaultOrganization,
    );
    putSessionToken(
        await postOrganizationSessionExchange(
            ctx, getSessionToken(), active));
    putPreference(ACTIVE_ORGANIZATION_ID, active);
    // Pre/post-exchange rows equal: getOrganizations is
    // identity-scoped (membership filter), not
    // organization-fenced.
    return organizations;
}

// Best-effort scoping for an auth-EXEMPT page that still
// renders the shared sidebar (design-system). A
// logged-in visitor gets an organization-scoped session so
// the sidebar shows their real member and organization —
// installing a live access token OR silently refreshing a
// dead one, exactly as the auth gate does, so an expired
// access token no longer renders these pages anonymously.
// Everyone else keeps the anonymous seed and the sidebar
// renders without a member chip — the organization-bound
// reads gate on sessionIsOrganizationScoped(). Never
// bounces and never scrubs (the page is reachable without
// auth); a dead or failed refresh degrades to the unscoped
// state rather than aborting boot.
async function scopeBootIfCredentialed(
): Promise<readonly OrganizationEntity[]> {
    let creds: SessionCredentials | null;
    try {
        creds = getSessionCredentials();
    } catch (err) {
        // a corrupt blob here just stays anonymous
        log.warn('corrupt session credential', 'core', err);
        return [];
    }
    if (isCookieSession()) {
        if (!(await cookieRefreshAndInstall())) {
            return [];
        }
        try {
            return await scopeBootToActiveOrganization();
        } catch (err) {
            log.warn(
                'opportunistic org scope failed',
                'core',
                err,
            );
            return [];
        }
    }
    const now = nowEpochSeconds();
    const decision = resolveCredentialDecision(creds, now);
    if (decision.kind === 'login') {
        return [];   // nothing usable — keep the anonymous seed
    }
    try {
        if (decision.kind === 'install') {
            putSessionToken(decision.accessToken);
        } else if (
            !(await refreshAndInstall(decision.refreshToken))
        ) {
            return [];   // dead refresh — stay anonymous, no scrub
        }
        return await scopeBootToActiveOrganization();
    } catch (err) {
        log.warn('opportunistic org scope failed', 'core', err);
        return [];
    }
}

// Resolve the boot session from the persisted credential:
// install a live access token, silently refresh a dead one,
// or bounce to login when there is nothing usable. Returns
// false once it has redirected — the caller must stop
// booting.
async function cookieRefreshAndInstall(
): Promise<boolean> {
    const token = sessionTokenIsSeeded()
        ? getSessionToken()
        : '';
    const ctx = createRequestContext(
        getClientFacade(), token);
    try {
        const access = await runSingleFlightRefresh(
            async () => {
                try {
                    const creds = await postSessionRefresh(
                        ctx, '');
                    putSessionToken(creds.accessToken);
                    return creds.accessToken;
                } catch (err) {
                    if (err instanceof UnauthorizedError) {
                        return null;
                    }
                    throw err;
                }
            },
        );
        if (access === null) {
            return false;
        }
        putSessionToken(access);
        return true;
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            return false;
        }
        throw err;
    }
}

async function bootAuthGate(): Promise<boolean> {
    if (isCookieSession()) {
        if (await cookieRefreshAndInstall()) {
            return true;
        }
        redirectToLogin();
        return false;
    }
    let creds: SessionCredentials | null;
    try {
        creds = getSessionCredentials();
    } catch (err) {
        // a corrupt blob is unrecoverable — scrub and bounce
        log.warn('corrupt session credential', 'core', err);
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

// Resolve the boot's organization scope, or bounce a
// zero-membership identity to its only reachable surface —
// pending invitations. Sibling to bootAuthGate: returns
// false once it has redirected, so the caller stops
// booting. Accepting an invitation grants the first
// membership and unblocks every organization-scoped route.
async function bootOrganizationGate(
): Promise<readonly OrganizationEntity[] | null> {
    const organizations =
        await scopeBootToActiveOrganization();
    const decided = resolveOrganizationGate(
        organizations, getPageName(),
    );
    if (decided === null) {
        bounceTo('invitations');
        return null;
    }
    return decided;
}

// Refresh a dead-access / live-refresh session and install
// the new token. Returns true on success, false when the
// refresh itself is unauthorized (401 — terminal). NEVER
// scrubs or redirects: the CALLER decides what a failed
// refresh means — the auth gate bounces, an auth-exempt
// page degrades to anonymous. One refresh voice for both
// callers (Generality). A non-401 fault rethrows.
async function refreshAndInstall(
    refreshToken: string,
): Promise<boolean> {
    const ctx = createRequestContext(
        getClientFacade(), getSessionToken());
    try {
        const access = await runSingleFlightRefresh(
            async () => {
                try {
                    const creds = await postSessionRefresh(
                        ctx, refreshToken);
                    putSessionCredentials(creds);
                    putSessionToken(creds.accessToken);
                    return creds.accessToken;
                } catch (err) {
                    if (err instanceof UnauthorizedError) {
                        return null;
                    }
                    throw err;
                }
            },
        );
        if (access === null) {
            return false;
        }
        putSessionToken(access);
        return true;
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            return false;
        }
        throw err;
    }
}

// The auth gate's refresh: install the new session, or —
// on a dead refresh (recovery-FREE context, a 401 is
// terminal) — scrub and bounce to login.
// scopeBootToActiveOrganization then re-scopes the
// organization.
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

export async function bootApp(): Promise<void> {
    initErrorSurfacing();
    initState();
    initListeners();
    replayPendingToast();

    const pageName = getPageName();

    if (pageAuthMode(pageName) === 'missing') {
        bounceTo('not-found');
        return;
    }

    let bootOrganizations:
        readonly OrganizationEntity[] = [];
    if (
        PAGE_REGISTRY[pageName]?.requiresAuth
            !== false
    ) {
        markStart(MEASURE_BOOT_AUTH_GATE);
        const authOk = await bootAuthGate();
        markEnd(MEASURE_BOOT_AUTH_GATE);
        if (!authOk) {
            return;   // bounced to login
        }
        markStart(MEASURE_BOOT_ORGANIZATION_SCOPE);
        const scoped = await bootOrganizationGate();
        markEnd(MEASURE_BOOT_ORGANIZATION_SCOPE);
        if (scoped === null) {
            return;   // bounced to invitations
        }
        bootOrganizations = scoped;
    } else {
        markStart(MEASURE_BOOT_ORGANIZATION_SCOPE);
        bootOrganizations =
            await scopeBootIfCredentialed();
        markEnd(MEASURE_BOOT_ORGANIZATION_SCOPE);
    }

    // Three self-contained branches — sidebar chrome,
    // palette, and module-import + page-init — each keeps
    // its own marks and error handler. Joined by bare
    // Promise.all before recordPageReady so readyMs still
    // covers chrome (Commandment I). NOT fire-and-forget.
    // Gated pageReady so aborted boots never record
    // ready. Boot spans may overlap (see
    // page-performance.ts); readyMs is the summable truth.
    let pageReady = false;
    const branches: Array<Promise<void>> = [];

    if (PAGE_REGISTRY[pageName]?.layout === 'sidebar') {
        branches.push((async () => {
            markStart(MEASURE_BOOT_SIDEBAR_CHROME);
            try {
                await initSidebarLayout(
                    bootOrganizations,
                );
                markEnd(MEASURE_BOOT_SIDEBAR_CHROME);
            } catch (err) {
                log.warn(
                    'sidebar layout init failed',
                    'core',
                    err,
                );
            }
        })());
    }

    branches.push((async () => {
        markStart(MEASURE_BOOT_COMMAND_PALETTE);
        try {
            await loadAndInitCommandPalette();
            markEnd(MEASURE_BOOT_COMMAND_PALETTE);
        } catch (err) {
            log.warn(
                'command palette init failed',
                'core',
                err,
            );
        }
    })());

    branches.push((async () => {
        try {
            await initPageModule(pageName);
            pageReady = true;
        } catch (err) {
            handlePageLoadError(pageName, err);
        }
    })());

    await Promise.all(branches);
    if (pageReady) {
        recordPageReady(pageName);
    }
}
