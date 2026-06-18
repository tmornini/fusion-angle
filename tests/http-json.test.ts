import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

test('wire and JSON forms round-trip to the same wire', () => {
    const wire =
        'POST /things HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'content-length: 5\r\n' +
        '\r\n' +
        'hello';
    const viaWire = HttpMessage.fromWire(wire);
    const viaJson = HttpMessage.fromJson(viaWire.toJson());
    assert.equal(viaJson.toWire(), viaWire.toWire());
});

test('JSON re-serialization is a fixed point', () => {
    const once = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\n\r\nhi',
    ).toJson();
    const twice = HttpMessage.fromJson(once).toJson();
    assert.equal(twice, once);
});

test('JSON top-level keys are sorted ascending', () => {
    const json = HttpMessage.fromWire(
        'POST /x HTTP/1.1\r\n' +
        'host: h\r\n' +
        'content-length: 2\r\n' +
        '\r\n' +
        'hi',
    ).toJson();
    assert.deepEqual(
        Object.keys(JSON.parse(json)),
        ['body', 'header', 'method', 'target', 'version'],
    );
});

test('JSON header is sorted array of name/value pairs', () => {
    const json = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'accept: text/html\r\n' +
        '\r\n',
    ).toJson();
    assert.deepEqual(JSON.parse(json).header, [
        ['accept', 'text/html'],
        ['host', 'example.com'],
    ]);
});

test('JSON header preserves same-name field order', () => {
    const json = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'set-cookie: a=1\r\n' +
        'set-cookie: b=2\r\n' +
        '\r\n',
    ).toJson();
    assert.deepEqual(JSON.parse(json).header, [
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
    ]);
});

test('a body without a content-type is base64', () => {
    const json = HttpMessage.fromWire(
        'POST / HTTP/1.1\r\ncontent-length: 5\r\n\r\nhello',
    ).toJson();
    assert.equal(JSON.parse(json).body, 'aGVsbG8=');
});

test('JSON omits the body key when there is no body', () => {
    const json = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\nhost: h\r\n\r\n',
    ).toJson();
    assert.ok(!('body' in JSON.parse(json)));
});

test('rejects malformed JSON text', () => {
    assert.throws(
        () => HttpMessage.fromJson('{not json'),
        HttpMessageError,
    );
});

test('rejects JSON with neither method nor status', () => {
    assert.throws(
        () => HttpMessage.fromJson('{"header":[]}'),
        HttpMessageError,
    );
});

test('rejects a non-object JSON message', () => {
    assert.throws(
        () => HttpMessage.fromJson('[1,2,3]'),
        HttpMessageError,
    );
});

test('rejects a JSON request with an invalid method', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"method":"G@T","target":"/",'
            + '"version":"HTTP/1.1","header":[]}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON request with a bad version', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/",'
            + '"version":"HTTP/9","header":[]}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON response with an out-of-range status', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"version":"HTTP/1.1","status":99,'
            + '"reason":"x","header":[]}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON response with a non-numeric status', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"version":"HTTP/1.1","status":"200",'
            + '"reason":"OK","header":[]}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON header that is not an array', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/",'
            + '"version":"HTTP/1.1","header":{}}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON header pair with a non-string value', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/",'
            + '"version":"HTTP/1.1","header":[["host",5]]}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON header with an invalid field name', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/","version":"HTTP/1.1",'
            + '"header":[["bad name","x"]]}',
        ),
        HttpMessageError,
    );
});

test('rejects a JSON response with a bad version', () => {
    assert.throws(
        () => HttpMessage.fromJson(
            '{"version":"HTTP/9","status":200,'
            + '"reason":"OK","header":[]}',
        ),
        HttpMessageError,
    );
});
