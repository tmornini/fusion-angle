import { assertStrictEquals, assertThrows } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

Deno.test('withFieldPut overwrites an existing field', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
        .withFieldPut('host', 'b');
    assertStrictEquals(message.query('header.host').toText(), 'b');
});

Deno.test('withFieldPut leaves the original unchanged', () => {
    const original = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\nhost: a\r\n\r\n',
    );
    original.withFieldPut('host', 'b');
    assertStrictEquals(original.query('header.host').toText(), 'a');
});

Deno.test('withFieldAppended keeps same-name fields', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
        .withFieldAppended('set-cookie', 'x=1')
        .withFieldAppended('set-cookie', 'y=2');
    assertStrictEquals(
        message.query('header.set-cookie.0').toText(),
        'x=1',
    );
    assertStrictEquals(
        message.query('header.set-cookie.1').toText(),
        'y=2',
    );
});

Deno.test('withFieldDeleted removes a field', () => {
    const message = HttpMessage
        .fromWire(
            'GET / HTTP/1.1\r\nhost: a\r\naccept: x\r\n\r\n',
        )
        .withFieldDeleted('accept');
    assertStrictEquals(message.query('header.accept').exists(), false);
});

Deno.test('withFieldPut rejects a derived framing field', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
            .withFieldPut('content-length', '5'),
        HttpMessageError,
    );
});

Deno.test('withFieldPut rejects a value with CRLF', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withFieldPut('x-evil', 'a\r\ninjected: 1'),
        HttpMessageError,
    );
});

Deno.test('withStatus changes the response status line', () => {
    const message = HttpMessage
        .fromWire('HTTP/1.1 200 OK\r\n\r\n')
        .withStatus(404, 'Not Found');
    assertStrictEquals(message.query('status').toNumber(), 404);
    assertStrictEquals(
        message.toWire().split('\r\n')[0],
        'HTTP/1.1 404 Not Found',
    );
});

Deno.test('withStatus on a request throws', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withStatus(200, 'OK'),
        HttpMessageError,
    );
});

Deno.test('withMethod changes the request method', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\n\r\n')
        .withMethod('HEAD');
    assertStrictEquals(message.query('method').toText(), 'HEAD');
});

Deno.test('withTarget rejects a target with CRLF', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withTarget('/ HTTP/1.1\r\nevil: 1'),
        HttpMessageError,
    );
});

Deno.test('withTarget rejects a target with a space', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withTarget('/a b'),
        HttpMessageError,
    );
});

Deno.test('withStatus rejects a reason with CRLF', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('HTTP/1.1 200 OK\r\n\r\n')
            .withStatus(200, 'OK\r\nevil: 1'),
        HttpMessageError,
    );
});

Deno.test('withMethod on a response throws', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('HTTP/1.1 200 OK\r\n\r\n')
            .withMethod('GET'),
        HttpMessageError,
    );
});

Deno.test('withMethod rejects an invalid method token', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withMethod('G@T'),
        HttpMessageError,
    );
});

Deno.test('withTarget on a response throws', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('HTTP/1.1 200 OK\r\n\r\n')
            .withTarget('/x'),
        HttpMessageError,
    );
});

Deno.test('withStatus rejects an out-of-range status', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('HTTP/1.1 200 OK\r\n\r\n')
            .withStatus(700, 'x'),
        HttpMessageError,
    );
});

Deno.test('withFieldPut rejects an invalid field name', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withFieldPut('bad name', 'x'),
        HttpMessageError,
    );
});

Deno.test('a modified message re-serializes canonically', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
        .withFieldPut('accept', 'text/html');
    assertStrictEquals(
        message.toWire(),
        'GET / HTTP/1.1\r\naccept: text/html\r\nhost: a\r\n\r\n',
    );
});
