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
// Quota-exceeded is expected and logged
// at warn; other errors propagate.
function writePreference(
    key: string,
    value: string,
): void {
    try {
        localStorage.setItem(key, value);
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
            return;
        }
        throw err;
    }
}

export {
    getPreference,
    writePreference,
};
