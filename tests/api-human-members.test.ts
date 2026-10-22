import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET, GETCollection } from './in-page-facade.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test(
    'a memberships POST creates the person',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const organization = 'AjdvjuECVZEgZoFajaIEkg';
        const identity = 'xdaJyuuPyHfffCGLhqDrOQ';
        const created = await handleRequest(db, req(
            'POST',
            '/organizations/' + organization
                + '/memberships/',
            token,
            {
                id: identity,
                kind: 'human',
                membership: {
                    type: 'member',
                    at: AT,
                },
                identity: {
                    title: 'Engineer',
                    department: 'Product',
                    strengths: [],
                    team_dimensions: {},
                },
                pii: {
                    name: 'Alice',
                    email: 'alice@example.com',
                    phone: '',
                    bio: '',
                },
            },
        ));
        assertStrictEquals(created.status, 201);
        await created.body?.cancel();
        const row = (await GET<{
            kind: string; title: string;
        }>(db, 'identities/' + identity, token,
            operationIdHeader())).body().toValue();
        assertStrictEquals(row.kind, 'person');
        assertStrictEquals(row.title, 'Engineer');
        const seats = (await GETCollection<{
            identity_id: string;
        }>(
            db, 'organizations/' + organization
                + '/memberships/?state=accepted',
            token,
            operationIdHeader()))
            .map((part) => part.body().toValue());
        assert(seats.some(
            (s) => s.identity_id === identity,
        ));
    },
);

Deno.test('POST /human-members is retired 404', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN, {
            id: 'xdaJyuuPyHfffCGLhqDrOQ',
            detail: {},
        },
    ));
    assertStrictEquals(res.status, 404);
});

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

Deno.test(
    'an admin cannot replace strengths on a'
    + ' membership-less identity',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/identities/xdaJyuuPyHfffCGLhqDrOQ';
        const before = (await db.messagePairs.getAll()).length;
        const first = await handleRequest(db, apiRequest({
            method: 'PUT', path, token,
            body: {
                kind: 'person',
                title: 'Admin',
                department: 'Ops',
                strengths: [
                    'Strategic Planning',
                    'Data Analysis',
                    'Stakeholder Management',
                ],
                team_dimensions: {},
            },
        }));
        assertStrictEquals(first.status, 403);
        assertEquals(await first.json(), {
            error: outside('PUT', path),
        });
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);
