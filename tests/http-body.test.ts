import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

const jsonResponse = HttpMessage.fromWire(
    'HTTP/1.1 200 OK\r\n' +
    'content-type: application/json\r\n' +
    '\r\n' +
    '{"user":{"name":"bob"},"items":[10,20]}',
);

test('queries a string member of a JSON body', () => {
    assert.equal(
        jsonResponse.query('body.user.name').toText(),
        'bob',
    );
});

test('queries a numeric member of a JSON body array', () => {
    assert.equal(
        jsonResponse.query('body.items.1').toNumber(),
        20,
    );
});

test('a missing body member is absent', () => {
    assert.equal(
        jsonResponse.query('body.user.age').exists(),
        false,
    );
});

test('a body query is absent without a codec', () => {
    const text = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: text/plain\r\n' +
        '\r\n' +
        'hello',
    );
    assert.equal(text.query('body.anything').exists(), false);
});

test('a body query is absent with no body', () => {
    const empty = HttpMessage.fromWire('GET / HTTP/1.1\r\n\r\n');
    assert.equal(empty.query('body.x').exists(), false);
});

test('withBody encodes JSON and derives content-type', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('application/json', { ok: true });
    assert.equal(
        message.query('header.content-type').toText(),
        'application/json',
    );
    assert.equal(message.query('body.ok').toBoolean(), true);
});

test('withBody derives content-length on the wire', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('application/json', { a: 1 });
    assert.match(message.toWire(), /content-length: 7\r\n/);
});

test('withBody throws for an unregistered media type', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('POST / HTTP/1.1\r\n\r\n')
            .withBody('text/plain', 'hi'),
        HttpMessageError,
    );
});

test('a malformed JSON body is absent on query', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n' +
        '\r\n' +
        'not json',
    );
    assert.equal(message.query('body.x').exists(), false);
});
