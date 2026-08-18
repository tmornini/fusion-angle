import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { routes, route } from '../api/routes.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

const BASE = 'http://localhost';

function req(
    method: string, path: string, token?: string,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token !== undefined
                ? { 'Authorization': 'Bearer ' + token }
                : {}),
        },
    });
}

test('an in-table nested organizations route matches',
    async () => {
        const probe = route(
            'organizations/:organization-id/dispatch-probe',
            { get: async () => ({ probed: true }) },
        );
        routes.push(probe);
        try {
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            const token = await organizationToken();
            const res = await handleRequest(db, req(
                'GET', '/organizations/1/dispatch-probe',
                token,
            ));
            assert.equal(res.status, 200);
            assert.deepEqual(
                await res.json(), { probed: true },
            );
        } finally {
            const i = routes.indexOf(probe);
            if (i >= 0) routes.splice(i, 1);
        }
    });

test('unmatched slashless organizations ideas is 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'GET', '/organizations/1/ideas', token,
        ));
        assert.equal(res.status, 404);
    });

test('in-table slashed organizations ideas is 200',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'GET', '/organizations/1/ideas/', token,
        ));
        assert.equal(res.status, 200);
    });

test('unauthenticated in-table nested path answers the '
    + 'gate 401, not the facade 401', async () => {
    const probe = route(
        'organizations/:organization-id/dispatch-probe',
        { get: async () => ({ probed: true }) },
    );
    routes.push(probe);
    try {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(db, req(
            'GET', '/organizations/1/dispatch-probe',
        ));
        assert.equal(res.status, 401);
        const body = await res.json();
        assert.equal(body.error, 'invalid_token');
    } finally {
        const i = routes.indexOf(probe);
        if (i >= 0) routes.splice(i, 1);
    }
});
