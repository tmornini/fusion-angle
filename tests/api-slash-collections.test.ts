import { assertEquals, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedAdminSchema } from
    './test-fixtures.ts';
import { organizationToken } from
    './token-fixtures.ts';
import { framedRequest, partsOf } from './http-fixtures.ts';

const BASE = 'http://localhost';

Deno.test('GET /identities/ is the collection',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        framedRequest(BASE + '/identities/', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<{ id: string }>(res);
    assertEquals(
        parts.map((part) => part.body().toValue().id),
        ['XXZruirZyAOoRpNxaDnpSA'],
    );
});

Deno.test('GET /identities is 404 when authenticated',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        framedRequest(BASE + '/identities', {
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
        framedRequest(
            BASE + '/identities/oHNDEvvUUwOvzRwyvbnjag/', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assertStrictEquals(res.status, 404);
});
