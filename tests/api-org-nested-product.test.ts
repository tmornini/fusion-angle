import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('flat GET /ideas/ is not a door', () => {
    assert.equal(
        matchRoute(
            routes, pathSegmentsOf('/ideas/'),
        ),
        null,
    );
});

test('GET /organizations/:id/ideas/ is the'
    + ' collection', () => {
    const match = matchRoute(
        routes,
        pathSegmentsOf('/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'),
    );
    assert.ok(match);
    assert.equal(typeof match.route.get, 'function');
});

test('GET /organizations/:id/identities is 404',
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
    assert.equal(res.status, 404);
});

test('GET /organizations/:id/authentication/token'
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
    assert.equal(res.status, 404);
});
