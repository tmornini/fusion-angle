// The ONLY place BroadcastChannel is named — the divorce
// point for cross-tab data notification, against the day the
// platform evolves. Inert without a browser: Node ships a
// BroadcastChannel (for worker threads), so absence can't be
// the guard; we key on `window`, so post/subscribe are no-ops
// under `node --test` and never hold the process open.

import {
    subscribeEventListener,
} from './event-listener.ts';

const CHANNEL_NAME = 'fusion-ai:data';

interface TablesMessage {
    readonly tables: readonly string[];
}

let channel: BroadcastChannel | undefined;

function getChannel(): BroadcastChannel | undefined {
    if (typeof window === 'undefined') return undefined;
    if (channel === undefined) {
        channel = new BroadcastChannel(CHANNEL_NAME);
        // A test that shims `window` could reach here under
        // node --test, where BroadcastChannel is a ref'd
        // handle that would keep the runner from exiting.
        // Node's channel exposes unref(); the browser's does
        // not, so this is a no-op in a real tab.
        (channel as unknown as {
            unref?: () => void;
        }).unref?.();
    }
    return channel;
}

// Announce that `tables` changed in this tab. Other tabs'
// subscribers fire; BroadcastChannel does not echo to the
// poster, so the originating tab never double-refreshes.
export function postTablesChanged(
    tables: readonly string[],
): void {
    const message: TablesMessage = { tables };
    getChannel()?.postMessage(message);
}

// Subscribe to cross-tab table-change announcements; returns
// an unsubscribe function.
export function subscribeTablesChanged(
    handler: (tables: readonly string[]) => void,
): () => void {
    const ch = getChannel();
    if (ch === undefined) return () => {};
    const listener = (event: MessageEvent): void => {
        const message = event.data as TablesMessage;
        handler(message.tables);
    };
    return subscribeEventListener(ch, 'message', listener);
}

// Close the channel — called on pagehide / adapter close so a
// reopened connection starts clean.
export function closeBroadcastChannel(): void {
    channel?.close();
    channel = undefined;
}
