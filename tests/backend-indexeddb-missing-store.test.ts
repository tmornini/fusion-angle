import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    firstMissingStore,
} from '../api/backend-indexeddb.ts';

// A db.transaction() naming an absent object store throws an
// opaque DOMException ("object store not found"). firstMissingStore
// names the culprit so the backend can raise a typed
// MissingTableError the boot path routes to snapshots recovery,
// instead of the opaque platform error that dead-ends.
test('firstMissingStore names the first absent store', () => {
    const present = new Set(['states', '__schema__']);
    const available = { contains: (n: string) => present.has(n) };
    assert.equal(
        firstMissingStore(available, ['states', 'records']),
        'records');
});

test('firstMissingStore is undefined when all stores exist',
() => {
    const present = new Set(['states', '__schema__']);
    const available = { contains: (n: string) => present.has(n) };
    assert.equal(
        firstMissingStore(available, ['states', '__schema__']),
        undefined);
});
