import { assertEquals, assertStrictEquals } from '@std/assert';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import type {
    FieldLine,
    MessageModel,
} from '../shared/http-message/types.ts';

function requestModel(fields: FieldLine[]): MessageModel {
    return {
        startLine: {
            kind: 'request',
            method: 'GET',
            target: '/',
            version: 'HTTP/1.1',
        },
        fields,
        body: undefined,
        trailer: undefined,
    };
}

Deno.test('shuffled field order yields identical wire', () => {
    const a = HttpMessage.fromModel(requestModel([
        { name: 'accept', value: 'text/html' },
        { name: 'host', value: 'example.com' },
        { name: 'user-agent', value: 'probe' },
    ]));
    const b = HttpMessage.fromModel(requestModel([
        { name: 'user-agent', value: 'probe' },
        { name: 'host', value: 'example.com' },
        { name: 'accept', value: 'text/html' },
    ]));
    assertStrictEquals(a.toWire(), b.toWire());
});

Deno.test('canonical wire is sorted ascending by field name', () => {
    const wire = HttpMessage.fromModel(requestModel([
        { name: 'host', value: 'example.com' },
        { name: 'accept', value: 'text/html' },
    ])).toWire();
    const names = wire
        .split('\r\n')
        .slice(1, 3)
        .map((line) => line.split(':')[0]);
    assertEquals(names, ['accept', 'host']);
});

Deno.test('re-serializing canonical wire is a fixed point', () => {
    const once = HttpMessage.fromWire(
        'GET / HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'Accept: text/html\r\n' +
        '\r\n',
    ).toWire();
    const twice = HttpMessage.fromWire(once).toWire();
    assertStrictEquals(twice, once);
});
