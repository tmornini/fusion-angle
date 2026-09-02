import {
    assert,
    assertEquals,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

function bodyOf(wire: string): unknown {
    return JSON.parse(HttpMessage.fromWire(wire).toJson()).body;
}

Deno.test('a JSON body inlines as a JSON object', () => {
    assertEquals(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/json\r\n\r\n{"b":2,"a":1}',
        ),
        { a: 1, b: 2 },
    );
});

Deno.test('inline JSON body keys are sorted', () => {
    const json = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n{"b":2,"a":1}',
    ).toJson();
    assertMatch(json, /"body":\{"a":1,"b":2\}/);
});

Deno.test('a +json content-type inlines too', () => {
    assertEquals(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/merge-patch+json\r\n\r\n' +
            '{"x":[1,2]}',
        ),
        { x: [1, 2] },
    );
});

Deno.test('a JSON array body inlines as an array', () => {
    assertEquals(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/json\r\n\r\n[10,20]',
        ),
        [10, 20],
    );
});

Deno.test('a JSON number body inlines as a number', () => {
    assertStrictEquals(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/json\r\n\r\n42',
        ),
        42,
    );
});

Deno.test('a JSON null body inlines as null, present not absent', () => {
    const root = JSON.parse(HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\nnull',
    ).toJson());
    assert('body' in root);
    assertStrictEquals(root.body, null);
});

Deno.test('a bare JSON string body falls back to base64', () => {
    const value = bodyOf(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n"hi"',
    );
    assertStrictEquals(typeof value, 'string');
    assertNotStrictEquals(value, 'hi');
});

Deno.test('a non-JSON content-type body is base64', () => {
    assertStrictEquals(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/octet-stream\r\n' +
            'content-length: 5\r\n\r\nhello',
        ),
        'aGVsbG8=',
    );
});

Deno.test('parses an inline JSON body via fromJson', () => {
    const json = '{"header":[["content-type","application/json"]],'
        + '"status":200,"reason":"OK","version":"HTTP/1.1",'
        + '"body":{"a":1}}';
    assertStrictEquals(
        HttpMessage.fromJson(json).query('body.a').toNumber(),
        1,
    );
});

Deno.test('parses a base64 body via fromJson', () => {
    const json = '{"header":'
        + '[["content-type","application/octet-stream"]],'
        + '"status":200,"reason":"OK","version":"HTTP/1.1",'
        + '"body":"aGVsbG8="}';
    assertMatch(HttpMessage.fromJson(json).toWire(), /\r\n\r\nhello$/);
});

Deno.test('JSON form round-trips a JSON body semantically', () => {
    const viaWire = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n{"user":{"name":"bob"}}',
    );
    const viaJson = HttpMessage.fromJson(viaWire.toJson());
    assertStrictEquals(
        viaJson.query('body.user.name').toText(),
        'bob',
    );
});

Deno.test('JSON re-serialization of a JSON body is a fixed point', () => {
    const once = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n{"b":2,"a":1}',
    ).toJson();
    const twice = HttpMessage.fromJson(once).toJson();
    assertStrictEquals(twice, once);
});

Deno.test('a large-integer number body survives round-trip', () => {
    const viaWire = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n' +
        '{"id":12345678901234567890}',
    );
    assertMatch(viaWire.toJson(), /"id":12345678901234567890/);
    assertMatch(
        HttpMessage.fromJson(viaWire.toJson()).toWire(),
        /\{"id":12345678901234567890\}$/,
    );
});

Deno.test('a bare large-integer body round-trips exactly', () => {
    const json = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n' +
        '98765432109876543210',
    ).toJson();
    assertMatch(json, /"body":98765432109876543210/);
    assertMatch(
        HttpMessage.fromJson(json).toWire(),
        /\r\n\r\n98765432109876543210$/,
    );
});

Deno.test('rejects an invalid base64 body at the gate', () => {
    const json = '{"header":'
        + '[["content-type","application/octet-stream"]],'
        + '"status":200,"reason":"OK","version":"HTTP/1.1",'
        + '"body":"!!!not base64!!!"}';
    assertThrows(
        () => HttpMessage.fromJson(json),
        HttpMessageError,
    );
});

Deno.test('an empty JSON body round-trips via base64', () => {
    const once = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n' +
        'content-length: 0\r\n\r\n',
    ).toJson();
    const root = JSON.parse(once);
    assert('body' in root);
    assertStrictEquals(root.body, '');
    assertStrictEquals(HttpMessage.fromJson(once).toJson(), once);
});
