import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET, handleRequest } from '../api/api.ts';
import { hashPassword } from '../api/password-hash.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

function jsonPost(path: string, body: unknown): Request {
    return new Request(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const authorize = (b: unknown) =>
    jsonPost('authentication/authorize', b);
const token = (b: unknown) =>
    jsonPost('authentication/token', b);

async function dbWithPasswordUser(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.identityPii.put('current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await db.identityCredentials.put('c1', {
        identity_id: 'current', kind: 'password',
        status: 'set', secret: await hashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000Z',
    });
    return db;
}

test('password login issues a code exchangeable for a token',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);   // 'current' is admin
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
    }));
    assert.equal(res.status, 200);
    const { code } = await res.json() as { code: string };
    assert.ok(code.length > 0);
    const tok = await handleRequest(db, token({
        grant_type: 'authorization_code', code,
    }));
    assert.equal(tok.status, 200);
    const body = await tok.json() as { access_token: string };
    assert.ok(Array.isArray(
        await GET(db, 'members', body.access_token)));
});

test('a wrong password is a 401 with no code issued',
async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 'WRONG', client_id: 'web',
    }));
    assert.equal(res.status, 401);
    assert.equal(
        (await db.authorizationCodes.getAll()).length, 0);
});

test('an unknown username is the same 401 (no enumeration)',
async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'nobody@example.com',
        password: 's3cret', client_id: 'web',
    }));
    assert.equal(res.status, 401);
});

test('passkey, provider, and oidc are 501 seams', async () => {
    const db = await dbWithPasswordUser();
    for (const method of ['passkey', 'provider', 'oidc']) {
        const res = await handleRequest(db, authorize({
            method, client_id: 'web',
        }));
        assert.equal(res.status, 501);
    }
});

test('an unknown authorize method is a 400', async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, authorize({
        method: 'telepathy',
    }));
    assert.equal(res.status, 400);
});
