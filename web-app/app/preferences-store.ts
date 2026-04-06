function readPreference(
    key: string,
): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
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
    readPreference,
    writePreference,
};
