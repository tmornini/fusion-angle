import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

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

test('body().exists() is true when a body is present', () => {
    assert.equal(json.body().exists(), true);
});

test('body().exists() is false when there is no body', () => {
    assert.equal(noBody.body().exists(), false);
});

test('body().toText() decodes the octets as UTF-8', () => {
    assert.equal(textBody.body().toText(), 'hello');
});

test('body().toBytes() returns the raw octets', () => {
    assert.deepEqual(
        textBody.body().toBytes(),
        new TextEncoder().encode('hello'),
    );
});

test('body().toBytes() returns a copy', () => {
    const bytes = textBody.body().toBytes();
    bytes[0] = 0;
    assert.deepEqual(
        textBody.body().toBytes(),
        new TextEncoder().encode('hello'),
    );
});

test('body().toBase64() is the base64 of the octets', () => {
    assert.equal(textBody.body().toBase64(), 'aGVsbG8=');
});

test('body().decoded() navigates JSON members', () => {
    assert.equal(
        json.body().decoded().query('user.name').toText(),
        'bob',
    );
    assert.equal(
        json.body().decoded().query('items.1').toNumber(),
        20,
    );
});

test('body().decoded() matches message.query(body.*)', () => {
    assert.equal(
        json.body().decoded().query('user.name').toText(),
        json.query('body.user.name').toText(),
    );
});

test('decoded() of a scalar body converts directly', () => {
    const scalar = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n42',
    );
    assert.equal(scalar.body().decoded().toNumber(), 42);
});

test('conversions on an absent body throw', () => {
    assert.throws(() => noBody.body().toText(), HttpMessageError);
    assert.throws(() => noBody.body().toBytes(), HttpMessageError);
    assert.throws(() => noBody.body().decoded(), HttpMessageError);
});

test('decoded() throws when no codec handles the type', () => {
    const noCodec = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/xml\r\n\r\nhello',
    );
    assert.throws(
        () => noCodec.body().decoded(),
        HttpMessageError,
    );
});

test('decoded() throws on a malformed JSON body', () => {
    const bad = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\nnot json',
    );
    assert.throws(() => bad.body().decoded(), HttpMessageError);
    assert.equal(bad.query('body.x').exists(), false);
});

test('contentDecoded() is identity without content-encoding', () => {
    assert.deepEqual(
        json.body().contentDecoded().toBytes(),
        json.body().toBytes(),
    );
});

test('contentDecoded() throws on an unsupported encoding', () => {
    const gz = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-encoding: gzip\r\n' +
        'content-type: text/plain\r\n\r\nx',
    );
    assert.throws(
        () => gz.body().contentDecoded(),
        HttpMessageError,
    );
});

test('base64Decoded() decodes a base64-armored body', () => {
    const armored = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: text/plain\r\n\r\naGVsbG8=',
    );
    assert.equal(armored.body().base64Decoded().toText(), 'hello');
});

test('base64Decoded() throws HttpMessageError on bad input', () => {
    const armored = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: text/plain\r\n\r\n!!!not base64!!!',
    );
    assert.throws(
        () => armored.body().base64Decoded().toText(),
        HttpMessageError,
    );
});

test('contentDecoded() on an absent body throws', () => {
    assert.throws(
        () => noBody.body().contentDecoded(),
        HttpMessageError,
    );
});

test('decoded() throws on a content-encoded body', () => {
    const gz = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-encoding: gzip\r\n' +
        'content-type: application/json\r\n\r\n{"a":1}',
    );
    assert.throws(() => gz.body().decoded(), HttpMessageError);
});
