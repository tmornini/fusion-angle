import { assertStrictEquals } from '@std/assert';
import {
    pathAndNameOf,
} from '../api/path-and-name.ts';

Deno.test('an id route splits prefix and id', () => {
    const a = pathAndNameOf(
        ['ideas', ':id'],
        ['ideas', '42'],
    );
    assertStrictEquals(a.path, '/ideas/');
    assertStrictEquals(a.uriId, '42');
});

Deno.test('a collection route has the empty id', () => {
    const a = pathAndNameOf(['ideas'], ['ideas']);
    assertStrictEquals(a.path, '/ideas/');
    assertStrictEquals(a.uriId, '');
});

Deno.test('a nested id route keeps the parent in the prefix',
() => {
    const a = pathAndNameOf(
        ['ideas', ':id', 'submissions', ':sid'],
        ['ideas', '42', 'submissions', '7'],
    );
    assertStrictEquals(a.path, '/ideas/42/submissions/');
    assertStrictEquals(a.uriId, '7');
});

Deno.test('an operation route is collection-shaped', () => {
    // POST ideas/:id/conversion — trailing literal segment
    const a = pathAndNameOf(
        ['ideas', ':id', 'conversion'],
        ['ideas', '42', 'conversion'],
    );
    assertStrictEquals(a.path, '/ideas/42/conversion/');
    assertStrictEquals(a.uriId, '');
});

Deno.test('pathAndNameOf names path', () => {
    const addr = pathAndNameOf(
        ['ideas', ':id'], ['ideas', '42'],
    );
    assertStrictEquals(addr.path, '/ideas/');
    assertStrictEquals(addr.uriId, '42');
});
