import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathSegmentsOf } from
    '../api/path-segments.ts';

test('collection slash keeps a trailing empty',
() => {
    assert.deepEqual(
        pathSegmentsOf('/identities/'),
        ['identities', ''],
    );
});

test('slashless collection has no empty', () => {
    assert.deepEqual(
        pathSegmentsOf('/identities'),
        ['identities'],
    );
});

test('item has no trailing empty', () => {
    assert.deepEqual(
        pathSegmentsOf('/identities/abc'),
        ['identities', 'abc'],
    );
});

test('item with trailing slash keeps empty',
() => {
    assert.deepEqual(
        pathSegmentsOf('/identities/abc/'),
        ['identities', 'abc', ''],
    );
});

test('root is empty', () => {
    assert.deepEqual(pathSegmentsOf('/'), []);
});
