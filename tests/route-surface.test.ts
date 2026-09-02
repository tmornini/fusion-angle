import {
    assert, assertEquals, assertStrictEquals, assertThrows,
} from '@std/assert';
import { routes, route } from '../api/routes.ts';
import { offeredVerbs, uriOf } from
    '../api/route-surface.ts';

function routeNamed(pattern: string) {
    return routes.find((row) =>
        row.segments.join('/') === pattern);
}

Deno.test('identities collection offers GET and POST',
() => {
    const row = routeNamed('identities/');
    assert(row);
    const verbs = offeredVerbs(row);
    assert(verbs.includes('get'));
    assert(verbs.includes('post'));
});

Deno.test('empty handlers offer nothing', () => {
    assertEquals(
        offeredVerbs(route('identities/', {})),
        [],
    );
});

Deno.test('a fake sixth function key throws', () => {
    const row = {
        ...route('identities/', {}),
        head: async () => ({}),
    };
    assertThrows(
        () => offeredVerbs(row),
        Error, 'sixth verb without a sixth column: head',
    );
});

Deno.test('uriOf keeps the collection slash', () => {
    assertStrictEquals(
        uriOf(route('identities/', {
            get: async () => ({}),
        })),
        '/identities/',
    );
});

Deno.test('uriOf names an item with its param', () => {
    assertStrictEquals(
        uriOf(route('identities/:id', {
            get: async () => ({}),
        })),
        '/identities/:id',
    );
});
