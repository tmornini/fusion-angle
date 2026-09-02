import { assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { ideaBody, seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const MEMBER = generateIdentifier();

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

async function memberDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationMember(db, MEMBER);
    return db;
}

Deno.test('a member reads and writes the content surfaces',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'fndCYAsXazdzMUlEGMNIZw', token, {
            ...ideaBody('AjdvjuECVZEgZoFajaIEkg', 'mine'),
            state: 'active',
        }));
    assertStrictEquals(put.status, 201);
    const list = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            , token));
    assertStrictEquals(list.status, 200);
    const roster = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , token));
    assertStrictEquals(roster.status, 200);
});

Deno.test('a member is denied the admin surfaces', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    // Admin surfaces stay deny-by-default. The
    // retired snapshot plane is gone, not probed.
    for (const [method, path] of [
        ['GET', '/identities/'],
        ['PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg'],
        ['PUT', '/ai-agents/UuvoBhQJUSEsiJwscXPkUg'],
    ] as const) {
        const res = await handleRequest(db, req(
            method, path, token,
            method === 'PUT' ? {} : undefined));
        assertStrictEquals(
            res.status, 403, method + ' ' + path);
    }
    // role-grants retired — unknown route is 404 for an
    // authenticated caller (401-before-404 still holds
    // unauthenticated).
    const grant = await handleRequest(db, req(
        'PUT', '/role-grants/evil', token, {
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: MEMBER, role: 'admin',
            action: 'granted', by_member_id: MEMBER,
            at: '2026-06-10T00:00:00.000000Z',
        }));
    assertStrictEquals(grant.status, 404);
});

Deno.test('GET /identity-pii is retired (router 404)',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(
        db, req('GET', '/identity-pii', token));
    assertStrictEquals(res.status, 404);
});

Deno.test('GET /identity-pii is retired for an admin'
+ ' (router 404)', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await devToken();
    const res = await handleRequest(
        db, req('GET', '/identity-pii', token));
    assertStrictEquals(res.status, 404);
});

Deno.test('GET /identities/:id/tokens 403s for a member'
+ ' (not in MEMBER_VERBS GET)', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', token));
    assertStrictEquals(res.status, 403);
});

Deno.test('POST /identities/:id/tokens/:jti/rotation 409s for a'
+ ' member on an unknown jti', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'POST',
        '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/WXubsOcLOMVSdMBzlNkAxQ/'
            + 'rotation',
        token, {},
    ));
    assertStrictEquals(res.status, 409);
});

Deno.test('POST /identity-tokens/:jti/rotation is retired'
+ ' (router 404) for a member', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'POST', '/identity-tokens/WXubsOcLOMVSdMBzlNkAxQ/rotation',
        token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('member PUT identities/:id/token-revocations/:rid'
+ ' naming self succeeds 201', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/' + MEMBER + '/token-revocations/lddMYodFzjKgtHPpQFmezw',
        token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assertStrictEquals(res.status, 201);
});

Deno.test('member PUT identities/:id/token-revocations/:rid'
+ ' naming another identity 403s', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/uTGrEpVpODbNhDhDVdWeqQ/token-revocations/'
            + 'ljtoDNOaHCQRyXRGBBeAZA',
        token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assertStrictEquals(res.status, 403);
});

Deno.test('GET identities/:id/token-revocations/:rid 403s for'
+ ' a member (not in MEMBER_VERBS GET)', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'GET',
        '/identities/' + MEMBER + '/token-revocations/rOEPOcVMQdJiiiMuiiEhlg',
        token,
    ));
    assertStrictEquals(res.status, 403);
});

Deno.test('GET /identity-token-revocations/:rid is retired'
+ ' (router 404) for a member', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'GET', '/identity-token-revocations/rOEPOcVMQdJiiiMuiiEhlg', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT /identity-token-revocations/:rid is retired'
+ ' (router 404) for a member', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/rOEPOcVMQdJiiiMuiiEhlg', token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assertStrictEquals(res.status, 404);
});
