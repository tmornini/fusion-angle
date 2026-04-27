import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createChannel,
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
    const unsub = ch.subscribe(() => {});
    unsub();
    unsub();
    ch.send();
});

test('send with no subscribers is a no-op', () => {
    const ch = createChannel<number>();
    ch.send(1);
});
