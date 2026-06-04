import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import { hashPassword } from '../api/password-hash.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    loginViaPassword,
} from '../web-app/app/adapters/authentication.ts';

async function passwordUserCtx() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.roleGrants.put('rg', {
        identity_id: 'current', role: 'admin',
        action: 'granted', by_member_id: 'system',
        at: '2020-01-01T00:00:00.000Z',
    });
    await db.identityPii.put('current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await db.identityCredentials.put('c1', {
        identity_id: 'current', kind: 'password',
        status: 'set', secret: await hashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000Z',
    });
    const ctx = createRequestContext(
        db, await devToken('anonymous'));
    return { db, ctx };
}

test('loginViaPassword returns a gate-valid token', async () => {
    const { db, ctx } = await passwordUserCtx();
    const tok = await loginViaPassword(
        ctx, 'demo@example.com', 's3cret');
    assert.ok(tok);
    assert.ok(Array.isArray(await GET(db, 'members', tok)));
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
