import {
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
import { MissingTableError } from './adapters/index.ts';
import {
    establishSession,
    getSessionToken,
    setSessionToken,
} from './adapters/init.ts';
import { sessionContext } from './adapters/shared.ts';
import {
    getOrganizations,
} from './adapters/organizations.ts';
import {
    resolveActiveOrg,
    postOrgSessionExchange,
    ACTIVE_ORG_KEY,
} from './adapters/org-session.ts';
import {
    getPreference,
    writePreference,
} from './adapters/preferences.ts';
import { navigateTo } from './navigation.ts';
import { PAGE_REGISTRY } from './page-registry.ts';

export { navigateTo } from './navigation.ts';
export {
    DISPLAY_ABSENT,
    displayText,
    formatDate,
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
    initDialog,
    initTabs,
} from './dialog.ts';
export { initDropdown } from './theme-toggle.ts';

async function loadAndInitCommandPalette(): Promise<void> {
    const cp = await import('./command-palette');
    cp.initCommandPalette();
}

function redirectIfMissingTable(
    err: unknown,
): boolean {
    if (!(err instanceof MissingTableError)) {
        return false;
    }
    if (getPageName() === 'snapshots') {
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
    navigateTo('snapshots', {
        'missing-table': err.table,
    });
    return true;
}

// Boot always scopes the session to an active org: enumerate
// the member's reachable orgs, resolve the active one (the
// persisted choice, else DEFAULT_ORG, else the sole org), and
// install an org-scoped token BEFORE first render so every read
// is fenced to one tenant.
async function scopeBootToActiveOrg(): Promise<void> {
    const ctx = sessionContext();
    const reachable =
        (await getOrganizations(ctx)).map(o => o.id);
    if (reachable.length === 0) return;
    const active = resolveActiveOrg(
        reachable, getPreference(ACTIVE_ORG_KEY));
    setSessionToken(
        await postOrgSessionExchange(
            ctx, getSessionToken(), active));
    writePreference(ACTIVE_ORG_KEY, active);
}

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        initListeners();

        let hasSchema: boolean;
        try {
            hasSchema =
                await initDatabase();
        } catch (err) {
            handleDatabaseError(err);
            return;
        }

        if (hasSchema) {
            await establishSession('current', 'Demo User');
            await scopeBootToActiveOrg();
        }

        const pageName = getPageName();

        if (
            !hasSchema
            && PAGE_REGISTRY[pageName]?.requiresSchema
                !== false
        ) {
            navigateTo('snapshots');
            return;
        }

        if (
            document.querySelector(
                '.sidebar-layout',
            )
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
