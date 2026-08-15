import {
    initDatabase,
    handleDatabaseError,
} from './database-init.ts';
import {
    MissingTableError,
} from './adapters/index.ts';
import {
    bootApp,
    redirectIfMissingTable,
} from './app-boot.ts';
import {
    markStart,
    markEnd,
    MEASURE_BOOT_DB_OPEN,
} from './page-performance.ts';

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

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        let hasSchema: boolean;
        markStart(MEASURE_BOOT_DB_OPEN);
        try {
            hasSchema =
                await initDatabase();
            markEnd(MEASURE_BOOT_DB_OPEN);
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
        await bootApp({
            hasSchema,
            recoverMissingTable: true,
        });
    },
);
