import {
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { HttpMessageError } from
    '../shared/http-message/types.ts';

type Row = { readonly id: string; readonly n: number };

const row = HttpMessage.fromWire<Row>(
    'HTTP/1.1 200 \r\n'
        + 'content-length: 17\r\n'
        + 'content-type: application/json\r\n'
        + '\r\n'
        + '{"id":"a","n":42}',
);

Deno.test('toValue decodes the body by its content-type',
() => {
    const value: Row = row.body().toValue();
    assertEquals(value, { id: 'a', n: 42 });
});

Deno.test('toValue returns a whole array body', () => {
    const list = HttpMessage.fromWire<number[]>(
        'HTTP/1.1 200 \r\n'
            + 'content-type: application/json\r\n'
            + '\r\n'
            + '[1,2,3]',
    );
    assertEquals(list.body().toValue(), [1, 2, 3]);
});

Deno.test('toValue reads UTF-8 text', () => {
    const bytes = new TextEncoder().encode('{"name":"Zoë"}');
    let latin1 = '';
    for (const byte of bytes) latin1 += String.fromCharCode(byte);
    const message = HttpMessage.fromWire<{ name: string }>(
        'HTTP/1.1 200 \r\n'
            + 'content-type: application/json\r\n'
            + '\r\n' + latin1,
    );
    assertStrictEquals(message.body().toValue().name, 'Zoë');
});

Deno.test('toValue on a text body is the text', () => {
    const message = HttpMessage.fromWire<string>(
        'HTTP/1.1 200 \r\ncontent-type: text/plain\r\n\r\nhi',
    );
    assertStrictEquals(message.body().toValue(), 'hi');
});

Deno.test('toValue on an absent body throws', () => {
    const empty = HttpMessage.fromWire(
        'HTTP/1.1 204 \r\n\r\n',
    );
    assertThrows(
        () => empty.body().toValue(),
        HttpMessageError,
        'message has no body',
    );
});

Deno.test('toValue without a content-type throws', () => {
    const bare = HttpMessage.fromWire(
        'HTTP/1.1 200 \r\n\r\n{}',
    );
    assertThrows(
        () => bare.body().toValue(),
        HttpMessageError,
        'body has no content-type to decode',
    );
});

Deno.test('toValue refuses a still-encoded body', () => {
    const gzipped = HttpMessage.fromWire(
        'HTTP/1.1 200 \r\n'
            + 'content-encoding: gzip\r\n'
            + 'content-type: application/json\r\n'
            + '\r\n{}',
    );
    assertThrows(
        () => gzipped.body().toValue(),
        HttpMessageError,
        'unsupported content-encoding: gzip',
    );
});

Deno.test('a modification keeps the body type', () => {
    const moved: HttpMessage<Row> = row.withStatus(201, '');
    assertStrictEquals(moved.body().toValue().n, 42);
});
