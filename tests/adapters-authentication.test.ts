import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import { hashPassword } from '../api/password-hash.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    loginViaPassword,
} from '../web-app/app/adapters/authentication.ts';

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

async function passwordUserCtx() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.roleGrants.put('rg', {
        organization_id: '1',
        identity_id: 'current', role: 'admin',
        action: 'granted', by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await db.memberships.put('m', {
        organization_id: '1',
        identity_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await db.identityPii.put('current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await db.identityCredentials.put('c1', {
        identity_id: 'current', kind: 'password',
        status: 'set', secret: await hashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000000Z',
    });
    const ctx = createRequestContext(
        db, await devToken('anonymous'));
    return { db, ctx };
}

test('loginViaPassword returns a gate-valid credential pair',
async () => {
    const { db, ctx } = await passwordUserCtx();
    const creds = await loginViaPassword(
        ctx, 'demo@example.com', 's3cret');
    assert.ok(creds);
    assert.ok(Array.isArray(
        await GET(db, 'members', creds.accessToken)));
});

test('loginViaPassword issues a 30-day refresh token',
async () => {
    const { ctx } = await passwordUserCtx();
    const creds = await loginViaPassword(
        ctx, 'demo@example.com', 's3cret');
    assert.ok(creds);
    const claims = decodeAccessToken(creds.refreshToken);
    assert.equal(
        claims.exp - claims.iat, REFRESH_TTL_SECONDS);
});

test('loginViaPassword returns null on a wrong password',
async () => {
    const { ctx } = await passwordUserCtx();
    assert.equal(
        await loginViaPassword(
            ctx, 'demo@example.com', 'WRONG'),
        null);
});

test('loginViaPassword returns null for an unknown user',
async () => {
    const { ctx } = await passwordUserCtx();
    assert.equal(
        await loginViaPassword(
            ctx, 'ghost@example.com', 's3cret'),
        null);
});

test('loginViaPassword rethrows a non-401 fault, never masks',
async () => {
    // An upstream 500 / network fault is a BUG, not a wrong
    // password — it must surface, not collapse to null.
    const ctx = {
        POST: async () => {
            throw new Error('upstream 500');
        },
    } as unknown as RequestContext;
    await assert.rejects(
        () => loginViaPassword(ctx, 'a@b.c', 'pw'),
        /upstream 500/);
});
