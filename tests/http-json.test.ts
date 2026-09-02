import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

Deno.test('wire and JSON forms round-trip to the same wire', () => {
    const wire =
        'POST /things HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'content-length: 5\r\n' +
        '\r\n' +
        'hello';
    const viaWire = HttpMessage.fromWire(wire);
    const viaJson = HttpMessage.fromJson(viaWire.toJson());
    assertStrictEquals(viaJson.toWire(), viaWire.toWire());
});

Deno.test('JSON re-serialization is a fixed point', () => {
    const once = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\n\r\nhi',
    ).toJson();
    const twice = HttpMessage.fromJson(once).toJson();
    assertStrictEquals(twice, once);
});

Deno.test('JSON top-level keys are sorted ascending', () => {
    const json = HttpMessage.fromWire(
        'POST /x HTTP/1.1\r\n' +
        'host: h\r\n' +
        'content-length: 2\r\n' +
        '\r\n' +
        'hi',
    ).toJson();
    assertEquals(
        Object.keys(JSON.parse(json)),
        ['body', 'header', 'method', 'target', 'version'],
    );
});

Deno.test('JSON header is sorted array of name/value pairs', () => {
    const json = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'host: example.com\r\n' +
        'accept: text/html\r\n' +
        '\r\n',
    ).toJson();
    assertEquals(JSON.parse(json).header, [
        ['accept', 'text/html'],
        ['host', 'example.com'],
    ]);
});

Deno.test('JSON header preserves same-name field order', () => {
    const json = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'set-cookie: a=1\r\n' +
        'set-cookie: b=2\r\n' +
        '\r\n',
    ).toJson();
    assertEquals(JSON.parse(json).header, [
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
    ]);
});

Deno.test('a body without a content-type is base64', () => {
    const json = HttpMessage.fromWire(
        'POST / HTTP/1.1\r\ncontent-length: 5\r\n\r\nhello',
    ).toJson();
    assertStrictEquals(JSON.parse(json).body, 'aGVsbG8=');
});

Deno.test('JSON omits the body key when there is no body', () => {
    const json = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\nhost: h\r\n\r\n',
    ).toJson();
    assert(!('body' in JSON.parse(json)));
});

Deno.test('rejects malformed JSON text', () => {
    assertThrows(
        () => HttpMessage.fromJson('{not json'),
        HttpMessageError,
    );
});

Deno.test('rejects JSON with neither method nor status', () => {
    assertThrows(
        () => HttpMessage.fromJson('{"header":[]}'),
        HttpMessageError,
    );
});

Deno.test('rejects a non-object JSON message', () => {
    assertThrows(
        () => HttpMessage.fromJson('[1,2,3]'),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON request with an invalid method', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"method":"G@T","target":"/",'
            + '"version":"HTTP/1.1","header":[]}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON request with a bad version', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/",'
            + '"version":"HTTP/9","header":[]}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON response with an out-of-range status', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"version":"HTTP/1.1","status":99,'
            + '"reason":"x","header":[]}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON response with a non-numeric status', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"version":"HTTP/1.1","status":"200",'
            + '"reason":"OK","header":[]}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON header that is not an array', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/",'
            + '"version":"HTTP/1.1","header":{}}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON header pair with a non-string value', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/",'
            + '"version":"HTTP/1.1","header":[["host",5]]}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON header with an invalid field name', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"method":"GET","target":"/","version":"HTTP/1.1",'
            + '"header":[["bad name","x"]]}',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a JSON response with a bad version', () => {
    assertThrows(
        () => HttpMessage.fromJson(
            '{"version":"HTTP/9","status":200,'
            + '"reason":"OK","header":[]}',
        ),
        HttpMessageError,
    );
});
