import { log } from '../logger.ts';

function getPreference(
    key: string,
): string | null {
    return localStorage.getItem(key);
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
                + ' due to quota: ' + key,
                'preferences', err,
            );
            return false;
        }
        throw err;
    }
}

export {
    getPreference,
    putPreference,
};
