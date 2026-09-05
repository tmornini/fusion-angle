import {
    assert,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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

Deno.test('public PUT without Operation-ID is 400',
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
    assertStrictEquals(res.status, 400);
});

Deno.test('public PUT with a short Operation-ID is 400',
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
    assertStrictEquals(res.status, 400);
});

Deno.test('public PUT with non-canonical Operation-ID'
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
    assertStrictEquals(res.status, 400);
    const body = await res.json() as { error: string };
    assertMatch(body.error, /identifier/);
});

Deno.test('GET without Operation-ID is not 400',
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
    assertNotStrictEquals(res.status, 400);
});

Deno.test('public PUT with Operation-ID stores both columns',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const operationId = generateIdentifier();
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gBbNAWlPwMfXZvevoUPhFQ',
            token: DEV_TOKEN,
            body: validIdea,
            operationId,
        }),
    );
    assertStrictEquals(res.status, 201);
    assertStrictEquals(
        res.headers.get('Operation-ID'),
        operationId,
    );
    const rows = await db.messagePairs.getAll();
    const written = rows.find((r) => r.uri_id === 'gBbNAWlPwMfXZvevoUPhFQ');
    assert(written);
    assertStrictEquals(written.method, 'PUT');
    assertStrictEquals(written.operation_id, operationId);
});

// 22-char id distinct from the public PUT above so the
// envelope pin cannot pass by accident on fixture ids.
const ROTATION_OP = 'RotationOpId000000000w';

Deno.test('rotation envelope copies Operation-ID onto every'
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
    assertStrictEquals(seed.status, 201);
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
    assertStrictEquals(res.status, 201);
    const fresh = (await db.messagePairs.getAll())
        .filter((r) => !before.has(r.id));
    assert(fresh.length > 1);
    const outer = fresh.find((r) =>
        r.uri_collection
            === '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + 'kHAXckusBqJjgcJLEuEurg/rotation/',
    );
    assert(outer);
    assertStrictEquals(outer.operation_id, ROTATION_OP);
    for (const row of fresh) {
        assertStrictEquals(
            row.operation_id, ROTATION_OP,
            row.uri_collection + row.uri_id,
        );
    }
});

Deno.test('unauthenticated invitation write is 401, not 400',
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
    assertStrictEquals(res.status, 401);
});

// Two helper-shaped writes with identical method, path, and
// body are two requests: apiRequest mints an operation id
// for each, the hashes differ, and the second reaches the
// domain — here an instance create over a live instance,
// which the handler refuses (428, If-Match required on a
// live instance) rather than the ledger serving the
// first's stored 201.
Deno.test('identical helper-shaped writes each reach the'
+ ' domain',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const organization = 'AjdvjuECVZEgZoFajaIEkg';
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const typeId = generateIdentifier();
    const typeDetail = '/organizations/' + organization
        + '/record-types/' + typeId;
    const created = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: typeDetail,
        token: admin,
        body: {
            name: 'Rental',
            description: 'Rental desc',
            position: 1,
            state: 'active',
        },
    }));
    assertStrictEquals(created.status, 201);
    const instanceDetail = typeDetail + '/instances/'
        + generateIdentifier();
    const write = (): Request => apiRequest({
        method: 'PATCH',
        path: instanceDetail,
        token: admin,
        body: { set: [] },
    });
    const first = await handleRequest(db, write());
    const second = await handleRequest(db, write());
    assertStrictEquals(first.status, 201);
    assertStrictEquals(second.status, 428);
});
