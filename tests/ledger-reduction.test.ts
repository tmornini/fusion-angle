import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    latestByKey,
    findFirstByKey,
} from '../api/ledger-reduction.ts';

const row = (key: string, at: string, id: string) => ({
    key, at, id,
});

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

test('latestByKey keeps the latest row per key', () => {
    const rows = [
        row('a', T1, 'x'),
        row('a', T2, 'y'),
        row('b', T1, 'z'),
    ];
    const latest = latestByKey(rows, r => r.key);
    assert.equal(latest.size, 2);
    assert.equal(latest.get('a')?.id, 'y');
    assert.equal(latest.get('b')?.id, 'z');
});

test('latestByKey compares by `at`, not array order', () => {
    const rows = [
        row('a', T2, 'late'),
        row('a', T1, 'early'),   // earlier stamp, later in array
    ];
    assert.equal(
        latestByKey(rows, r => r.key).get('a')?.id, 'late');
});

test('an equal-`at` tie falls to the larger id, either order',
() => {
    const first = row('a', T1, 'id-1');
    const second = row('a', T1, 'id-2');
    assert.equal(
        latestByKey([first, second], r => r.key)
            .get('a')?.id,
        'id-2');
    assert.equal(
        latestByKey([second, first], r => r.key)
            .get('a')?.id,
        'id-2');
});

// Every permutation of the same rows must elect the same
// winner — the (at, id) pair is a TOTAL order, so the reduce
// is row-order-blind on every backend.
function permutations<T>(items: readonly T[]): T[][] {
    if (items.length <= 1) return [[...items]];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i++) {
        const rest = [
            ...items.slice(0, i),
            ...items.slice(i + 1),
        ];
        for (const tail of permutations(rest)) {
            out.push([items[i]!, ...tail]);
        }
    }
    return out;
}

test('every row permutation elects the same winner', () => {
    const rows = [
        row('a', T1, 'id-3'),
        row('a', T2, 'id-1'),   // latest at, smallest id
        row('a', T1, 'id-2'),
        row('b', T1, 'id-9'),
    ];
    for (const perm of permutations(rows)) {
        const latest = latestByKey(perm, r => r.key);
        assert.equal(latest.get('a')?.id, 'id-1');
        assert.equal(latest.get('b')?.id, 'id-9');
    }
});

test('an explicit comparator overrides the default', () => {
    const rows = [
        row('a', T1, 'id-1'),
        row('a', T1, 'id-2'),
    ];
    const latest = latestByKey(
        rows, r => r.key, (a, b) => a.at > b.at);
    assert.equal(latest.get('a')?.id, 'id-1');
});

test('latestByKey returns an empty map for no rows', () => {
    const rows: { key: string; at: string; id: string }[] = [];
    assert.equal(latestByKey(rows, r => r.key).size, 0);
});

test('findFirstByKey extracts a field from the first match', () => {
    const rows = [
        { id: 'a', name: 'Ann' },
        { id: 'b', name: 'Bob' },
    ];
    assert.equal(
        findFirstByKey(rows, r => r.id === 'b', r => r.name),
        'Bob');
});

test('findFirstByKey returns null when nothing matches', () => {
    const rows = [{ id: 'a', name: 'Ann' }];
    assert.equal(
        findFirstByKey(rows, r => r.id === 'z', r => r.name),
        null);
});

test('findFirstByKey returns the first of several matches', () => {
    const rows = [
        { id: 'a', name: 'first' },
        { id: 'a', name: 'second' },
    ];
    assert.equal(
        findFirstByKey(rows, r => r.id === 'a', r => r.name),
        'first');
});
