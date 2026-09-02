import { assert, assertStrictEquals } from '@std/assert';
import { routes } from '../api/routes.ts';

function routeNamed(pattern: string) {
    return routes.find((row) =>
        row.segments.join('/') === pattern);
}

Deno.test('authentication/token offers POST', () => {
    const row = routeNamed('authentication/token');
    assert(row);
    assertStrictEquals(typeof row.post, 'function');
    assertStrictEquals(row.get, undefined);
    assertStrictEquals(row.put, undefined);
});

Deno.test('authentication/authorize offers POST',
() => {
    const row = routeNamed(
        'authentication/authorize',
    );
    assert(row);
    assertStrictEquals(typeof row.post, 'function');
});
