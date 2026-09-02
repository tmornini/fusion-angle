import { assertStrictEquals } from '@std/assert';
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

Deno.test('HTTP_PRECONDITION_REQUIRED is 428', () => {
    assertStrictEquals(HTTP_PRECONDITION_REQUIRED, 428);
});

Deno.test('parseIfMatch rejects a quoted 64-hex', () => {
    assertStrictEquals(
        parseIfMatch('"' + TAG + '"'),
        undefined,
    );
});

Deno.test('parseIfMatch accepts a quoted identifier', () => {
    const id = generateIdentifier();
    assertStrictEquals(isIdentifier(id), true);
    assertStrictEquals(parseIfMatch('"' + id + '"'), id);
});

Deno.test('parseIfMatch: * → undefined (caller 400s)', () => {
    assertStrictEquals(parseIfMatch('*'), undefined);
});

Deno.test('parseIfMatch: list → undefined', () => {
    assertStrictEquals(parseIfMatch('"a", "b"'), undefined);
});

Deno.test('parseIfMatch: weak → undefined', () => {
    assertStrictEquals(parseIfMatch('W/"abc"'), undefined);
});

Deno.test('parseIfMatch: unquoted → undefined', () => {
    assertStrictEquals(parseIfMatch('abc'), undefined);
});

Deno.test('strongEtagOf quotes the tag', () => {
    assertStrictEquals(strongEtagOf(TAG), '"' + TAG + '"');
});

Deno.test('attachEtag sets ETag on Response.json and'
+ ' returns the same Response', () => {
    const response = Response.json({ ok: true });
    const out = attachEtag(response, TAG);
    assertStrictEquals(out, response);
    assertStrictEquals(out.headers.get('ETag'), '"' + TAG + '"');
});
