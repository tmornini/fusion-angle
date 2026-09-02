import { assertEquals } from '@std/assert';
import { pathSegmentsOf } from
    '../api/path-segments.ts';

Deno.test('collection slash keeps a trailing empty',
() => {
    assertEquals(
        pathSegmentsOf('/identities/'),
        ['identities', ''],
    );
});

Deno.test('slashless collection has no empty', () => {
    assertEquals(
        pathSegmentsOf('/identities'),
        ['identities'],
    );
});

Deno.test('item has no trailing empty', () => {
    assertEquals(
        pathSegmentsOf('/identities/abc'),
        ['identities', 'abc'],
    );
});

Deno.test('item with trailing slash keeps empty',
() => {
    assertEquals(
        pathSegmentsOf('/identities/abc/'),
        ['identities', 'abc', ''],
    );
});

Deno.test('root is empty', () => {
    assertEquals(pathSegmentsOf('/'), []);
});
