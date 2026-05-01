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

const STORAGE_KEY_PREFIX = 'fusion-ai:';
const TOMBSTONE_KEY =
    STORAGE_KEY_PREFIX + 'deleted';

export function bridgeStorageToChannel(
    tableNames: readonly string[],
    channel: Channel<void>,
): void {
    if (typeof window === 'undefined') return;
    const watchedKeys = new Set(
        tableNames.map(
            t => STORAGE_KEY_PREFIX + t,
        ),
    );
    window.addEventListener(
        'storage',
        (e) => {
            if (e.key === null) return;
            if (
                watchedKeys.has(e.key)
                || e.key === TOMBSTONE_KEY
            ) {
                channel.send();
            }
        },
    );
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
