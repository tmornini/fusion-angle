import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    latestByKey,
    findFirstByKey,
} from '../shared/ledger-reduction.ts';
import { encodeIdentifier } from
    '../shared/identifier.ts';

const row = (key: string, at: string, id: string) => ({
    key, at, id,
});

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

test('latestByKey keeps the latest row per key', () => {
    const xBytes = new Uint8Array(16);
    const yBytes = new Uint8Array(16);
    yBytes[0] = 1;
    const zBytes = new Uint8Array(16);
    zBytes[0] = 2;
    const x = encodeIdentifier(xBytes);
    const y = encodeIdentifier(yBytes);
    const z = encodeIdentifier(zBytes);
    const rows = [
        row('a', T1, x),
        row('a', T2, y),
        row('b', T1, z),
    ];
    const latest = latestByKey(rows, r => r.key);
    assert.equal(latest.size, 2);
    assert.equal(latest.get('a')?.id, y);
    assert.equal(latest.get('b')?.id, z);
});

test('latestByKey compares by `at`, not array order', () => {
    const lateBytes = new Uint8Array(16);
    lateBytes[0] = 1;
    const earlyBytes = new Uint8Array(16);
    earlyBytes[0] = 2;
    const late = encodeIdentifier(lateBytes);
    const early = encodeIdentifier(earlyBytes);
    const rows = [
        row('a', T2, late),
        row('a', T1, early),
    ];
    assert.equal(
        latestByKey(rows, r => r.key).get('a')?.id, late);
});

test('an equal-`at` tie elects the digit-value larger id',
() => {
    const asciiLargerBytes = new Uint8Array(16);
    asciiLargerBytes[0] = 0 << 2;
    const digitLargerBytes = new Uint8Array(16);
    digitLargerBytes[0] = 62 << 2;
    const asciiLarger = encodeIdentifier(asciiLargerBytes);
    const digitLarger = encodeIdentifier(digitLargerBytes);
    assert.ok(asciiLarger > digitLarger);
    const first = row('a', T1, asciiLarger);
    const second = row('a', T1, digitLarger);
    assert.equal(
        latestByKey([first, second], r => r.key)
            .get('a')?.id,
        digitLarger);
    assert.equal(
        latestByKey([second, first], r => r.key)
            .get('a')?.id,
        digitLarger);
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
    const id3Bytes = new Uint8Array(16);
    id3Bytes[0] = 3;
    const id1Bytes = new Uint8Array(16);
    id1Bytes[0] = 1;
    const id2Bytes = new Uint8Array(16);
    id2Bytes[0] = 2;
    const id9Bytes = new Uint8Array(16);
    id9Bytes[0] = 9;
    const id3 = encodeIdentifier(id3Bytes);
    const id1 = encodeIdentifier(id1Bytes);
    const id2 = encodeIdentifier(id2Bytes);
    const id9 = encodeIdentifier(id9Bytes);
    const rows = [
        row('a', T1, id3),
        row('a', T2, id1),
        row('a', T1, id2),
        row('b', T1, id9),
    ];
    for (const perm of permutations(rows)) {
        const latest = latestByKey(perm, r => r.key);
        assert.equal(latest.get('a')?.id, id1);
        assert.equal(latest.get('b')?.id, id9);
    }
});

test('an explicit comparator overrides the default', () => {
    const id1Bytes = new Uint8Array(16);
    id1Bytes[0] = 1;
    const id2Bytes = new Uint8Array(16);
    id2Bytes[0] = 2;
    const id1 = encodeIdentifier(id1Bytes);
    const id2 = encodeIdentifier(id2Bytes);
    const rows = [
        row('a', T1, id1),
        row('a', T1, id2),
    ];
    const latest = latestByKey(
        rows, r => r.key, (a, b) => a.at > b.at);
    assert.equal(latest.get('a')?.id, id1);
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
