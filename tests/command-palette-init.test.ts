import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';

// Integration: initCommandPalette() performs no
// data reads at init — the index builds lazily on
// first open. getIdeas throws MissingTableError on
// a cold load, so any init-time read against an
// absent schema surfaces as an unhandled rejection
// here. This test stubs the minimum DOM/storage
// surface initCommandPalette touches, points the
// global adapter at a pristine in-memory tier
// (IndexedDB has no Node stub), and asserts the
// call completes without throwing — guarding
// against a regression to eager loading without a
// schema gate.
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
                await initAdapter(
                    () => new MemoryDbAdapter(),
                );
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
                // Drain microtask boundaries inside
                // getSearchIndex (await hasSchema,
                // await getIdeas, etc.) so the
                // unhandledRejection handler can fire.
                // Two setImmediates flush today's
                // pipeline; the loop guards against
                // future microtask growth.
                for (let i = 0; i < 10; i++) {
                    await new Promise(
                        r => setImmediate(r),
                    );
                }
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
    hadDocument: boolean;
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
        hadDocument: 'document' in g,
    };
    // Minimal document stub. initCommandPalette uses
    // only addEventListener (global keydown bind) and
    // querySelector (lookup) at init time. Methods
    // like document.body and createElement appear in
    // dialog-build paths that fire on first open.
    // A future init-time touch of those would fail
    // with "undefined is not a function" — signal
    // worth keeping, but unrelated to the schema-gate
    // behavior under test.
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
    delete g.localStorage;
    saved = null;
}
