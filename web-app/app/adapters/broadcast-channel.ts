// The ONLY place BroadcastChannel is named — the divorce
// point for cross-tab data notification, against the day the
// platform evolves. Inert without a browser: Node ships a
// BroadcastChannel (for worker threads), so absence can't be
// the guard; we key on `window`, so post/subscribe are no-ops
// under `node --test` and never hold the process open.

import {
    subscribeEventListener,
} from './event-listener.ts';
import type {
    NotificationEvent,
} from '../../../api/notifications.ts';
import {
    notificationEventFromWire,
} from '../../../api/notifications.ts';

const CHANNEL_NAME = 'fusion-ai:data';

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

// Announce a scoped (or full) notification event. Other tabs'
// subscribers fire; BroadcastChannel does not echo to the
// poster, so the originating tab never double-refreshes.
export function postNotificationEvent(
    event: NotificationEvent,
): void {
    getChannel()?.postMessage(event);
}

// Subscribe to cross-tab notification events; returns an
// unsubscribe function.
export function subscribeNotificationEvents(
    handler: (event: NotificationEvent) => void,
): () => void {
    const ch = getChannel();
    if (ch === undefined) return () => {};
    const listener = (event: MessageEvent): void => {
        handler(notificationEventFromWire(event.data));
    };
    return subscribeEventListener(ch, 'message', listener);
}
