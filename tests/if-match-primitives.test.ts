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
    documentVersion,
    HEX64,
} from '../api/message-form.ts';
import { Octets } from '../shared/http-message/octets.ts';

// Task 8: wire ETag / If-Match are quoted 64-hex. Pair id
// stays Response-ID. parseIfMatch rejects anything else.

const TAG =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('HTTP_PRECONDITION_REQUIRED is 428', () => {
    assert.equal(HTTP_PRECONDITION_REQUIRED, 428);
});

test('parseIfMatch accepts one quoted 64-hex', () => {
    assert.equal(parseIfMatch('"' + TAG + '"'), TAG);
});

test('parseIfMatch rejects a quoted pair id', () => {
    assert.equal(
        parseIfMatch('"pair-1"'), undefined,
    );
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

test('strongEtagOf quotes the 64-hex', () => {
    assert.equal(strongEtagOf(TAG), '"' + TAG + '"');
});

test('attachEtag sets ETag on Response.json and'
+ ' returns the same Response', () => {
    const response = Response.json({ ok: true });
    const out = attachEtag(response, TAG);
    assert.equal(out, response);
    assert.equal(out.headers.get('ETag'), '"' + TAG + '"');
});

test('documentVersion hashes body octets only',
async () => {
    const body = Octets.fromLatin1('{"n":1}');
    const a = await documentVersion(body.asBytes());
    const b = await documentVersion(body.asBytes());
    assert.equal(a, b);
    assert.match(a, HEX64);
    const later = await documentVersion(
        body.asBytes(), a,
    );
    assert.notEqual(later, a);
});

test('A then B then A on unconditional revives A',
async () => {
    const a = await documentVersion(
        Octets.fromLatin1('A').asBytes(),
    );
    const again = await documentVersion(
        Octets.fromLatin1('A').asBytes(),
    );
    assert.equal(again, a);
});

test('A then B then A on conditional does not revive A',
async () => {
    const tagA = await documentVersion(
        Octets.fromLatin1('A').asBytes(),
    );
    const tagB = await documentVersion(
        Octets.fromLatin1('B').asBytes(), tagA,
    );
    const tagA2 = await documentVersion(
        Octets.fromLatin1('A').asBytes(), tagB,
    );
    assert.notEqual(tagA2, tagA);
});
