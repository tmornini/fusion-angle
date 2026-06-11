import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createChannel,
    createSubscriptionChannel,
} from '../web-app/app/channels.ts';

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

test('a watch on an unknown table name throws at creation',
() => {
    // the bell posts snake_case store names; a kebab-case
    // API-resource name could never match — crash, don't
    // subscribe to silence
    assert.throws(
        () => createSubscriptionChannel(['work-orders']),
        /unknown table in cross-tab watch: work-orders/,
    );
});

test('a watch on canonical table names is accepted', () => {
    const ch = createSubscriptionChannel(
        ['work_orders', 'states'],
    );
    let fired = 0;
    ch.subscribe(() => { fired += 1; });
    ch.notify();
    assert.equal(fired, 1);
});
