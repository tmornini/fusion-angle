import { assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Objectives' versions route: GET
// organizations/:id/objectives/:id/versions. Uses
// seedAdminSchema (not postMockDataLoad) so the suite stays
// self-contained; seeded genesis lives in mock-data/drift
// pins. Writes go through the live gate.

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test('GET organizations/:id/objectives/:id/versions carries the'
+ ' objective rows, oldest first', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , token, {
            position: 1, state: 'active',
        },
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , token, {
            position: 1, state: 'archived',
        },
    ));
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            + '/versions/', token,
    ));
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<{
        id: string;
        state: string;
    }>(res);
    assertStrictEquals(parts.length, 2);
    const oldest = parts[0]!.body().toValue();
    const current = parts[parts.length - 1]!
        .body().toValue();
    assertStrictEquals(current.id, id);
    assertStrictEquals(current.state, 'archived');
    assertStrictEquals(oldest.id, id);
    assertStrictEquals(oldest.state, 'active');
    assertStrictEquals('state_at' in current, false);
});
