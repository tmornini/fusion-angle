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
        new Request('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/fndCYAsXazdzMUlEGMNIZw', {
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
            path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'fxysGbBPBsnCwJNJsyZnkA',
            token: DEV_TOKEN,
            body: validIdea,
            operationId: 'too-short',
        }),
    );
    assert.equal(res.status, 400);
});

test('public PUT with non-canonical Operation-ID'
+ ' is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'fxysGbBPBsnCwJNJsyZnkA',
            token: DEV_TOKEN,
            body: validIdea,
            operationId: 'AAAAAAAAAAAAAAAAAAAA-B',
        }),
    );
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.match(body.error, /identifier/);
});

test('GET without Operation-ID is not 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/', {
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
            path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gBbNAWlPwMfXZvevoUPhFQ',
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
    const rows = await db.messagePairs.getAll();
    const written = rows.find((r) => r.uri_id === 'gBbNAWlPwMfXZvevoUPhFQ');
    assert.ok(written);
    assert.equal(written.method, 'PUT');
    assert.equal(written.operation_id, TEST_OPERATION_ID);
});

// 22-char id distinct from TEST_OPERATION_ID so the
// envelope pin cannot pass by accident on fixture ids.
const ROTATION_OP = 'RotationOpId000000000w';

test('rotation envelope copies Operation-ID onto every'
+ ' token-event pair',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const seed = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + 'udpCrXJSdUfkFbImFbBsWw',
            token: DEV_TOKEN,
            body: {
                jti: 'kHAXckusBqJjgcJLEuEurg',
                identity_id: 'XXZruirZyAOoRpNxaDnpSA',
                action: 'issued',
                chain_id: 'RotationChainId000000w',
                at: '2026-01-01T00:00:00.000000Z',
            },
        }),
    );
    assert.equal(seed.status, 201);
    const before = new Set(
        (await db.messagePairs.getAll()).map((r) => r.id),
    );
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'POST',
            path: '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + 'kHAXckusBqJjgcJLEuEurg/rotation',
            token: DEV_TOKEN,
            body: {},
            operationId: ROTATION_OP,
        }),
    );
    assert.equal(res.status, 201);
    const fresh = (await db.messagePairs.getAll())
        .filter((r) => !before.has(r.id));
    assert.ok(fresh.length > 1);
    const outer = fresh.find((r) =>
        r.uri_collection
            === '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + 'kHAXckusBqJjgcJLEuEurg/rotation/',
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
            'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'invitations/',
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
