import { log } from '../logger.ts';
import { STORAGE_KEY_SIDEBAR } from '../storage-keys.ts';

function getPreference(
    key: string,
): string | null {
    return localStorage.getItem(key);
}

const BOOL_STRING_TRUE = 'true';
const BOOL_STRING_FALSE = 'false';

// The validated sidebar reader — ONE truth for the
// pre-paint script and state.ts, so a corrupt persisted
// value fails identically (loudly) at every reader.
// Absence reads as the documented default: expanded
// sidebar.
function getStoredSidebarCollapsed(): boolean {
    const raw = getPreference(
        STORAGE_KEY_SIDEBAR,
    );
    if (raw === null) return false;
    if (raw === BOOL_STRING_TRUE) return true;
    if (raw === BOOL_STRING_FALSE) return false;
    throw new Error(
        'corrupt stored sidebar state: '
            + raw,
    );
}

function deletePreference(key: string): void {
    localStorage.removeItem(key);
}

// Preference writes are non-critical:
// sidebar state is an observable
// fallback if persistence fails (the app
// just renders the default on next load).
// Quota-exceeded is expected and reported
// via the false return; other errors
// propagate. The boolean lets the caller
// surface the failure to the user when the
// preference is user-initiated.
function putPreference(
    key: string,
    value: string,
): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        if (
            err instanceof DOMException
            && err.name
                === 'QuotaExceededError'
        ) {
            log.warn(
                'preference write skipped'
                + ' due to quota',
                'preferences',
                { key },
                err,
            );
            return false;
        }
        throw err;
    }
}

export {
    getPreference,
    putPreference,
    deletePreference,
    getStoredSidebarCollapsed,
    BOOL_STRING_TRUE,
    BOOL_STRING_FALSE,
};
