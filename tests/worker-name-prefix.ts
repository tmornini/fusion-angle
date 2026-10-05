// Preload for ./test. Under --parallel every test file is
// a worker in ONE process, and BroadcastChannel and
// navigator.locks name process-global buses and locks: a
// refresh in one file waits on a peer file's lock and
// adopts its broadcast, and a page wakes on a peer's bell.
// A browser scopes both to an origin; this prefix makes
// each worker an origin of its own, so the tabs one file
// opens still share a name and a peer file's never do.
const WORKER_PREFIX = crypto.randomUUID() + ':';

globalThis.BroadcastChannel = new Proxy(
    globalThis.BroadcastChannel,
    {
        construct: (platform, [name]: unknown[]) =>
            new platform(WORKER_PREFIX + String(name)),
    },
);

const locks = globalThis.navigator.locks;
const platformRequest = locks.request.bind(locks) as (
    name: string,
    ...rest: unknown[]
) => Promise<unknown>;
Object.defineProperty(locks, 'request', {
    value: (name: string, ...rest: unknown[]) =>
        platformRequest(WORKER_PREFIX + name, ...rest),
});

export {};
