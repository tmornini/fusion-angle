import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';

const NULL_STORAGE: Partial<Storage> = {
    getItem: () => null,
    setItem: () => {},
};

// Every subscribe<Entity>Changes delegates to
// createSubscriptionChannel → createChannel, whose subscribe
// only adds to a Set: nothing fires until a bell.
// subscribeOnce's `const unsubscribe = subscribe(...)` would
// be a TDZ ReferenceError under a synchronous replay, so
// this pin reads every such export from the adapter index —
// a fourteenth is covered the day it lands. Stubs land
// before the import: the module graph reads theme/session
// state at load.
Deno.test(
    'every adapter subscription is silent until a bell',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const g = globalThis as Record<string, unknown>;
        g['window'] = {
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        g['document'] = { addEventListener: () => {} };
        try {
            const adapters = await import(
                '../web-app/app/adapters/index.ts'
            ) as Record<string, unknown>;
            const { subscribeOnce } = await import(
                '../web-app/app/channels.ts'
            );
            const names = Object.keys(adapters)
                .filter(name => /^subscribe\w+Changes$/.test(name))
                .sort();
            assert(names.length > 0, 'no subscriptions found');
            for (const name of names) {
                const subscribe = adapters[name] as (
                    fn: () => void,
                ) => () => void;
                let fired = false;
                const errors: unknown[] = [];
                subscribeOnce(
                    subscribe,
                    () => { fired = true; },
                    err => { errors.push(err); },
                );
                assertStrictEquals(
                    fired, false, name + ' fired before a bell',
                );
                assertEquals(errors, [], name + ' errored');
            }
        } finally {
            const { deleteNotificationChannel } = await import(
                '../web-app/app/adapters/broadcast-channel.ts'
            );
            deleteNotificationChannel();
            delete g['window'];
            delete g['document'];
        }
    }),
);
