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
import { navigateTo } from './navigation.ts';

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
    durationInDays,
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

const PAGES_WITHOUT_SCHEMA: ReadonlySet<string> = new Set([
    'snapshots',
    'auth',
    'onboarding',
    'not-found',
    'design-system',
    'landing',
]);

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

        const pageName = getPageName();

        if (
            !hasSchema
            && !PAGES_WITHOUT_SCHEMA.has(pageName)
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
