import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpMessage } from '../api/http-message/http-message.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

test('round-trips a chunked response carrying a trailer', () => {
    const wire =
        'HTTP/1.1 200 OK\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n' +
        'x-checksum: abc\r\n' +
        '\r\n';
    assert.equal(HttpMessage.fromWire(wire).toWire(), wire);
});

test('collapses multiple chunks into one canonical chunk', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '3\r\nhel\r\n' +
        '2\r\nlo\r\n' +
        '0\r\n' +
        'x-trace: 1\r\n' +
        '\r\n',
    );
    assert.equal(
        message.toWire(),
        'HTTP/1.1 200 OK\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n' +
        'x-trace: 1\r\n' +
        '\r\n',
    );
});

test('collapses chunked without a trailer to length', () => {
    const message = HttpMessage.fromWire(
        'POST / HTTP/1.1\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n\r\n',
    );
    assert.equal(
        message.toWire(),
        'POST / HTTP/1.1\r\n' +
        'content-length: 5\r\n' +
        '\r\n' +
        'hello',
    );
});

test('JSON carries the trailer when chunked', () => {
    const json = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n' +
        'x-sum: z\r\n' +
        '\r\n',
    ).toJson();
    assert.deepEqual(JSON.parse(json).trailer, [['x-sum', 'z']]);
});

test('rejects both content-length and transfer-encoding', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'POST / HTTP/1.1\r\n' +
            'content-length: 5\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            'hello',
        ),
        HttpMessageError,
    );
});

test('rejects chunk extensions', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5;ext=1\r\nhello\r\n' +
            '0\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects an unsupported transfer-coding', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: gzip\r\n' +
            '\r\n' +
            'hello',
        ),
        HttpMessageError,
    );
});

test('rejects an unterminated chunk-size line', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5',
        ),
        HttpMessageError,
    );
});

test('rejects a chunk shorter than its declared size', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5\r\nhi',
        ),
        HttpMessageError,
    );
});

test('rejects chunk data not terminated by CRLF', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5\r\nhelloXX0\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects an invalid hex chunk size', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            'zz\r\nhello\r\n0\r\n\r\n',
        ),
        HttpMessageError,
    );
});

test('rejects an unterminated trailer section', () => {
    assert.throws(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5\r\nhello\r\n0\r\nx-sum: z',
        ),
        HttpMessageError,
    );
});
