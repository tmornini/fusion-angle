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

Deno.test('a fake seventh function key throws', () => {
    const row = {
        ...route('identities/', {}),
        head: async () => ({}),
    };
    assertThrows(
        () => offeredVerbs(row),
        Error, 'seventh verb without a seventh column: head',
    );
});

const NO_HEADS = async () => ({
    kind: 'collection' as const,
    heads: [],
    lifecycle: 'stateless' as const,
    reader: { sees: 'whole' as const },
});

Deno.test('a row with selectMatching offers query', () => {
    assertEquals(
        offeredVerbs(route('identities/', {
            selectMatching: NO_HEADS,
        })),
        ['query'],
    );
});

Deno.test('the GET judge query offers no QUERY', () => {
    assertEquals(
        offeredVerbs(route('identities/', {
            select: NO_HEADS,
            query: () => ({ kind: 'every' as const }),
        })),
        ['get'],
    );
});

Deno.test('uriOf keeps the collection slash', () => {
    assertStrictEquals(
        uriOf(route('identities/', {
            select: async () => ({
                kind: 'collection',
                heads: [],
                lifecycle: 'stateless',
                reader: { sees: 'whole' },
            }),
        })),
        '/identities/',
    );
});

Deno.test('uriOf names an item with its param', () => {
    assertStrictEquals(
        uriOf(route('identities/:id', {
            select: async () => ({
                kind: 'collection',
                heads: [],
                lifecycle: 'stateless',
                reader: { sees: 'whole' },
            }),
        })),
        '/identities/:id',
    );
});
