import { applyTheme } from './state';
import { log } from './logger';
import {
    getPageName,
    initPrefetch,
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

export { navigateTo } from './navigation';
export {
    DISPLAY_ABSENT,
    displayText,
    formatDate,
    formatDateTime,
    getTimeOfDay,
    initials,
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

window.addEventListener(
    'unhandledrejection',
    event => {
        const reason = event.reason as
            DOMException | undefined;
        const name = reason?.name;
        if (
            name === 'InvalidStateError'
            || name === 'AbortError'
        ) {
            event.preventDefault();
        }
    },
);

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        applyTheme();
        initPrefetch();

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
                const { navigateTo } =
                    await import(
                        './navigation'
                    );
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
            await initSidebarLayout();
        }

        import('./command-palette')
            .then(
                m =>
                    m.initCommandPalette(),
            )
            .catch(err => log.error(
                'Failed to load'
                + ' command palette',
                'core',
                err,
            ));

        try {
            await initPageModule(
                pageName,
            );
        } catch (err) {
            handlePageLoadError(
                pageName, err,
            );
        }
    },
);
