// Two clients in one realm share the origin's refresh lock
// and peer channel: cross-tab coordination for one stored
// credential. These pins claim the instance's own flight
// and bearer, so they run without either, and so never
// wait on, or hear, another test file's refresh.
export async function withoutCrossTabRefresh(
    body: () => Promise<void>,
): Promise<void> {
    const channel = Object.getOwnPropertyDescriptor(
        globalThis, 'BroadcastChannel',
    )!;
    Object.defineProperty(navigator, 'locks', {
        value: undefined, configurable: true,
    });
    Object.defineProperty(globalThis, 'BroadcastChannel', {
        value: undefined, configurable: true, writable: true,
    });
    try {
        await body();
    } finally {
        delete (navigator as { locks?: unknown }).locks;
        Object.defineProperty(
            globalThis, 'BroadcastChannel', channel,
        );
    }
}
