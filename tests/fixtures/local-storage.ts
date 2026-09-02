// Per-test localStorage swap that restores the previous
// value in a finally, so a test's fake never outlives it.
// A module-level assignment to the global (`globalThis.
// localStorage=fake`) leaks into every later test in the
// worker — there is no process boundary to reclaim it.
// defineProperty (not a bare assignment) installs and
// restores, matching local-storage-stub.ts and staying
// independent of it.

export function withLocalStorage<T>(
    fake: Partial<Storage>,
    body: () => T,
): T {
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
        value: fake,
        writable: true,
        configurable: true,
    });
    try {
        return body();
    } finally {
        Object.defineProperty(globalThis, 'localStorage', {
            value: previous,
            writable: true,
            configurable: true,
        });
    }
}

export async function withLocalStorageAsync<T>(
    fake: Partial<Storage>,
    body: () => Promise<T>,
): Promise<T> {
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
        value: fake,
        writable: true,
        configurable: true,
    });
    try {
        return await body();
    } finally {
        Object.defineProperty(globalThis, 'localStorage', {
            value: previous,
            writable: true,
            configurable: true,
        });
    }
}
