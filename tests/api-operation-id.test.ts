import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

const validIdea = {
    title: 'Op id pin',
    position: 1,
    problem_statement: 'p',
    target_users: 't',
    proposed_solution: 's',
    expected_outcome: 'o',
    success_metrics: 'm',
    state: 'active',
};

test('public PUT without Operation-ID is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request('http://localhost/organizations/1/ideas/i1', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + DEV_TOKEN,
            },
            body: JSON.stringify(validIdea),
        }),
    );
    assert.equal(res.status, 400);
});

test('public PUT with a short Operation-ID is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/1/ideas/i2',
            token: DEV_TOKEN,
            body: validIdea,
            operationId: 'too-short',
        }),
    );
    assert.equal(res.status, 400);
});

test('GET without Operation-ID is not 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request('http://localhost/organizations/1/ideas/', {
            headers: {
                Authorization: 'Bearer ' + DEV_TOKEN,
            },
        }),
    );
    assert.notEqual(res.status, 400);
});

test('public PUT with Operation-ID stores both columns',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/1/ideas/i3',
            token: DEV_TOKEN,
            body: validIdea,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert.equal(res.status, 201);
    assert.equal(
        res.headers.get('Operation-ID'),
        TEST_OPERATION_ID,
    );
    const rows = await db.pairs.getAll();
    const written = rows.find((r) => r.uri_id === 'i3');
    assert.ok(written);
    assert.equal(written.method, 'PUT');
    assert.equal(written.operation_id, TEST_OPERATION_ID);
});

// 22-char id distinct from TEST_OPERATION_ID so the
// envelope pin cannot pass by accident on fixture ids.
const ROTATION_OP = 'RotationOpId0000000001';

test('rotation envelope copies Operation-ID onto every'
+ ' token-event pair',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const seed = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/current/tokens/t-root',
            token: DEV_TOKEN,
            body: {
                jti: 'jti-root',
                identity_id: 'current',
                action: 'issued',
                chain_id: 'chain-1',
                at: '2026-01-01T00:00:00.000000Z',
            },
        }),
    );
    assert.equal(seed.status, 201);
    const before = new Set(
        (await db.pairs.getAll()).map((r) => r.id),
    );
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'POST',
            path: '/identities/current/tokens/jti-root/rotation',
            token: DEV_TOKEN,
            body: {},
            operationId: ROTATION_OP,
        }),
    );
    assert.equal(res.status, 201);
    const fresh = (await db.pairs.getAll())
        .filter((r) => !before.has(r.id));
    assert.ok(fresh.length > 1);
    const outer = fresh.find((r) =>
        r.uri_collection
            === '/identities/current/tokens/jti-root/rotation/',
    );
    assert.ok(outer);
    assert.equal(outer.operation_id, ROTATION_OP);
    for (const row of fresh) {
        assert.equal(
            row.operation_id, ROTATION_OP,
            row.uri_collection + row.uri_id,
        );
    }
});

test('unauthenticated invitation write is 401, not 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(
            'http://localhost/organizations/1/invitations/',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            },
        ),
    );
    assert.equal(res.status, 401);
});
