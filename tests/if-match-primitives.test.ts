import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    HTTP_PRECONDITION_REQUIRED,
} from '../api/http-errors.ts';
import {
    parseIfMatch,
    strongEtagOf,
    attachEtag,
} from '../api/message-pair.ts';

// Task 11: pure If-Match / ETag primitives + 428 status.
// Wire ETag is the head pair response id, strong-quoted.
// parseIfMatch accepts only exactly one strong etag;
// * / lists / weak / unquoted → undefined (caller 400s).

test('HTTP_PRECONDITION_REQUIRED is 428', () => {
    assert.equal(HTTP_PRECONDITION_REQUIRED, 428);
});

test('parseIfMatch: single strong etag → opaque tag',
() => {
    assert.equal(parseIfMatch('"abc"'), 'abc');
});

test('parseIfMatch: * → undefined (caller 400s)', () => {
    assert.equal(parseIfMatch('*'), undefined);
});

test('parseIfMatch: list → undefined', () => {
    assert.equal(parseIfMatch('"a", "b"'), undefined);
});

test('parseIfMatch: weak → undefined', () => {
    assert.equal(parseIfMatch('W/"abc"'), undefined);
});

test('parseIfMatch: unquoted → undefined', () => {
    assert.equal(parseIfMatch('abc'), undefined);
});

test('strongEtagOf wraps pair id in double quotes', () => {
    assert.equal(strongEtagOf('x'), '"x"');
});

test('attachEtag sets ETag on Response.json and'
+ ' returns the same Response', () => {
    const response = Response.json({ ok: true });
    const out = attachEtag(response, 'pair-1');
    assert.equal(out, response);
    assert.equal(out.headers.get('ETag'), '"pair-1"');
});
