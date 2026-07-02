import {
    subscribeNotificationEvents,
} from './adapters/broadcast-channel.ts';
import {
    getSessionToken,
    sessionIsAuthenticated,
    sessionIsOrganizationScoped,
    sessionTokenIsSeeded,
} from './adapters/init.ts';
import {
    principalFromToken,
} from '../../api/access-token.ts';

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

export function createSubscriptionChannel(
): SubscriptionChannel {
    const channel = createChannel<void>();
    // A full-refresh event always fires; otherwise a scoped
    // event fires when it names this tab's active organization
    // (org-scoped sessions) or this tab's own identity
    // (authenticated sessions) — the poster's own tab never
    // hears the message, so it does not double-refresh. This
    // subscription is wired at module load, before boot has
    // seeded the session token — a scoped event from another
    // tab can arrive first. Unseeded means neither org-scoped
    // nor authenticated, so it cannot match; return before the
    // token read that would otherwise throw.
    subscribeNotificationEvents((event) => {
        if (event.kind === 'full') {
            channel.send();
            return;
        }
        if (!sessionTokenIsSeeded()) {
            return;
        }
        const principal =
            principalFromToken(getSessionToken());
        const organizationHit =
            sessionIsOrganizationScoped()
            && principal.organization !== undefined
            && event.organizationIds
                .includes(principal.organization);
        const identityHit =
            sessionIsAuthenticated()
            && event.identityIds.includes(principal.id);
        if (organizationHit || identityHit) {
            channel.send();
        }
    });
    return {
        notify: () => channel.send(),
        subscribe: (fn) =>
            channel.subscribe(fn),
    };
}
