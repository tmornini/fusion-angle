import { log } from '../logger.ts';
import {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
} from '../storage-keys.ts';

function getPreference(
    key: string,
): string | null {
    return localStorage.getItem(key);
}

type StoredTheme = 'light' | 'dark' | 'system';

const BOOL_STRING_TRUE = 'true';
const BOOL_STRING_FALSE = 'false';

function isStoredTheme(
    value: string | null,
): value is StoredTheme {
    return value === 'light'
        || value === 'dark'
        || value === 'system';
}

// The validated theme/sidebar readers — ONE truth for the
// pre-paint module (theme-init.ts) and state.ts, so a
// corrupt persisted value fails identically (loudly) at
// every reader. Absence reads as the documented default:
// system theme, expanded sidebar.
function getStoredTheme(): StoredTheme {
    const raw = getPreference(
        STORAGE_KEY_THEME,
    );
    if (raw === null) return 'system';
    if (isStoredTheme(raw)) return raw;
    throw new Error(
        'corrupt stored theme: ' + raw,
    );
}

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

// Preference writes are non-critical:
// theme and sidebar state are observable
// fallbacks if persistence fails (the app
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

export type { StoredTheme };
export {
    getPreference,
    putPreference,
    getStoredTheme,
    getStoredSidebarCollapsed,
    isStoredTheme,
    BOOL_STRING_TRUE,
    BOOL_STRING_FALSE,
};
