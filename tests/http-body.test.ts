import {
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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

Deno.test('queries a string member of a JSON body', () => {
    assertStrictEquals(
        jsonResponse.query('body.user.name').toText(),
        'bob',
    );
});

Deno.test('queries a numeric member of a JSON body array', () => {
    assertStrictEquals(
        jsonResponse.query('body.items.1').toNumber(),
        20,
    );
});

Deno.test('a missing body member is absent', () => {
    assertStrictEquals(
        jsonResponse.query('body.user.age').exists(),
        false,
    );
});

Deno.test('a body query is absent without a codec', () => {
    const text = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/xml\r\n' +
        '\r\n' +
        'hello',
    );
    assertStrictEquals(text.query('body.anything').exists(), false);
});

Deno.test('a body query is absent with no body', () => {
    const empty = HttpMessage.fromWire('GET / HTTP/1.1\r\n\r\n');
    assertStrictEquals(empty.query('body.x').exists(), false);
});

Deno.test('withBody encodes JSON and derives content-type', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('application/json', { ok: true });
    assertStrictEquals(
        message.query('header.content-type').toText(),
        'application/json',
    );
    assertStrictEquals(message.query('body.ok').toBoolean(), true);
});

Deno.test('withBody derives content-length on the wire', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('application/json', { a: 1 });
    assertMatch(message.toWire(), /content-length: 7\r\n/);
});

Deno.test('withBody throws for an unregistered media type', () => {
    assertThrows(
        () => HttpMessage
            .fromWire('POST / HTTP/1.1\r\n\r\n')
            .withBody('application/xml', 'hi'),
        HttpMessageError,
    );
});

Deno.test('a malformed JSON body is absent on query', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n' +
        '\r\n' +
        'not json',
    );
    assertStrictEquals(message.query('body.x').exists(), false);
});

const thingCodec = {
    kind: 'other' as const,
    handles: (t: string) => t === 'application/x-thing',
    decode: (b: Octets): unknown => b.toLatin1(),
    encode: (v: unknown): Octets =>
        Octets.fromLatin1(String(v)),
};

Deno.test('a non-JSON codec body is not inlined as JSON', () => {
    const registry = new BodyRegistry([thingCodec]);
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/x-thing\r\n\r\n{"a":1}',
        registry,
    );
    const body = JSON.parse(message.toJson()).body;
    assertStrictEquals(typeof body, 'string');
});

Deno.test('form codec decodes urlencoded to an object', () => {
    assertEquals(
        formBodyCodec.decode(Octets.fromLatin1('a=1&b=two')),
        { a: '1', b: 'two' },
    );
});

Deno.test('form codec keeps the last value on duplicate keys', () => {
    assertEquals(
        formBodyCodec.decode(Octets.fromLatin1('a=1&a=2')),
        { a: '2' },
    );
});

Deno.test('form codec encodes an object to urlencoded', () => {
    const octets = formBodyCodec.encode({ a: '1'
        , b: 'two' });
    assertStrictEquals(octets.toLatin1(), 'a=1&b=two');
});

Deno.test('form codec rejects a non-string field', () => {
    assertThrows(
        () => formBodyCodec.encode({ a: 1 }),
        HttpMessageError,
    );
});

Deno.test('text codec round-trips UTF-8', () => {
    const octets = textBodyCodec.encode('café');
    assertStrictEquals(textBodyCodec.decode(octets), 'café');
});

Deno.test('withBody round-trips a text/plain body', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('text/plain', 'hello');
    assertStrictEquals(message.body().decoded().toText(), 'hello');
});

Deno.test('withBody round-trips a form body by field', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody(
            'application/x-www-form-urlencoded',
            { a: 'AjdvjuECVZEgZoFajaIEkg', b: 'two' },
        );
    assertStrictEquals(
        message.query('body.a').toText(), 'AjdvjuECVZEgZoFajaIEkg',
    );
    assertStrictEquals(message.query('body.b').toText(), 'two');
});

Deno.test('a text/plain body is base64 in the JSON form', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('text/plain', 'hi');
    const body = JSON.parse(message.toJson()).body;
    assertStrictEquals(typeof body, 'string');
});
