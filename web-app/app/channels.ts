import {
    STORAGE_KEY_PREFIX,
} from './storage-keys.ts';
import {
    subscribeStorageEvent,
} from './adapters/storage-event.ts';

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

export function bridgeStorageToChannel(
    tableNames: readonly string[],
    channel: Channel<void>,
): void {
    const watchedKeys = new Set(
        tableNames.map(
            t => STORAGE_KEY_PREFIX + t,
        ),
    );
    subscribeStorageEvent((e) => {
        if (e.key === null) return;
        if (watchedKeys.has(e.key)) {
            channel.send();
        }
    });
}

export interface SubscriptionChannel {
    notify(): void;
    subscribe(
        fn: () => void,
    ): () => void;
}

export function createSubscriptionChannel(
    tableNames: readonly string[],
): SubscriptionChannel {
    const channel = createChannel<void>();
    bridgeStorageToChannel(tableNames, channel);
    return {
        notify: () => channel.send(),
        subscribe: (fn) =>
            channel.subscribe(fn),
    };
}
