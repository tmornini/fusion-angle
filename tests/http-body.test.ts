import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';
import {
    BodyRegistry,
    formBodyCodec,
    textBodyCodec,
} from '../shared/http-message/media-registry.ts';
import { Octets } from '../shared/http-message/octets.ts';

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
        'content-type: application/xml\r\n' +
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
            .withBody('application/xml', 'hi'),
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

const thingCodec = {
    kind: 'other' as const,
    handles: (t: string) => t === 'application/x-thing',
    decode: (b: Octets): unknown => b.toLatin1(),
    encode: (v: unknown): Octets =>
        Octets.fromLatin1(String(v)),
};

test('a non-JSON codec body is not inlined as JSON', () => {
    const registry = new BodyRegistry([thingCodec]);
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/x-thing\r\n\r\n{"a":1}',
        registry,
    );
    const body = JSON.parse(message.toJson()).body;
    assert.equal(typeof body, 'string');
});

test('form codec decodes urlencoded to an object', () => {
    assert.deepEqual(
        formBodyCodec.decode(Octets.fromLatin1('a=1&b=two')),
        { a: '1', b: 'two' },
    );
});

test('form codec keeps the last value on duplicate keys', () => {
    assert.deepEqual(
        formBodyCodec.decode(Octets.fromLatin1('a=1&a=2')),
        { a: '2' },
    );
});

test('form codec encodes an object to urlencoded', () => {
    const octets = formBodyCodec.encode({ a: '1', b: 'two' });
    assert.equal(octets.toLatin1(), 'a=1&b=two');
});

test('form codec rejects a non-string field', () => {
    assert.throws(
        () => formBodyCodec.encode({ a: 1 }),
        HttpMessageError,
    );
});

test('text codec round-trips UTF-8', () => {
    const octets = textBodyCodec.encode('café');
    assert.equal(textBodyCodec.decode(octets), 'café');
});

test('withBody round-trips a text/plain body', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('text/plain', 'hello');
    assert.equal(message.body().decoded().toText(), 'hello');
});

test('withBody round-trips a form body by field', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody(
            'application/x-www-form-urlencoded',
            { a: '1', b: 'two' },
        );
    assert.equal(message.query('body.a').toText(), '1');
    assert.equal(message.query('body.b').toText(), 'two');
});

test('a text/plain body is base64 in the JSON form', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('text/plain', 'hi');
    const body = JSON.parse(message.toJson()).body;
    assert.equal(typeof body, 'string');
});
