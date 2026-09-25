import {
    postNotificationEvent,
    subscribeNamedNotificationEvents,
    subscribeNotificationEvents,
} from '../../client/broadcast-channel.ts';
import {
    getSessionToken,
    sessionIsAuthenticated,
    sessionTokenIsSeeded,
} from '../../client/session-token.ts';
import {
    principalFromToken,
} from '../../shared/access-token-decode.ts';
import type {
    NotificationEvent,
} from '../../shared/notifications.ts';

type Listener<T> = (value: T) => void;

export interface Channel<T> {
    send(value: T): void;
    subscribe(
        fn: Listener<T>,
    ): () => void;
}

export function createChannel<T>(
): Channel<T> {
    const subs = new Set<Listener<T>>();
    return {
        send(value: T): void {
            for (const fn of subs) {
                fn(value);
            }
        },
        subscribe(
            fn: Listener<T>,
        ): () => void {
            subs.add(fn);
            return () => {
                subs.delete(fn);
            };
        },
    };
}

export interface SubscriptionChannel {
    notify(): void;
    subscribe(
        fn: () => void,
    ): () => void;
}

function eventForThisTab(): NotificationEvent {
    if (!sessionTokenIsSeeded()) {
        return { kind: 'full' };
    }
    try {
        const principal =
            principalFromToken(getSessionToken());
        const organizationIds =
            principal.organization !== undefined
                ? [principal.organization]
                : [...(principal.organizations ?? [])];
        const identityIds = sessionIsAuthenticated()
            ? [principal.id]
            : [];
        return {
            kind: 'scoped',
            organizationIds,
            identityIds,
        };
    } catch {
        return { kind: 'full' };
    }
}

// A full event always matches. A scoped event matches this
// tab's active organization, a reachable org on a flat
// session, or this tab's own identity. Unseeded means
// neither org-scoped nor authenticated, so it cannot match;
// return before the token read that would otherwise throw.
function notificationMatchesSession(
    event: NotificationEvent,
): boolean {
    if (event.kind === 'full') return true;
    if (!sessionTokenIsSeeded()) return false;
    try {
        const principal =
            principalFromToken(getSessionToken());
        // Active org claim wins when present
        // (post-exchange). A flat login token has only
        // `organizations`; the message-plane fence still
        // serves the default org, so match any
        // reachable org the event names.
        const organizationHit =
            principal.organization !== undefined
                ? event.organizationIds.includes(
                    principal.organization,
                )
                : sessionIsAuthenticated()
                    && (principal.organizations ?? [])
                        .some(id =>
                            event.organizationIds
                                .includes(id));
        const identityHit =
            sessionIsAuthenticated()
            && event.identityIds.includes(
                principal.id,
            );
        return organizationHit || identityHit;
    } catch {
        return false;
    }
}

export function createSubscriptionChannel(
): SubscriptionChannel {
    const channel = createChannel<void>();
    // Wired at module load, before boot has seeded the
    // session token — a scoped event from another tab can
    // arrive first. The poster's own tab never hears its
    // BroadcastChannel message, so notify() also sends
    // locally; that local send is the same-tab paint.
    subscribeNotificationEvents((event) => {
        if (notificationMatchesSession(event)) {
            channel.send();
        }
    });
    return {
        notify: () => {
            channel.send();
            postNotificationEvent(eventForThisTab());
        },
        subscribe: (fn) =>
            channel.subscribe(fn),
    };
}

// A shimmed window may name a private bus. Absent, the
// shared fusion-angle:data channel is the product bus.
function privateDataChannel(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    const name = (window as {
        fusionAngleDataChannel?: unknown;
    }).fusionAngleDataChannel;
    return typeof name === 'string' && name !== ''
        ? name
        : undefined;
}

function crossTabSubscribe(
    name: string | undefined,
): (fn: () => void) => () => void {
    return (fn) => {
        const deliver = (
            event: NotificationEvent,
        ): void => {
            if (notificationMatchesSession(event)) {
                fn();
            }
        };
        if (name === undefined) {
            return subscribeNotificationEvents(deliver);
        }
        return subscribeNamedNotificationEvents(
            name, deliver,
        );
    };
}

// Captures the bus synchronously. A later await must
// not retarget the empty list onto another file's
// window. Same-tab notify() is not on this bus.
export function bindCrossTab(
): (fn: () => void) => () => void {
    return crossTabSubscribe(privateDataChannel());
}

// One-shot subscription: the first event tears the
// subscription down, then runs fn. Serves the empty
// list pages (SV8b): an empty initial load wires no
// steady-state subscriber, so the first change bell
// re-runs init — which either wires the steady state
// (data now) or re-renders empty and re-arms. Teardown
// precedes fn, so the steady-state subscription fn
// wires never coexists with the one-shot. fn runs
// synchronously inside the bell; a throw or a rejection
// reaches onError — the caller decides what a failed
// re-init looks like, never the global handler's toast.
export function subscribeOnce(
    subscribe: (fn: () => void) => () => void,
    fn: () => void | Promise<void>,
    onError: (err: unknown) => void,
): void {
    const unsubscribe = subscribe(() => {
        unsubscribe();
        new Promise<void>((resolve) => {
            resolve(fn());
        }).catch(onError);
    });
}
