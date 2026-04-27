import {
    applyTheme,
    initListeners,
} from './state';
import {
    getPageName,
} from './navigation';
import {
    initSidebarLayout,
} from './layout';
import {
    initDatabase,
    handleDatabaseError,
} from './database-init';
import {
    initPageModule,
    handlePageLoadError,
} from './page-loader';
import { log } from './logger';
import { MissingTableError } from '../../api/db';
import { navigateTo } from './navigation';

export { navigateTo } from './navigation';
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
} from './format';
export {
    openDialog,
    closeDialog,
    initDialog,
    initTabs,
} from './dialog';
export { initDropdown } from './theme-toggle';

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

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        initListeners();
        applyTheme();

        let hasSchema: boolean;
        try {
            hasSchema =
                await initDatabase();
        } catch (err) {
            handleDatabaseError(err);
            return;
        }

        if (!hasSchema) {
            const page = getPageName();
            const skipRedirect = [
                'snapshots',
                'auth',
                'onboarding',
                'not-found',
                'design-system',
                'landing',
            ];
            if (
                !skipRedirect.includes(
                    page,
                )
            ) {
                navigateTo('snapshots');
                return;
            }
        }

        const pageName = getPageName();

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
