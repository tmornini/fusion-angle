import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, PUT, handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

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
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test(
    'PUT identity + seat creates a seated person',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const put = await handleRequest(db, req(
            'PUT', '/identities/w1', token, {
                kind: 'person',
                title: 'Engineer',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
        ));
        assert.ok(put.status === 201 || put.status === 200);
        await PUT(db, 'identities/w1/pii', {
            name: 'Alice',
            email: 'alice@example.com',
            phone: '',
            bio: '',
        }, token);
        const seat = await handleRequest(db, req(
            'PUT', '/organizations/1/members/w1', token, {
                type: 'member',
                at: AT,
            },
        ));
        assert.ok(
            seat.status === 201 || seat.status === 200,
        );
        const row = await GET<{
            kind: string; title: string;
        }>(db, 'identities/w1', token);
        assert.equal(row.kind, 'person');
        assert.equal(row.title, 'Engineer');
        const seats = await GET<{ id: string }[]>(
            db, 'organizations/1/members/', token,
        );
        assert.ok(seats.some(s => s.id === 'w1'));
    },
);

test('POST /human-members is retired 404', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN, {
            id: 'w1',
            detail: {},
        },
    ));
    assert.equal(res.status, 404);
});
