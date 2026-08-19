// One in-flight refresh POST. Concurrent 401s join this
// promise — they do not start a second coordinator. The
// promise is latched synchronously, before any await, so
// a waiter cannot become a second POST after the first
// settles. Across tabs, navigator.locks serializes and a
// BroadcastChannel carries the winner's access token.

const REFRESH_LOCK = 'fusion-refresh';
const REFRESH_CHANNEL = 'fusion-angle:refresh';

let inFlight: Promise<string | null> | null = null;
let peerAccess: string | null | undefined;
let channel: BroadcastChannel | undefined;

function refreshChannel(): BroadcastChannel | undefined {
    if (channel !== undefined) {
        return channel;
    }
    if (typeof BroadcastChannel !== 'function') {
        return undefined;
    }
    // Node has BroadcastChannel for workers; unref so
    // ./validate is not held open. Browser has no unref.
    channel = new BroadcastChannel(REFRESH_CHANNEL);
    (channel as { unref?: () => void }).unref?.();
    channel.addEventListener('message', (event: MessageEvent) => {
        if (inFlight === null) {
            return;
        }
        const data = event.data as {
            accessToken?: unknown;
        };
        if (typeof data.accessToken === 'string') {
            peerAccess = data.accessToken;
        } else if (data.accessToken === null) {
            peerAccess = null;
        }
    });
    return channel;
}

export function runSingleFlightRefresh(
    refresh: () => Promise<string | null>,
): Promise<string | null> {
    refreshChannel();
    if (inFlight !== null) {
        return inFlight;
    }
    const pending = runLocked(refresh).finally(() => {
        inFlight = null;
        peerAccess = undefined;
    });
    inFlight = pending;
    return pending;
}

async function runLocked(
    refresh: () => Promise<string | null>,
): Promise<string | null> {
    const work = async (): Promise<string | null> => {
        if (peerAccess !== undefined) {
            const taken = peerAccess;
            peerAccess = undefined;
            return taken;
        }
        const result = await refresh();
        const bus = refreshChannel();
        if (bus !== undefined) {
            bus.postMessage({ accessToken: result });
        }
        return result;
    };
    const locks = globalThis.navigator?.locks;
    if (locks === undefined) {
        return work();
    }
    return locks.request(REFRESH_LOCK, work);
}
