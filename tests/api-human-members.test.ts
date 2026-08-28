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
            'PUT', '/identities/xdaJyuuPyHfffCGLhqDrOQ', token, {
                kind: 'person',
                title: 'Engineer',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
        ));
        assert.ok(put.status === 201 || put.status === 200);
        await PUT(db, 'identities/xdaJyuuPyHfffCGLhqDrOQ/pii', {
            name: 'Alice',
            email: 'alice@example.com',
            phone: '',
            bio: '',
        }, token);
        const seat = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                + 'xdaJyuuPyHfffCGLhqDrOQ', token, {
                type: 'member',
                at: AT,
            },
        ));
        assert.ok(
            seat.status === 201 || seat.status === 200,
        );
        const row = await GET<{
            kind: string; title: string;
        }>(db, 'identities/xdaJyuuPyHfffCGLhqDrOQ', token);
        assert.equal(row.kind, 'person');
        assert.equal(row.title, 'Engineer');
        const seats = await GET<{ id: string }[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', token,
        );
        assert.ok(seats.some(s => s.id === 'xdaJyuuPyHfffCGLhqDrOQ'));
    },
);

test('POST /human-members is retired 404', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN, {
            id: 'xdaJyuuPyHfffCGLhqDrOQ',
            detail: {},
        },
    ));
    assert.equal(res.status, 404);
});

// AA9's covenant below the browser: a second identity PUT
// REPLACES strengths, so an id toggled on in the same save
// that toggles another off is what the next GET returns.
test(
    'a strengths PUT replaces the list — the toggled-on id'
    + ' persists',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/identities/xdaJyuuPyHfffCGLhqDrOQ';
        const person = (strengths: string[]): unknown => ({
            kind: 'person',
            title: 'Admin',
            department: 'Ops',
            strengths,
            team_dimensions: {},
        });
        const first = await handleRequest(db, apiRequest({
            method: 'PUT', path, token,
            body: person([
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ]),
        }));
        assert.ok(first.status === 201 || first.status === 200);
        const second = await handleRequest(db, apiRequest({
            method: 'PUT', path, token,
            body: person([
                'Strategic Planning',
                'Stakeholder Management',
                'Agile Methods',
            ]),
        }));
        assert.ok(second.status === 201 || second.status === 200);
        const row = await GET<{ strengths: string[] }>(
            db, 'identities/xdaJyuuPyHfffCGLhqDrOQ', token,
        );
        assert.deepEqual(row.strengths, [
            'Strategic Planning',
            'Stakeholder Management',
            'Agile Methods',
        ]);
    },
);
