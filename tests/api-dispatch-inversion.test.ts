import { assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { routes, route } from '../api/routes.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { framedRequest } from './http-fixtures.ts';

const BASE = 'http://localhost';

function req(
    method: string, path: string, token?: string,
): Request {
    return framedRequest(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token !== undefined
                ? { 'Authorization': 'Bearer ' + token }
                : {}),
        },
    });
}

Deno.test('an in-table nested organizations route matches',
    async () => {
        const probe = route(
            'organizations/:organization-id/XpBeHmMjsWMQXipgvzBjqA',
            {
                select: async () => ({
                    kind: 'collection',
                    heads: [],
                    lifecycle: 'stateless',
                    reader: { sees: 'whole' },
                }),
            },
        );
        routes.push(probe);
        try {
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            const token = await organizationToken();
            const res = await handleRequest(db, req(
                'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'XpBeHmMjsWMQXipgvzBjqA',
                token,
            ));
            assertStrictEquals(res.status, 204);
            await res.body?.cancel();
        } finally {
            const i = routes.indexOf(probe);
            if (i >= 0) routes.splice(i, 1);
        }
    });

Deno.test('unmatched slashless organizations ideas is 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas', token,
        ));
        assertStrictEquals(res.status, 404);
    });

Deno.test('in-table slashed organizations ideas is 204',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', token,
        ));
        assertStrictEquals(res.status, 204);
    });

Deno.test('unauthenticated in-table nested path answers the '
    + 'gate 401, not the facade 401', async () => {
    const probe = route(
        'organizations/:organization-id/XpBeHmMjsWMQXipgvzBjqA',
        {
            select: async () => ({
                kind: 'collection',
                heads: [],
                lifecycle: 'stateless',
                reader: { sees: 'whole' },
            }),
        },
    );
    routes.push(probe);
    try {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'XpBeHmMjsWMQXipgvzBjqA',
        ));
        assertStrictEquals(res.status, 401);
        const body = await res.json();
        assertStrictEquals(body.error, 'invalid_token');
    } finally {
        const i = routes.indexOf(probe);
        if (i >= 0) routes.splice(i, 1);
    }
});

Deno.test('a GET on a route that selects nothing is 405',
async () => {
    const probe = route(
        'organizations/:organization-id/YpBeHmMjsWMQXipgvzBjqA',
        { put: async () => {} },
    );
    routes.push(probe);
    try {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'YpBeHmMjsWMQXipgvzBjqA',
            await organizationToken(),
        ));
        assertStrictEquals(res.status, 405);
        await res.body?.cancel();
    } finally {
        routes.splice(routes.indexOf(probe), 1);
    }
});
