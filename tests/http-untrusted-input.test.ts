import { assertThrows } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';

Deno.test('rejects wire with no header/body boundary', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'GET / HTTP/1.1\r\nhost: x\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a field line without a colon', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'GET / HTTP/1.1\r\nbadfield\r\n\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects content-length that disagrees with body', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'POST / HTTP/1.1\r\ncontent-length: 99\r\n\r\nhi',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects an invalid method token', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'G@T / HTTP/1.1\r\nhost: x\r\n\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a non-numeric status code', () => {
    assertThrows(
        () => HttpMessage.fromWire('HTTP/1.1 XX OK\r\n\r\n'),
        HttpMessageError,
    );
});

Deno.test('rejects a status code out of range', () => {
    assertThrows(
        () => HttpMessage.fromWire('HTTP/1.1 099 Low\r\n\r\n'),
        HttpMessageError,
    );
});

Deno.test('rejects a malformed HTTP-version', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'GET / HTTP/9\r\nhost: x\r\n\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects whitespace before a field colon', () => {
    assertThrows(
        () => HttpMessage.fromWire(
            'GET / HTTP/1.1\r\nhost : x\r\n\r\n',
        ),
        HttpMessageError,
    );
});

Deno.test('rejects a start-line with too few spaces', () => {
    assertThrows(
        () => HttpMessage.fromWire('GET /\r\n\r\n'),
        HttpMessageError,
    );
});
