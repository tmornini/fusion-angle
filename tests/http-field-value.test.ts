import { assertStrictEquals, assertThrows } from '@std/assert';
import { FieldValue } from '../shared/http-message/field-value.ts';
import { HttpMessageError } from '../shared/http-message/types.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';

Deno.test('exists is false for an absent value', () => {
    assertStrictEquals(FieldValue.absent().exists(), false);
});

Deno.test('exists is true for a present value', () => {
    assertStrictEquals(FieldValue.present('x').exists(), true);
});

Deno.test('toText returns a present string leaf', () => {
    assertStrictEquals(
        FieldValue.present('text/html').toText(),
        'text/html',
    );
});

Deno.test('toNumber returns a numeric leaf', () => {
    assertStrictEquals(FieldValue.present(3600).toNumber(), 3600);
});

Deno.test('toNumber parses a numeric string leaf', () => {
    assertStrictEquals(FieldValue.present('42').toNumber(), 42);
});

Deno.test('toBoolean returns a boolean leaf', () => {
    assertStrictEquals(FieldValue.present(true).toBoolean(), true);
});

Deno.test('toDate parses an IMF-fixdate string', () => {
    const date = FieldValue.present(
        'Sun, 06 Nov 1994 08:49:37 GMT',
    ).toDate();
    assertStrictEquals(
        date.getTime(),
        Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

Deno.test('toNumber on an absent value throws', () => {
    assertThrows(
        () => FieldValue.absent().toNumber(),
        HttpMessageError,
    );
});

Deno.test('toText on an absent value throws', () => {
    assertThrows(
        () => FieldValue.absent().toText(),
        HttpMessageError,
    );
});

Deno.test('toNumber on a non-numeric string throws', () => {
    assertThrows(
        () => FieldValue.present('abc').toNumber(),
        HttpMessageError,
    );
});

Deno.test('toBoolean on a numeric leaf throws', () => {
    assertThrows(
        () => FieldValue.present(1).toBoolean(),
        HttpMessageError,
    );
});

Deno.test('toDate on a non-date string throws', () => {
    assertThrows(
        () => FieldValue.present('nope').toDate(),
        HttpMessageError,
    );
});

Deno.test('toString delegates to toText', () => {
    assertStrictEquals(FieldValue.present('abc').toString(), 'abc');
});

Deno.test('toDate on a numeric leaf throws', () => {
    assertThrows(
        () => FieldValue.present(5).toDate(),
        HttpMessageError,
    );
});

Deno.test('toDate on an invalid month name throws', () => {
    assertThrows(
        () => FieldValue.present(
            'Sun, 06 Zzz 1994 08:49:37 GMT',
        ).toDate(),
        HttpMessageError,
    );
});

Deno.test('a byte-sequence list member decodes to base64', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: :aGVsbG8=:\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.0').toBase64(),
        'aGVsbG8=',
    );
});

Deno.test('toText on a byte-sequence leaf throws', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: :aGVsbG8=:\r\n\r\n',
    );
    assertThrows(
        () => message.query('header.accept-encoding.0').toText(),
        HttpMessageError,
    );
});

Deno.test('an sf-date member resolves to a Date', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: @1659578233\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.0')
            .toDate().getTime(),
        1659578233 * 1000,
    );
});

Deno.test('toText on an sf-date leaf throws', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: @1659578233\r\n\r\n',
    );
    assertThrows(
        () => message.query('header.accept-encoding.0').toText(),
        HttpMessageError,
    );
});

Deno.test('a display string percent-decodes to UTF-8', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: %"caf%c3%a9"\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.0').toText(),
        'café',
    );
});

Deno.test('a display string with no escapes decodes verbatim', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: %"hello"\r\n\r\n',
    );
    assertStrictEquals(
        message.query('header.accept-encoding.0').toText(),
        'hello',
    );
});
