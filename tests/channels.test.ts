// The scoped-notification matching logic lives inside the
// callback createSubscriptionChannel registers with
// subscribeNotificationEvents, so exercising it needs a REAL
// BroadcastChannel — shim `window` (the adapter's browser
// guard) so the divorce point's getChannel() creates one via
// Node's global BroadcastChannel (worker_threads).
// @ts-expect-error — Node global stub
globalThis.window = {};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createChannel,
    createSubscriptionChannel,
} from '../web-app/app/channels.ts';
import {
    putSessionToken,
    deleteSessionToken,
} from '../web-app/app/adapters/init.ts';
import {
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';

test('subscribe receives subsequent send', () => {
    const ch = createChannel<number>();
    let received: number | null = null;
    ch.subscribe(v => { received = v; });
    ch.send(42);
    assert.equal(received, 42);
});

test('multiple subscribers all receive', () => {
    const ch = createChannel<string>();
    const seen: string[] = [];
    ch.subscribe(v => seen.push('a:' + v));
    ch.subscribe(v => seen.push('b:' + v));
    ch.send('hi');
    assert.deepEqual(
        seen,
        ['a:hi', 'b:hi'],
    );
});

test('unsubscribe stops delivery', () => {
    const ch = createChannel<number>();
    let count = 0;
    const unsub = ch.subscribe(() => {
        count += 1;
    });
    ch.send(1);
    unsub();
    ch.send(2);
    assert.equal(count, 1);
});

test('subscribe after send does not get past values', () => {
    const ch = createChannel<number>();
    ch.send(1);
    let received: number | null = null;
    ch.subscribe(v => { received = v; });
    assert.equal(received, null);
});

test('unsubscribe is idempotent', () => {
    const ch = createChannel<void>();
    let survivorCalls = 0;
    const unsub = ch.subscribe(() => {});
    ch.subscribe(() => { survivorCalls += 1; });
    unsub();
    unsub();
    ch.send();
    // the second unsubscribe must not evict the
    // other subscriber
    assert.equal(survivorCalls, 1);
});

test('send with no subscribers is a no-op', () => {
    const ch = createChannel<number>();
    assert.doesNotThrow(() => ch.send(1));
});

// The notification matching-behavior suite below posts from a
// SEPARATE BroadcastChannel object sharing the same name — the
// same-object exclusion (BroadcastChannel never echoes to its
// own poster) means the module's own postNotificationEvent
// cannot reach a subscriber created in the same process, so a
// second handle mirrors another tab posting the event.
const CHANNEL_NAME = 'fusion-ai:data';

async function deliver(): Promise<void> {
    // BroadcastChannel delivery is asynchronous; a handful of
    // macrotask turns flushes it reliably (mirrors the drain
    // loop in tests/command-palette-init.test.ts).
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setImmediate(resolve));
    }
}

test('a full event fires regardless of session', async () => {
    const ch = createSubscriptionChannel();
    let fired = 0;
    ch.subscribe(() => { fired += 1; });
    const poster = new BroadcastChannel(CHANNEL_NAME);
    poster.postMessage({ kind: 'full' });
    await deliver();
    poster.close();
    assert.equal(fired, 1);
});

test(
    'a full event fires during an unseeded session',
    async () => {
        // Mirrors the boot-time race: another tab posts before
        // this tab's postSessionSeed() has run.
        deleteSessionToken();
        const ch = createSubscriptionChannel();
        let fired = 0;
        ch.subscribe(() => { fired += 1; });
        const poster = new BroadcastChannel(CHANNEL_NAME);
        poster.postMessage({ kind: 'full' });
        await deliver();
        poster.close();
        assert.equal(fired, 1);
    },
);

test(
    'a scoped event during an unseeded session does not throw'
    + ' and does not fire',
    async () => {
        deleteSessionToken();
        const ch = createSubscriptionChannel();
        let fired = 0;
        ch.subscribe(() => { fired += 1; });
        const poster = new BroadcastChannel(CHANNEL_NAME);
        poster.postMessage({
            kind: 'scoped',
            organizationIds: ['1'],
            identityIds: ['current'],
        });
        await deliver();
        poster.close();
        assert.equal(fired, 0);
    },
);

test(
    'a scoped event naming the active organization fires',
    async () => {
        putSessionToken(
            await organizationToken('current', '1'),
        );
        const ch = createSubscriptionChannel();
        let fired = 0;
        ch.subscribe(() => { fired += 1; });
        const poster = new BroadcastChannel(CHANNEL_NAME);
        poster.postMessage({
            kind: 'scoped',
            organizationIds: ['1'],
            identityIds: [],
        });
        await deliver();
        poster.close();
        assert.equal(fired, 1);
    },
);

test('a scoped event naming this identity fires', async () => {
    putSessionToken(await reachableToken('current', []));
    const ch = createSubscriptionChannel();
    let fired = 0;
    ch.subscribe(() => { fired += 1; });
    const poster = new BroadcastChannel(CHANNEL_NAME);
    poster.postMessage({
        kind: 'scoped',
        organizationIds: [],
        identityIds: ['current'],
    });
    await deliver();
    poster.close();
    assert.equal(fired, 1);
});

test(
    'a scoped event naming neither is a miss',
    async () => {
        putSessionToken(
            await organizationToken('current', '1'),
        );
        const ch = createSubscriptionChannel();
        let fired = 0;
        ch.subscribe(() => { fired += 1; });
        const poster = new BroadcastChannel(CHANNEL_NAME);
        poster.postMessage({
            kind: 'scoped',
            organizationIds: ['2'],
            identityIds: ['someone-else'],
        });
        await deliver();
        poster.close();
        assert.equal(fired, 0);
    },
);
