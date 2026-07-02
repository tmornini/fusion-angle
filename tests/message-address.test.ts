import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    messageAddress,
} from '../api/message-address.ts';

test('an id route splits prefix and id', () => {
    const a = messageAddress(
        ['ideas', ':id'],
        ['ideas', '42'],
    );
    assert.equal(a.uriPrefix, '/ideas/');
    assert.equal(a.uriId, '42');
});

test('a collection route has the empty id', () => {
    const a = messageAddress(['ideas'], ['ideas']);
    assert.equal(a.uriPrefix, '/ideas/');
    assert.equal(a.uriId, '');
});

test('a nested id route keeps the parent in the prefix',
() => {
    const a = messageAddress(
        ['ideas', ':id', 'submissions', ':sid'],
        ['ideas', '42', 'submissions', '7'],
    );
    assert.equal(a.uriPrefix, '/ideas/42/submissions/');
    assert.equal(a.uriId, '7');
});

test('an operation route is collection-shaped', () => {
    // POST ideas/:id/conversion — trailing literal segment
    const a = messageAddress(
        ['ideas', ':id', 'conversion'],
        ['ideas', '42', 'conversion'],
    );
    assert.equal(a.uriPrefix, '/ideas/42/conversion/');
    assert.equal(a.uriId, '');
});
