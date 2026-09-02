import { assertStrictEquals } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';

const request = HttpMessage.fromWire(
    'GET /search?q=1 HTTP/1.1\r\n' +
    'host: example.com\r\n' +
    'date: Sun, 06 Nov 1994 08:49:37 GMT\r\n' +
    '\r\n',
);

const response = HttpMessage.fromWire(
    'HTTP/1.1 404 Not Found\r\ncontent-length: 2\r\n\r\nhi',
);

const chunked = HttpMessage.fromWire(
    'HTTP/1.1 200 OK\r\n' +
    'transfer-encoding: chunked\r\n' +
    '\r\n' +
    '5\r\nhello\r\n' +
    '0\r\n' +
    'x-sum: z\r\n' +
    '\r\n',
);

Deno.test('queries the request method', () => {
    assertStrictEquals(request.query('method').toText(), 'GET');
});

Deno.test('queries the request target', () => {
    assertStrictEquals(request.query('target').toText(), '/search?q=1');
});

Deno.test('queries the request version', () => {
    assertStrictEquals(request.query('version').toText(), 'HTTP/1.1');
});

Deno.test('a response field is absent on a request', () => {
    assertStrictEquals(request.query('status').exists(), false);
});

Deno.test('queries the response status as a number', () => {
    assertStrictEquals(response.query('status').toNumber(), 404);
});

Deno.test('queries the response reason', () => {
    assertStrictEquals(response.query('reason').toText(), 'Not Found');
});

Deno.test('queries a raw header value', () => {
    assertStrictEquals(
        request.query('header.host').toText(),
        'example.com',
    );
});

Deno.test('queries a date header through toDate', () => {
    assertStrictEquals(
        request.query('header.date').toDate().getTime(),
        Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

Deno.test('an absent header is absent', () => {
    assertStrictEquals(request.query('header.accept').exists(), false);
});

Deno.test('derives content-length from the body', () => {
    assertStrictEquals(
        response.query('header.content-length').toNumber(),
        2,
    );
});

Deno.test('content-length is absent without a body', () => {
    assertStrictEquals(
        request.query('header.content-length').exists(),
        false,
    );
});

Deno.test('derives transfer-encoding when chunked', () => {
    assertStrictEquals(
        chunked.query('header.transfer-encoding').toText(),
        'chunked',
    );
});

Deno.test('content-length is absent for a chunked message', () => {
    assertStrictEquals(
        chunked.query('header.content-length').exists(),
        false,
    );
});

Deno.test('queries a trailer field', () => {
    assertStrictEquals(chunked.query('trailer.x-sum').toText(), 'z');
});

Deno.test('a trailer field is absent when not chunked', () => {
    assertStrictEquals(response.query('trailer.x-sum').exists(), false);
});

const typed = HttpMessage.fromWire(
    'GET / HTTP/1.1\r\n' +
    'content-type: text/html;charset=utf-8\r\n' +
    'accept-encoding: gzip, deflate, br\r\n' +
    'accept: text/html;q=0.8, text/plain\r\n' +
    'x-custom: a=1;b=2\r\n' +
    '\r\n',
);

const cacheable = HttpMessage.fromWire(
    'HTTP/1.1 200 OK\r\n' +
    'cache-control: max-age=3600, no-cache\r\n' +
    '\r\n',
);

Deno.test('queries an item field bare value', () => {
    assertStrictEquals(
        typed.query('header.content-type').toText(),
        'text/html',
    );
});

Deno.test('queries an item field parameter', () => {
    assertStrictEquals(
        typed.query('header.content-type.charset').toText(),
        'utf-8',
    );
});

Deno.test('queries a dictionary member as a number', () => {
    assertStrictEquals(
        cacheable.query('header.cache-control.max-age').toNumber(),
        3600,
    );
});

Deno.test('queries a dictionary boolean member', () => {
    assertStrictEquals(
        cacheable
            .query('header.cache-control.no-cache')
            .toBoolean(),
        true,
    );
});

Deno.test('queries a list member by index', () => {
    assertStrictEquals(
        typed.query('header.accept-encoding.1').toText(),
        'deflate',
    );
});

Deno.test('queries a list member parameter', () => {
    assertStrictEquals(
        typed.query('header.accept.0.q').toNumber(),
        0.8,
    );
});

Deno.test('an unregistered field stays raw', () => {
    assertStrictEquals(
        typed.query('header.x-custom').toText(),
        'a=1;b=2',
    );
});

Deno.test('a malformed structured field falls back to raw', () => {
    const bad = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\ncache-control: @@bad@@\r\n\r\n',
    );
    assertStrictEquals(
        bad.query('header.cache-control').toText(),
        '@@bad@@',
    );
});

Deno.test('a missing dictionary member is absent', () => {
    assertStrictEquals(
        cacheable.query('header.cache-control.no-store').exists(),
        false,
    );
});

Deno.test('queries a boolean parameter (8941 ?1)', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\ncontent-type: text/html;x=?1\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.content-type.x').toBoolean(),
        true,
    );
});

Deno.test('queries a false boolean parameter (8941 ?0)', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\ncontent-type: text/html;x=?0\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.content-type.x').toBoolean(),
        false,
    );
});

Deno.test('queries a quoted-string parameter (8941 string)', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n'
        + 'content-type: text/html;title="a b"\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.content-type.title').toText(),
        'a b',
    );
});

Deno.test('queries a string parameter with escapes', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n'
        + 'content-type: text/html;t="a\\"b"\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.content-type.t').toText(),
        'a"b',
    );
});

Deno.test('an unterminated quoted string falls back to raw', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\ncontent-type: "abc\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.content-type').toText(),
        '"abc',
    );
});

Deno.test('a list with a trailing comma falls back to raw', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\naccept-encoding: gzip,\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding').toText(),
        'gzip,',
    );
});

Deno.test('indexes into an inner-list member', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: (gzip deflate), br\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.0.1').toText(),
        'deflate',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.1').toText(),
        'br',
    );
});

Deno.test('an inner-list member has no scalar leaf', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: (gzip deflate), br\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.0').exists(),
        false,
    );
});
