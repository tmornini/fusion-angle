function getPreference(
    key: string,
): string | null {
    return localStorage.getItem(key);
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
