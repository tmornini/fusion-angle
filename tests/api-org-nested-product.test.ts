import { assert, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedAdminSchema } from
    './test-fixtures.ts';
import { organizationToken } from
    './token-fixtures.ts';
import { routes, matchRoute } from
    '../api/routes.ts';
import { pathSegmentsOf } from
    '../api/path-segments.ts';

Deno.test('flat GET /ideas/ is not a door', () => {
    assertStrictEquals(
        matchRoute(
            routes, pathSegmentsOf('/ideas/'),
        ),
        null,
    );
});

Deno.test('GET /organizations/:id/ideas/ is the'
    + ' collection', () => {
    const match = matchRoute(
        routes,
        pathSegmentsOf('/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'),
    );
    assert(match);
    assertStrictEquals(typeof match.route.get, 'function');
});

Deno.test('GET /organizations/:id/identities is 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(
            'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/identities', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET /organizations/:id/authentication/token'
    + ' is 404', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(
            'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/authentication/token', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 404);
});
