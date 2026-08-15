import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Succession pin: pair-chain GET /flows/:id/versions is
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
        state_event_id: 'flow-ver-1-ev1',
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

test('pair-chain GET flow versions; table-backed vid 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const put = await handleRequest(
        db,
        req('PUT', '/flows/flow-ver-1', token, flowBody()),
    );
    assert.equal(put.status, 201);

    const index = await handleRequest(
        db,
        req('GET', '/flows/flow-ver-1/versions', token),
    );
    assert.equal(index.status, 200);
    const rows = await index.json() as { id: string }[];
    assert.ok(rows.length >= 1);

    const retired = await handleRequest(
        db,
        req('GET', '/flows/flow-ver-1/history', token),
    );
    assert.equal(retired.status, 404);

    const tableVid = await handleRequest(
        db,
        req(
            'GET', '/flows/flow-ver-1/versions/vid-1',
            token,
        ),
    );
    assert.equal(tableVid.status, 404);

    const missing = await handleRequest(
        db,
        req('GET', '/flows/missing-flow/versions', token),
    );
    assert.equal(missing.status, 404);

    const writePaths = [
        '/flows/flow-ver-1/versions',
        '/flows/flow-ver-1/versions/vid-1',
    ];
    for (const path of writePaths) {
        for (const method of ['POST', 'PUT', 'DELETE']) {
            const res = await handleRequest(
                db, req(method, path, token, {}),
            );
            assert.equal(
                res.status, 405,
                method + ' ' + path,
            );
        }
    }
});
