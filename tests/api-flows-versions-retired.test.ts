import { assert, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Succession pin: pair-chain GET /organizations/:id/flows/:id/versions is
// 200/404 by document existence. Old table-backed :vid
// stays a miss (404). Writes stay unwired (405).

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

function flowBody() {
    return {
        name: 'Versions Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: '2026-03-01T00:00:00.000000Z',
        state_event_id: generateIdentifier(),
        graph: { nodes: [], edges: [] },
        revivals: [],
        graphDelta: {
            nodes: [],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [],
        },
    };
}

Deno.test('pair-chain GET flow versions; table-backed vid 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const put = await handleRequest(
        db,
        req('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cyLfilTEOVYoZqXJMakKAQ', token, flowBody()),
    );
    assertStrictEquals(put.status, 201);

    const index = await handleRequest(
        db,
        req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cyLfilTEOVYoZqXJMakKAQ/versions/', token),
    );
    assertStrictEquals(index.status, 200);
    const rows = await index.json() as { id: string }[];
    assert(rows.length >= 1);

    const retired = await handleRequest(
        db,
        req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cyLfilTEOVYoZqXJMakKAQ/history', token),
    );
    assertStrictEquals(retired.status, 404);

    const tableVid = await handleRequest(
        db,
        req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'cyLfilTEOVYoZqXJMakKAQ/versions/xVVkkaYdwZkmXhefmdtaBw',
            token,
        ),
    );
    assertStrictEquals(tableVid.status, 404);

    const missing = await handleRequest(
        db,
        req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'nnoFIBfkCuGxgiGxhQpcCQ/versions/', token),
    );
    assertStrictEquals(missing.status, 404);

    const writePaths = [
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/cyLfilTEOVYoZqXJMakKAQ/'
            + 'versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/cyLfilTEOVYoZqXJMakKAQ/'
            + 'versions/xVVkkaYdwZkmXhefmdtaBw',
    ];
    for (const path of writePaths) {
        for (const method of ['POST', 'PUT', 'DELETE']) {
            const res = await handleRequest(
                db, req(method, path, token, {}),
            );
            assertStrictEquals(
                res.status, 405,
                method + ' ' + path,
            );
        }
    }
});
