import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    subscribeSchemaChanges,
} from '../web-app/app/adapters/schema.ts';

test(
    'subscribeSchemaChanges returns'
    + ' an unsubscribe function',
    () => {
        const unsub = subscribeSchemaChanges(
            () => {},
        );
        assert.equal(typeof unsub, 'function');
        unsub();
    },
);

// Integration: the eager-load path inside
// initCommandPalette() must not invoke
// getSearchIndex() (and thus getIdeas, which
// throws MissingTableError on cold load) when
// the schema is absent. This test stubs the
// minimum DOM/storage surface initCommandPalette
// touches, points the global adapter at a
// pristine localStorage, and asserts the call
// completes without throwing. With the bug
// reverted (eager `void getSearchIndex()` with
// no schema gate), the unhandled rejection from
// getIdeas surfaces here.
test(
    'initCommandPalette does not throw'
    + ' when schema is absent',
    async () => {
        const fakeStorage = createFakeStorage();
        installGlobals(fakeStorage);
        try {
            const { initAdapter } = await import(
                '../web-app/app/adapters/init.ts'
            );
            const { initCommandPalette } =
                await import(
                '../web-app/app/command-palette.ts'
                );
            const hasSchema =
                await initAdapter();
            assert.equal(
                hasSchema, false,
                'precondition: no schema',
            );
            const unhandled: unknown[] = [];
            const onRejection = (
                reason: unknown,
            ) => {
                unhandled.push(reason);
            };
            process.on(
                'unhandledRejection',
                onRejection,
            );
            try {
                initCommandPalette();
                await new Promise(
                    r => setImmediate(r),
                );
                await new Promise(
                    r => setImmediate(r),
                );
            } finally {
                process.off(
                    'unhandledRejection',
                    onRejection,
                );
            }
            assert.deepEqual(
                unhandled, [],
                'no MissingTableError leaked',
            );
        } finally {
            uninstallGlobals();
        }
    },
);

interface FakeStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
    readonly length: number;
    key(i: number): string | null;
}

function createFakeStorage(): FakeStorage {
    const data = new Map<string, string>();
    return {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => { data.set(k, v); },
        removeItem: (k) => { data.delete(k); },
        clear: () => { data.clear(); },
        get length() { return data.size; },
        key: (i) =>
            [...data.keys()][i] ?? null,
    };
}

interface SavedGlobals {
    document: unknown;
    localStorage: unknown;
    hadDocument: boolean;
    hadLocalStorage: boolean;
}

let saved: SavedGlobals | null = null;

function installGlobals(
    storage: FakeStorage,
): void {
    const g = globalThis as Record<
        string, unknown
    >;
    saved = {
        document: g.document,
        localStorage: g.localStorage,
        hadDocument: 'document' in g,
        hadLocalStorage: 'localStorage' in g,
    };
    g.document = {
        addEventListener: () => {},
        querySelector: () => null,
    };
    g.localStorage = storage;
}

function uninstallGlobals(): void {
    if (!saved) return;
    const g = globalThis as Record<
        string, unknown
    >;
    if (saved.hadDocument) {
        g.document = saved.document;
    } else {
        delete g.document;
    }
    if (saved.hadLocalStorage) {
        g.localStorage = saved.localStorage;
    } else {
        delete g.localStorage;
    }
    saved = null;
}
