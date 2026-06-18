import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

function bodyOf(wire: string): unknown {
    return JSON.parse(HttpMessage.fromWire(wire).toJson()).body;
}

test('a JSON body inlines as a JSON object', () => {
    assert.deepEqual(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/json\r\n\r\n{"b":2,"a":1}',
        ),
        { a: 1, b: 2 },
    );
});

test('inline JSON body keys are sorted', () => {
    const json = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n{"b":2,"a":1}',
    ).toJson();
    assert.match(json, /"body":\{"a":1,"b":2\}/);
});

test('a +json content-type inlines too', () => {
    assert.deepEqual(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/merge-patch+json\r\n\r\n' +
            '{"x":[1,2]}',
        ),
        { x: [1, 2] },
    );
});

test('a JSON array body inlines as an array', () => {
    assert.deepEqual(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/json\r\n\r\n[10,20]',
        ),
        [10, 20],
    );
});

test('a JSON number body inlines as a number', () => {
    assert.equal(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/json\r\n\r\n42',
        ),
        42,
    );
});

test('a JSON null body inlines as null, present not absent', () => {
    const root = JSON.parse(HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\nnull',
    ).toJson());
    assert.ok('body' in root);
    assert.equal(root.body, null);
});

test('a bare JSON string body falls back to base64', () => {
    const value = bodyOf(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n"hi"',
    );
    assert.equal(typeof value, 'string');
    assert.notEqual(value, 'hi');
});

test('a non-JSON content-type body is base64', () => {
    assert.equal(
        bodyOf(
            'HTTP/1.1 200 OK\r\n' +
            'content-type: application/octet-stream\r\n' +
            'content-length: 5\r\n\r\nhello',
        ),
        'aGVsbG8=',
    );
});

test('parses an inline JSON body via fromJson', () => {
    const json = '{"header":[["content-type","application/json"]],'
        + '"status":200,"reason":"OK","version":"HTTP/1.1",'
        + '"body":{"a":1}}';
    assert.equal(
        HttpMessage.fromJson(json).query('body.a').toNumber(),
        1,
    );
});

test('parses a base64 body via fromJson', () => {
    const json = '{"header":'
        + '[["content-type","application/octet-stream"]],'
        + '"status":200,"reason":"OK","version":"HTTP/1.1",'
        + '"body":"aGVsbG8="}';
    assert.match(HttpMessage.fromJson(json).toWire(), /\r\n\r\nhello$/);
});

test('JSON form round-trips a JSON body semantically', () => {
    const viaWire = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n{"user":{"name":"bob"}}',
    );
    const viaJson = HttpMessage.fromJson(viaWire.toJson());
    assert.equal(
        viaJson.query('body.user.name').toText(),
        'bob',
    );
});

test('JSON re-serialization of a JSON body is a fixed point', () => {
    const once = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n{"b":2,"a":1}',
    ).toJson();
    const twice = HttpMessage.fromJson(once).toJson();
    assert.equal(twice, once);
});

test('a large-integer number body survives round-trip', () => {
    const viaWire = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n' +
        '{"id":12345678901234567890}',
    );
    assert.match(viaWire.toJson(), /"id":12345678901234567890/);
    assert.match(
        HttpMessage.fromJson(viaWire.toJson()).toWire(),
        /\{"id":12345678901234567890\}$/,
    );
});

test('a bare large-integer body round-trips exactly', () => {
    const json = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n\r\n' +
        '98765432109876543210',
    ).toJson();
    assert.match(json, /"body":98765432109876543210/);
    assert.match(
        HttpMessage.fromJson(json).toWire(),
        /\r\n\r\n98765432109876543210$/,
    );
});

test('rejects an invalid base64 body at the gate', () => {
    const json = '{"header":'
        + '[["content-type","application/octet-stream"]],'
        + '"status":200,"reason":"OK","version":"HTTP/1.1",'
        + '"body":"!!!not base64!!!"}';
    assert.throws(
        () => HttpMessage.fromJson(json),
        HttpMessageError,
    );
});

test('an empty JSON body round-trips via base64', () => {
    const once = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/json\r\n' +
        'content-length: 0\r\n\r\n',
    ).toJson();
    const root = JSON.parse(once);
    assert.ok('body' in root);
    assert.equal(root.body, '');
    assert.equal(HttpMessage.fromJson(once).toJson(), once);
});
