import { assertStrictEquals } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';

Deno.test('round-trips a canonical header-only request', () => {
    const wire =
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        '\r\n';
    const message = HttpMessage.fromWire(wire);
    assertStrictEquals(message.toWire(), wire);
});

Deno.test('canonicalizes field-name case to lower', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n',
    );
    assertStrictEquals(
        message.toWire(),
        'GET / HTTP/1.1\r\nhost: example.com\r\n\r\n',
    );
});

Deno.test('round-trips a response with a multi-word reason', () => {
    const wire =
        'HTTP/1.1 404 Not Found\r\n' +
        'content-type: text/plain\r\n' +
        '\r\n';
    assertStrictEquals(HttpMessage.fromWire(wire).toWire(), wire);
});

Deno.test('sorts header fields by name, ascending', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'accept: text/html\r\n' +
        '\r\n',
    );
    assertStrictEquals(
        message.toWire(),
        'GET / HTTP/1.1\r\n' +
        'accept: text/html\r\n' +
        'host: example.com\r\n' +
        '\r\n',
    );
});

Deno.test('preserves relative order of same-name fields', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'set-cookie: a=1\r\n' +
        'host: example.com\r\n' +
        'set-cookie: b=2\r\n' +
        '\r\n',
    );
    assertStrictEquals(
        message.toWire(),
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'set-cookie: a=1\r\n' +
        'set-cookie: b=2\r\n' +
        '\r\n',
    );
});

Deno.test('derives content-length from the body, not the field', () => {
    const message = HttpMessage.fromWire(
        'POST /things HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'content-length: 5\r\n' +
        '\r\n' +
        'hello',
    );
    assertStrictEquals(
        message.toWire(),
        'POST /things HTTP/1.1\r\n' +
        'content-length: 5\r\n' +
        'host: example.com\r\n' +
        '\r\n' +
        'hello',
    );
});
