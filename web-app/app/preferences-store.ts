import { log } from './logger';

function getPreference(
    key: string,
): string | null {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        log.warn(
            'Failed to read preference: '
            + key,
            'preferences-store',
            err,
        );
        return null;
    }
}

function writePreference(
    key: string,
    value: string,
): void {
    localStorage.setItem(key, value);
}

export {
    getPreference,
    writePreference,
};
