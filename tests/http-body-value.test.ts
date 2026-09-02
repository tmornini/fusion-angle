import { assertEquals, assertStrictEquals, assertThrows } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

const json = HttpMessage.fromWire(
    'HTTP/1.1 200 OK\r\n' +
    'content-type: application/json\r\n' +
    '\r\n' +
    '{"user":{"name":"bob"},"items":[10,20],"n":42}',
);

const noBody = HttpMessage.fromWire('GET / HTTP/1.1\r\n\r\n');

const textBody = HttpMessage.fromWire(
    'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\n\r\nhello',
);

Deno.test('body().exists() is true when a body is present', () => {
    assertStrictEquals(json.body().exists(), true);
});

Deno.test('body().exists() is false when there is no body', () => {
    assertStrictEquals(noBody.body().exists(), false);
});

Deno.test('body().toText() decodes the octets as UTF-8', () => {
    assertStrictEquals(textBody.body().toText(), 'hello');
});

Deno.test('body().toBytes() returns the raw octets', () => {
    assertEquals(
        textBody.body().toBytes(),
        new TextEncoder().encode('hello'),
    );
});

Deno.test('body().toBytes() returns a copy', () => {
    const bytes = textBody.body().toBytes();
    bytes[0] = 0;
    assertEquals(
        textBody.body().toBytes(),
        new TextEncoder().encode('hello'),
    );
});

Deno.test('body().toBase64() is the base64 of the octets', () => {
    assertStrictEquals(textBody.body().toBase64(), 'aGVsbG8=');
});

Deno.test('body().decoded() navigates JSON members', () => {
    assertStrictEquals(
        json.body().decoded().query('user.name').toText(),
        'bob',
    );
    assertStrictEquals(
        json.body().decoded().query('items.1').toNumber(),
        20,
    );
});

Deno.test('body().decoded() matches message.query(body.*)', () => {
    assertStrictEquals(
        json.body().decoded().query('user.name').toText(),
        json.query('body.user.name').toText(),
    );
});

Deno.test('decoded() of a scalar body converts directly', () => {
    const scalar = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n42',
    );
    assertStrictEquals(scalar.body().decoded().toNumber(), 42);
});

Deno.test('conversions on an absent body throw', () => {
    assertThrows(() => noBody.body().toText(), HttpMessageError);
    assertThrows(() => noBody.body().toBytes(), HttpMessageError);
    assertThrows(() => noBody.body().decoded(), HttpMessageError);
});

Deno.test('decoded() throws when no codec handles the type', () => {
    const noCodec = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/xml\r\n\r\nhello',
    );
    assertThrows(
        () => noCodec.body().decoded(),
        HttpMessageError,
    );
});

Deno.test('decoded() throws on a malformed JSON body', () => {
    const bad = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\nnot json',
    );
    assertThrows(() => bad.body().decoded(), HttpMessageError);
    assertStrictEquals(bad.query('body.x').exists(), false);
});

Deno.test('contentDecoded() is identity without content-encoding', () => {
    assertEquals(
        json.body().contentDecoded().toBytes(),
        json.body().toBytes(),
    );
});

Deno.test('contentDecoded() throws on an unsupported encoding', () => {
    const gz = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-encoding: gzip\r\n' +
        'content-type: text/plain\r\n\r\nx',
    );
    assertThrows(
        () => gz.body().contentDecoded(),
        HttpMessageError,
    );
});

Deno.test('base64Decoded() decodes a base64-armored body', () => {
    const armored = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: text/plain\r\n\r\naGVsbG8=',
    );
    assertStrictEquals(armored.body().base64Decoded().toText(), 'hello');
});

Deno.test('base64Decoded() throws HttpMessageError on bad input', () => {
    const armored = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: text/plain\r\n\r\n!!!not base64!!!',
    );
    assertThrows(
        () => armored.body().base64Decoded().toText(),
        HttpMessageError,
    );
});

Deno.test('contentDecoded() on an absent body throws', () => {
    assertThrows(
        () => noBody.body().contentDecoded(),
        HttpMessageError,
    );
});

Deno.test('decoded() throws on a content-encoded body', () => {
    const gz = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-encoding: gzip\r\n' +
        'content-type: application/json\r\n\r\n{"a":1}',
    );
    assertThrows(() => gz.body().decoded(), HttpMessageError);
});
