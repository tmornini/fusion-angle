import {
    subscribeTablesChanged,
} from './adapters/broadcast-channel.ts';
import { TABLE_NAMES } from '../../api/db.ts';

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

// The bell posts canonical snake_case store names, so a watch
// entry outside TABLE_NAMES can NEVER match — a silently dead
// subscription. Channels are created at module load, so a
// wrong name crashes the page immediately instead of never
// firing.
const KNOWN_TABLES: ReadonlySet<string> =
    new Set(TABLE_NAMES);

export function createSubscriptionChannel(
    tableNames: readonly string[],
): SubscriptionChannel {
    for (const name of tableNames) {
        if (!KNOWN_TABLES.has(name)) {
            throw new Error(
                'unknown table in cross-tab watch: '
                + name,
            );
        }
    }
    const channel = createChannel<void>();
    const watched = new Set(tableNames);
    // Another tab's readwrite commit broadcasts the tables it
    // touched; refresh when any overlaps ours. The poster's
    // own tab never hears the message, so it does not
    // double-refresh.
    subscribeTablesChanged((tables) => {
        if (tables.some(t => watched.has(t))) {
            channel.send();
        }
    });
    return {
        notify: () => channel.send(),
        subscribe: (fn) =>
            channel.subscribe(fn),
    };
}
