import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';

test('round-trips a canonical header-only request', () => {
    const wire =
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        '\r\n';
    const message = HttpMessage.fromWire(wire);
    assert.equal(message.toWire(), wire);
});

test('canonicalizes field-name case to lower', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n',
    );
    assert.equal(
        message.toWire(),
        'GET / HTTP/1.1\r\nhost: example.com\r\n\r\n',
    );
});

test('round-trips a response with a multi-word reason', () => {
    const wire =
        'HTTP/1.1 404 Not Found\r\n' +
        'content-type: text/plain\r\n' +
        '\r\n';
    assert.equal(HttpMessage.fromWire(wire).toWire(), wire);
});

test('sorts header fields by name, ascending', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'accept: text/html\r\n' +
        '\r\n',
    );
    assert.equal(
        message.toWire(),
        'GET / HTTP/1.1\r\n' +
        'accept: text/html\r\n' +
        'host: example.com\r\n' +
        '\r\n',
    );
});

test('preserves relative order of same-name fields', () => {
    const message = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'set-cookie: a=1\r\n' +
        'host: example.com\r\n' +
        'set-cookie: b=2\r\n' +
        '\r\n',
    );
    assert.equal(
        message.toWire(),
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'set-cookie: a=1\r\n' +
        'set-cookie: b=2\r\n' +
        '\r\n',
    );
});

test('derives content-length from the body, not the field', () => {
    const message = HttpMessage.fromWire(
        'POST /things HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'content-length: 5\r\n' +
        '\r\n' +
        'hello',
    );
    assert.equal(
        message.toWire(),
        'POST /things HTTP/1.1\r\n' +
        'content-length: 5\r\n' +
        'host: example.com\r\n' +
        '\r\n' +
        'hello',
    );
});
