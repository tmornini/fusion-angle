import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    latestByKey,
    findFirstByKey,
} from '../api/ledger-reduction.ts';

const row = (key: string, at: string, val: string) => ({
    key, at, val,
});

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-02-01T00:00:00.000Z';

test('latestByKey keeps the latest row per key', () => {
    const rows = [
        row('a', T1, 'x'),
        row('a', T2, 'y'),
        row('b', T1, 'z'),
    ];
    const latest = latestByKey(rows, r => r.key);
    assert.equal(latest.size, 2);
    assert.equal(latest.get('a')?.val, 'y');
    assert.equal(latest.get('b')?.val, 'z');
});

test('latestByKey compares by `at`, not array order', () => {
    const rows = [
        row('a', T2, 'late'),
        row('a', T1, 'early'),   // earlier stamp, later in array
    ];
    assert.equal(latestByKey(rows, r => r.key).get('a')?.val, 'late');
});

test('the default tiebreak keeps the later-appended row', () => {
    const rows = [
        row('a', T1, 'first'),
        row('a', T1, 'second'),   // same stamp, appended later
    ];
    assert.equal(
        latestByKey(rows, r => r.key).get('a')?.val, 'second');
});

test('a strict `>` compare keeps the first-appended row', () => {
    const rows = [
        row('a', T1, 'first'),
        row('a', T1, 'second'),   // same stamp, appended later
    ];
    const latest = latestByKey(
        rows, r => r.key, (a, b) => a.at > b.at);
    assert.equal(latest.get('a')?.val, 'first');
});

test('latestByKey returns an empty map for no rows', () => {
    const rows: { key: string; at: string }[] = [];
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
