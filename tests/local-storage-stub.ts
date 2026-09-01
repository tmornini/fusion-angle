// Preload for ./test. Deno ships a real Web Storage
// global: assigning globalThis.localStorage is ignored,
// `localStorage.setItem = fn` stores a key, and the
// store persists across processes. Thirty-three test
// files stub localStorage by assignment. Installing a
// writable in-memory fake first makes every such stub
// take effect and keeps every test off persistent
// storage. Node-neutral.
const store = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
    value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    },
    writable: true,
    configurable: true,
});

// Force module scope: this file and
// session-storage-stub.ts each declare a top-level
// `store` with no import or export. Deno loads both as ES
// modules regardless, but TypeScript tooling outside the
// Deno gate — the editor's language server, which has no
// tsconfig.json to read since the cutover — treats them as
// one global script and rejects the second `store`.
export {};
