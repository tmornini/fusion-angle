import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';

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

test('queries the request method', () => {
    assert.equal(request.query('method').toText(), 'GET');
});

test('queries the request target', () => {
    assert.equal(request.query('target').toText(), '/search?q=1');
});

test('queries the request version', () => {
    assert.equal(request.query('version').toText(), 'HTTP/1.1');
});

test('a response field is absent on a request', () => {
    assert.equal(request.query('status').exists(), false);
});

test('queries the response status as a number', () => {
    assert.equal(response.query('status').toNumber(), 404);
});

test('queries the response reason', () => {
    assert.equal(response.query('reason').toText(), 'Not Found');
});

test('queries a raw header value', () => {
    assert.equal(
        request.query('header.host').toText(),
        'example.com',
    );
});

test('queries a date header through toDate', () => {
    assert.equal(
        request.query('header.date').toDate().getTime(),
        Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

test('an absent header is absent', () => {
    assert.equal(request.query('header.accept').exists(), false);
});

test('derives content-length from the body', () => {
    assert.equal(
        response.query('header.content-length').toNumber(),
        2,
    );
});

test('content-length is absent without a body', () => {
    assert.equal(
        request.query('header.content-length').exists(),
        false,
    );
});

test('derives transfer-encoding when chunked', () => {
    assert.equal(
        chunked.query('header.transfer-encoding').toText(),
        'chunked',
    );
});

test('content-length is absent for a chunked message', () => {
    assert.equal(
        chunked.query('header.content-length').exists(),
        false,
    );
});

test('queries a trailer field', () => {
    assert.equal(chunked.query('trailer.x-sum').toText(), 'z');
});

test('a trailer field is absent when not chunked', () => {
    assert.equal(response.query('trailer.x-sum').exists(), false);
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

test('queries an item field bare value', () => {
    assert.equal(
        typed.query('header.content-type').toText(),
        'text/html',
    );
});

test('queries an item field parameter', () => {
    assert.equal(
        typed.query('header.content-type.charset').toText(),
        'utf-8',
    );
});

test('queries a dictionary member as a number', () => {
    assert.equal(
        cacheable.query('header.cache-control.max-age').toNumber(),
        3600,
    );
});

test('queries a dictionary boolean member', () => {
    assert.equal(
        cacheable
            .query('header.cache-control.no-cache')
            .toBoolean(),
        true,
    );
});

test('queries a list member by index', () => {
    assert.equal(
        typed.query('header.accept-encoding.1').toText(),
        'deflate',
    );
});

test('queries a list member parameter', () => {
    assert.equal(
        typed.query('header.accept.0.q').toNumber(),
        0.8,
    );
});

test('an unregistered field stays raw', () => {
    assert.equal(
        typed.query('header.x-custom').toText(),
        'a=1;b=2',
    );
});

test('a malformed structured field falls back to raw', () => {
    const bad = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\ncache-control: @@bad@@\r\n\r\n',
    );
    assert.equal(
        bad.query('header.cache-control').toText(),
        '@@bad@@',
    );
});

test('a missing dictionary member is absent', () => {
    assert.equal(
        cacheable.query('header.cache-control.no-store').exists(),
        false,
    );
});

test('queries a boolean parameter (8941 ?1)', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\ncontent-type: text/html;x=?1\r\n\r\n',
    );
    assert.equal(
        message.query('header.content-type.x').toBoolean(),
        true,
    );
});

test('queries a false boolean parameter (8941 ?0)', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\ncontent-type: text/html;x=?0\r\n\r\n',
    );
    assert.equal(
        message.query('header.content-type.x').toBoolean(),
        false,
    );
});

test('queries a quoted-string parameter (8941 string)', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n'
        + 'content-type: text/html;title="a b"\r\n\r\n',
    );
    assert.equal(
        message.query('header.content-type.title').toText(),
        'a b',
    );
});

test('queries a string parameter with escapes', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n'
        + 'content-type: text/html;t="a\\"b"\r\n\r\n',
    );
    assert.equal(
        message.query('header.content-type.t').toText(),
        'a"b',
    );
});

test('an unterminated quoted string falls back to raw', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\ncontent-type: "abc\r\n\r\n',
    );
    assert.equal(
        message.query('header.content-type').toText(),
        '"abc',
    );
});

test('a list with a trailing comma falls back to raw', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\naccept-encoding: gzip,\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding').toText(),
        'gzip,',
    );
});
