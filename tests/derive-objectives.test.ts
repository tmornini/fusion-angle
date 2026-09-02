import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { deriveObjectiveStateHistory } from
    '../api/derive-objectives.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Objectives' own state-history reduction (states-address
// retirement): unit-level trio walk + echo dedup, and the
// family history route GET organizations/:id/objectives/:id/versions. Uses
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
        operationId: TEST_OPERATION_ID,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test('deriveObjectiveStateHistory returns the trio walk in'
+ ' (state_at, id) order with echo dedup', async () => {
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
    // a byte-identical echo of ev2 (drag-reorder style
    // re-put) must NOT mint a third event
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , token, {
            position: 2, state: 'archived',
        },
    ));
    const history = await deriveObjectiveStateHistory(
        db, STARK_ORGANIZATION, id,
    );
    assertEquals(
        history.map((r) => r.state),
        ['active', 'archived'],
    );
});

Deno.test('GET organizations/:id/objectives/:id/versions carries the'
+ ' objective trio rows (DESC current-first)', async () => {
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
    const rows = JSON.parse(await res.text()) as {
        id: string; state: string;
    }[];
    assertStrictEquals(rows.length, 2);
    assertStrictEquals(rows[0]!.id, id);
    assertStrictEquals(rows[0]!.state, 'archived');
    assertStrictEquals(rows[1]!.id, id);
    assertStrictEquals(rows[1]!.state, 'active');
    assertStrictEquals('state_at' in rows[0]!, false);
});
