import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const BASE = 'http://localhost';
const MEMBER = 'walt';

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

test('a member reads and writes the content surfaces',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const put = await handleRequest(db, req(
        'PUT', '/ideas/i1', token, {
            ...ideaBody('1', 'mine'),
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-i1',
        }));
    assert.equal(put.status, 201);
    const list = await handleRequest(
        db, req('GET', '/ideas', token));
    assert.equal(list.status, 200);
    const roster = await handleRequest(
        db, req('GET', '/organizations/1/members', token));
    assert.equal(roster.status, 200);
});

test('a member is denied the admin surfaces', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    // Admin surfaces stay deny-by-default. The
    // retired snapshot plane is gone, not probed.
    for (const [method, path] of [
        ['GET', '/identities'],
        ['PUT', '/organizations/1'],
        ['PUT', '/ai-agents/agent-1'],
    ] as const) {
        const res = await handleRequest(db, req(
            method, path, token,
            method === 'PUT' ? {} : undefined));
        assert.equal(
            res.status, 403, method + ' ' + path);
    }
    // role-grants retired — unknown route is 404 for an
    // authenticated caller (401-before-404 still holds
    // unauthenticated).
    const grant = await handleRequest(db, req(
        'PUT', '/role-grants/evil', token, {
            organization_id: '1',
            identity_id: MEMBER, role: 'admin',
            action: 'granted', by_member_id: MEMBER,
            at: '2026-06-10T00:00:00.000000Z',
        }));
    assert.equal(grant.status, 404);
});

test('GET /identity-pii is retired (router 404)',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(
        db, req('GET', '/identity-pii', token));
    assert.equal(res.status, 404);
});

test('GET /identity-pii is retired for an admin'
+ ' (router 404)', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await devToken();
    const res = await handleRequest(
        db, req('GET', '/identity-pii', token));
    assert.equal(res.status, 404);
});

test('GET /identities/:id/tokens 403s for a member'
+ ' (not in MEMBER_VERBS GET)', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(
        db, req('GET', '/identities/current/tokens', token));
    assert.equal(res.status, 403);
});

test('POST /identities/:id/tokens/:jti/rotation 409s for a'
+ ' member on an unknown jti', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'POST',
        '/identities/current/tokens/bogus-jti/rotation',
        token, {},
    ));
    assert.equal(res.status, 409);
});

test('POST /identity-tokens/:jti/rotation is retired'
+ ' (router 404) for a member', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'POST', '/identity-tokens/bogus-jti/rotation',
        token, {},
    ));
    assert.equal(res.status, 404);
});

test('member PUT identities/:id/token-revocations/:rid'
+ ' naming self succeeds 201', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/' + MEMBER + '/token-revocations/m-rev-1',
        token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assert.equal(res.status, 201);
});

test('member PUT identities/:id/token-revocations/:rid'
+ ' naming another identity 403s', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/someone-else/token-revocations/m-rev-2',
        token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assert.equal(res.status, 403);
});

test('GET identities/:id/token-revocations/:rid 403s for'
+ ' a member (not in MEMBER_VERBS GET)', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'GET',
        '/identities/' + MEMBER + '/token-revocations/r1',
        token,
    ));
    assert.equal(res.status, 403);
});

test('GET /identity-token-revocations/:rid is retired'
+ ' (router 404) for a member', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'GET', '/identity-token-revocations/r1', token,
    ));
    assert.equal(res.status, 404);
});

test('PUT /identity-token-revocations/:rid is retired'
+ ' (router 404) for a member', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/r1', token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assert.equal(res.status, 404);
});
