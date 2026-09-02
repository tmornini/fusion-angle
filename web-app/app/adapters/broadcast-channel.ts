// The ONLY place BroadcastChannel is named — the divorce
// point for cross-tab data notification, against the day the
// platform evolves. Inert without a browser: Deno ships a
// BroadcastChannel of its own, so absence can't be the guard;
// we key on `window`, so post/subscribe are no-ops under
// `deno test` unless a test shims `window`. One that does
// releases the handle through deleteNotificationChannel.

import {
    subscribeEventListener,
} from './event-listener.ts';
import type {
    NotificationEvent,
} from '../../../api/notifications.ts';
import {
    notificationEventFromWire,
} from '../../../api/notifications.ts';

const CHANNEL_NAME = 'fusion-angle:data';

let channel: BroadcastChannel | undefined;

// Handlers fan out from ONE native listener on the singleton
// channel: the platform sees a single listener however many
// module-level subscription channels the app wires (Node's
// EventTarget warns past ten), and the wire decode runs once
// per message instead of once per subscriber.
const handlers = new Set<
    (event: NotificationEvent) => void
>();

function dispatch(event: MessageEvent): void {
    const decoded =
        notificationEventFromWire(event.data);
    for (const handler of handlers) {
        handler(decoded);
    }
}

function getChannel(): BroadcastChannel | undefined {
    if (typeof window === 'undefined') return undefined;
    if (channel === undefined) {
        channel = new BroadcastChannel(CHANNEL_NAME);
        subscribeEventListener(
            channel, 'message', dispatch,
        );
    }
    return channel;
}

// A tab releases its channel at unload; a test process has
// no unload, so the divorce point offers the release
// explicitly. getChannel reopens lazily and re-registers
// dispatch on the new handle, so the subscribers survive.
export function deleteNotificationChannel(): void {
    channel?.close();
    channel = undefined;
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
    if (getChannel() === undefined) return () => {};
    handlers.add(handler);
    return () => {
        handlers.delete(handler);
    };
}
