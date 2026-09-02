import { assert, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedAdminSchema } from
    './test-fixtures.ts';
import { organizationToken } from
    './token-fixtures.ts';

const BASE = 'http://localhost';

Deno.test('GET /identities/ is the collection',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(BASE + '/identities/', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 200);
    assert(Array.isArray(await res.json()));
});

Deno.test('GET /identities is 404 when authenticated',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(BASE + '/identities', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET /identities/:id/ trailing slash is 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(
            BASE + '/identities/oHNDEvvUUwOvzRwyvbnjag/', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 404);
});
