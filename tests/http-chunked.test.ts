import { assertEquals, assertStrictEquals, assertThrows } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

Deno.test('round-trips a chunked response carrying a trailer', () => {
    const wire =
        'HTTP/1.1 200 OK\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n' +
        'x-checksum: abc\r\n' +
        '\r\n';
    assertStrictEquals(HttpMessage.fromWire(wire).toWire(), wire);
});

Deno.test('collapses multiple chunks into one canonical chunk', () => {
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
    assertStrictEquals(
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

Deno.test('collapses chunked without a trailer to length', () => {
    const message = HttpMessage.fromWire(
        'POST / HTTP/1.1\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n\r\n',
    );
    assertStrictEquals(
        message.toWire(),
        'POST / HTTP/1.1\r\n' +
        'content-length: 5\r\n' +
        '\r\n' +
        'hello',
    );
});

Deno.test('JSON carries the trailer when chunked', () => {
    const json = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'transfer-encoding: chunked\r\n' +
        '\r\n' +
        '5\r\nhello\r\n' +
        '0\r\n' +
        'x-sum: z\r\n' +
        '\r\n',
    ).toJson();
    assertEquals(JSON.parse(json).trailer, [['x-sum', 'z']]);
});

Deno.test('rejects both content-length and transfer-encoding', () => {
    assertThrows(
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

Deno.test('rejects chunk extensions', () => {
    assertThrows(
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

Deno.test('rejects an unsupported transfer-coding', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: gzip\r\n' +
            '\r\n' +
            'hello',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects an unterminated chunk-size line', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a chunk shorter than its declared size', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5\r\nhi',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects chunk data not terminated by CRLF', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5\r\nhelloXX0\r\n\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects an invalid hex chunk size', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            'zz\r\nhello\r\n0\r\n\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects an unterminated trailer section', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'HTTP/1.1 200 OK\r\n' +
            'transfer-encoding: chunked\r\n' +
            '\r\n' +
            '5\r\nhello\r\n0\r\nx-sum: z',
        ),
        HttpMessageError,
    );
});
