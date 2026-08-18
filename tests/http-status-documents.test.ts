import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_DOCUMENTS } from
    '../api/http-status-documents.ts';

test('401 is the one invalid_token shape', () => {
    const row = STATUS_DOCUMENTS.find((d) => d.code === 401);
    assert.deepEqual(row?.body, { error: 'invalid_token' });
});

test('codes are unique and sorted', () => {
    const codes = STATUS_DOCUMENTS.map((d) => d.code);
    assert.deepEqual(codes, [...codes].sort((a, b) => a - b));
    assert.equal(new Set(codes).size, codes.length);
});
