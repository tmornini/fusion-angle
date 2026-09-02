import { assertStrictEquals } from '@std/assert';
import {
    messageAddress,
} from '../api/message-address.ts';

Deno.test('an id route splits prefix and id', () => {
    const a = messageAddress(
        ['ideas', ':id'],
        ['ideas', '42'],
    );
    assertStrictEquals(a.uriCollection, '/ideas/');
    assertStrictEquals(a.uriId, '42');
});

Deno.test('a collection route has the empty id', () => {
    const a = messageAddress(['ideas'], ['ideas']);
    assertStrictEquals(a.uriCollection, '/ideas/');
    assertStrictEquals(a.uriId, '');
});

Deno.test('a nested id route keeps the parent in the prefix',
() => {
    const a = messageAddress(
        ['ideas', ':id', 'submissions', ':sid'],
        ['ideas', '42', 'submissions', '7'],
    );
    assertStrictEquals(a.uriCollection, '/ideas/42/submissions/');
    assertStrictEquals(a.uriId, '7');
});

Deno.test('an operation route is collection-shaped', () => {
    // POST ideas/:id/conversion — trailing literal segment
    const a = messageAddress(
        ['ideas', ':id', 'conversion'],
        ['ideas', '42', 'conversion'],
    );
    assertStrictEquals(a.uriCollection, '/ideas/42/conversion/');
    assertStrictEquals(a.uriId, '');
});

Deno.test('messageAddress names uriCollection', () => {
    const addr = messageAddress(
        ['ideas', ':id'], ['ideas', '42'],
    );
    assertStrictEquals(addr.uriCollection, '/ideas/');
    assertStrictEquals(addr.uriId, '42');
});
