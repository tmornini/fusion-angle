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
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

// If-Match is one quoted strong validator. parseIfMatch
// rejects *, weak, lists, and unquoted values.

const TAG =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('HTTP_PRECONDITION_REQUIRED is 428', () => {
    assert.equal(HTTP_PRECONDITION_REQUIRED, 428);
});

test('parseIfMatch rejects a quoted 64-hex', () => {
    assert.equal(
        parseIfMatch('"' + TAG + '"'),
        undefined,
    );
});

test('parseIfMatch accepts a quoted identifier', () => {
    const id = generateIdentifier();
    assert.equal(isIdentifier(id), true);
    assert.equal(parseIfMatch('"' + id + '"'), id);
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

test('strongEtagOf quotes the tag', () => {
    assert.equal(strongEtagOf(TAG), '"' + TAG + '"');
});

test('attachEtag sets ETag on Response.json and'
+ ' returns the same Response', () => {
    const response = Response.json({ ok: true });
    const out = attachEtag(response, TAG);
    assert.equal(out, response);
    assert.equal(out.headers.get('ETag'), '"' + TAG + '"');
});
