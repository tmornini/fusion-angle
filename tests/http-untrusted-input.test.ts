import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

test('rejects wire with no header/body boundary', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'GET / HTTP/1.1\r\nhost: x\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects a field line without a colon', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'GET / HTTP/1.1\r\nbadfield\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects content-length that disagrees with body', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'POST / HTTP/1.1\r\ncontent-length: 99\r\n\r\nhi',
        ),
        HttpMessageError,
    );
});

test('rejects an invalid method token', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'G@T / HTTP/1.1\r\nhost: x\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects a non-numeric status code', () => {
    assert.throws(
        () => HttpMessage.fromWire('HTTP/1.1 XX OK\r\n\r\n'),
        HttpMessageError,
    );
});

test('rejects a status code out of range', () => {
    assert.throws(
        () => HttpMessage.fromWire('HTTP/1.1 099 Low\r\n\r\n'),
        HttpMessageError,
    );
});

test('rejects a malformed HTTP-version', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'GET / HTTP/9\r\nhost: x\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects whitespace before a field colon', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'GET / HTTP/1.1\r\nhost : x\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects a start-line with too few spaces', () => {
    assert.throws(
        () => HttpMessage.fromWire('GET /\r\n\r\n'),
        HttpMessageError,
    );
});
