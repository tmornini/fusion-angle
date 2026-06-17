import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

test('withFieldPut overwrites an existing field', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
        .withFieldPut('host', 'b');
    assert.equal(message.query('header.host').toText(), 'b');
});

test('withFieldPut leaves the original unchanged', () => {
    const original = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\nhost: a\r\n\r\n',
    );
    original.withFieldPut('host', 'b');
    assert.equal(original.query('header.host').toText(), 'a');
});

test('withFieldAppended keeps same-name fields', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
        .withFieldAppended('set-cookie', 'x=1')
        .withFieldAppended('set-cookie', 'y=2');
    assert.equal(
        message.query('header.set-cookie.0').toText(),
        'x=1',
    );
    assert.equal(
        message.query('header.set-cookie.1').toText(),
        'y=2',
    );
});

test('withFieldDeleted removes a field', () => {
    const message = HttpMessage
        .fromWire(
            'GET / HTTP/1.1\r\nhost: a\r\naccept: x\r\n\r\n',
        )
        .withFieldDeleted('accept');
    assert.equal(message.query('header.accept').exists(), false);
});

test('withFieldPut rejects a derived framing field', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
            .withFieldPut('content-length', '5'),
        HttpMessageError,
    );
});

test('withFieldPut rejects a value with CRLF', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withFieldPut('x-evil', 'a\r\ninjected: 1'),
        HttpMessageError,
    );
});

test('withStatus changes the response status line', () => {
    const message = HttpMessage
        .fromWire('HTTP/1.1 200 OK\r\n\r\n')
        .withStatus(404, 'Not Found');
    assert.equal(message.query('status').toNumber(), 404);
    assert.equal(
        message.toWire().split('\r\n')[0],
        'HTTP/1.1 404 Not Found',
    );
});

test('withStatus on a request throws', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withStatus(200, 'OK'),
        HttpMessageError,
    );
});

test('withMethod changes the request method', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\n\r\n')
        .withMethod('HEAD');
    assert.equal(message.query('method').toText(), 'HEAD');
});

test('withTarget rejects a target with CRLF', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withTarget('/ HTTP/1.1\r\nevil: 1'),
        HttpMessageError,
    );
});

test('withTarget rejects a target with a space', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('GET / HTTP/1.1\r\n\r\n')
            .withTarget('/a b'),
        HttpMessageError,
    );
});

test('withStatus rejects a reason with CRLF', () => {
    assert.throws(
        () => HttpMessage
            .fromWire('HTTP/1.1 200 OK\r\n\r\n')
            .withStatus(200, 'OK\r\nevil: 1'),
        HttpMessageError,
    );
});

test('a modified message re-serializes canonically', () => {
    const message = HttpMessage
        .fromWire('GET / HTTP/1.1\r\nhost: a\r\n\r\n')
        .withFieldPut('accept', 'text/html');
    assert.equal(
        message.toWire(),
        'GET / HTTP/1.1\r\naccept: text/html\r\nhost: a\r\n\r\n',
    );
});
