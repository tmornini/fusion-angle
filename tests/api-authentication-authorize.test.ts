import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { GET, handleRequest } from '../api/api.ts';
import { canonicalUriCollection } from '../api/message-pair.ts';
import {
    setPasswordHasher,
    setScryptDerive,
} from '../shared/password-hash.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    seedIdentityCredential,
    seedIdentityPii,
} from './identity-fixtures.ts';
import {
    MS_PER_SECOND, setClockForTest, resetClock,
} from '../api/types.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';
import { deriveCredentialsFor } from
    '../api/derive-identity-spine.ts';
import {
    scryptHash,
    scryptDerive,
} from '../server/scrypt-hash.ts';
import { testHashPassword } from './mock-seed.ts';

const BASE = 'http://localhost';

afterEach(() => {
    setPasswordHasher(testHashPassword);
    setScryptDerive(null);
});

beforeEach(() => {
    setPasswordHasher(testHashPassword);
});

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

async function s256Fields(): Promise<{
    readonly verifier: string;
    readonly code_challenge: string;
    readonly code_challenge_method: 'S256';
}> {
    const verifier = 'pkce-verifier-test';
    return {
        verifier,
        code_challenge: bytesToBase64Url(
            await sha256Bytes(verifier),
        ),
        code_challenge_method: 'S256',
    };
}

// The surviving-plane counterpart of the retired authorization_
// codes row check (Phase 13 Task 9): a failed login appends NO
// stored '/authentication/authorize/' response — authorizePassword
// forms and stores its pair ONLY on the success branch (grant-
// first), so a miss here is the SAME covenant the row-plane count
// used to pin.
async function noStoredAuthorizeResponse(
    db: MemoryDbAdapter,
): Promise<boolean> {
    const responses = await db.pairs.getAllWhere(
        'uri_collection',
        canonicalUriCollection(undefined, '/authentication/authorize/'),
    );
    return responses.length === 0;
}

async function dbWithPasswordUser(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedIdentityPii(db, 'current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await seedIdentityCredential(db, 'current', 'c1', {
        identity_id: 'current', kind: 'password',
        status: 'set',
        secret: await testHashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000000Z',
    });
    return db;
}

test('password login issues a code exchangeable for a token',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);   // 'current' is admin
    const pkce = await s256Fields();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    }));
    assert.equal(res.status, 201);
    const { code } = await res.json() as { code: string };
    assert.ok(code.length > 0);
    const tok = await handleRequest(db, token({
        grant_type: 'authorization_code', code,
        client_id: 'web',
        code_verifier: pkce.verifier,
    }));
    assert.equal(tok.status, 201);
    const body = await tok.json() as { access_token: string };
    assert.ok(Array.isArray(
        await GET(db, 'organizations/1/members/', body.access_token)));
});

// authorization_code TTL: a code older than
// AUTHORIZATION_CODE_TTL_SECONDS (10 min) is the same shared
// 401 as unknown/spent — grant-first, no mint, no append.
// Clock seam (Task 1) advances past the TTL without sleeping.
test('an expired authorization code is a 401', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const pkce = await s256Fields();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    }));
    assert.equal(res.status, 201);
    const { code } = await res.json() as { code: string };
    // 10 min TTL + 1 s past the bound.
    setClockForTest(() =>
        Date.now() + (10 * 60 + 1) * MS_PER_SECOND);
    try {
        const tok = await handleRequest(db, token({
            grant_type: 'authorization_code', code,
            client_id: 'web',
        }));
        assert.equal(tok.status, 401);
        assert.deepEqual(
            await tok.json(),
            { error: 'invalid_grant' },
        );
    } finally {
        resetClock();
    }
});

test('a wrong password is a 401 with no code issued',
async () => {
    const db = await dbWithPasswordUser();
    const pkce = await s256Fields();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 'WRONG', client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    }));
    assert.equal(res.status, 401);
    assert.deepEqual(
        await res.json(), { error: 'invalid_grant' });
    assert.ok(await noStoredAuthorizeResponse(db));
});

test('an unknown username is the same 401 (no enumeration)',
async () => {
    const db = await dbWithPasswordUser();
    const pkce = await s256Fields();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'nobody@example.com',
        password: 's3cret', client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    }));
    assert.equal(res.status, 401);
});

// A KNOWN user whose only password credential is revoked has
// no live secret: the login pays the same equalizing PBKDF2
// cost and returns the identical 401. Pins the secret===null
// miss path (the second arm of the no-enumeration timing
// equalizer) that the identity_id credential narrow flows
// through.
test('a revoked password credential is the same 401',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedIdentityPii(db, 'current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await seedIdentityCredential(db, 'current', 'c1', {
        identity_id: 'current', kind: 'password',
        status: 'revoked',
        secret: await testHashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000000Z',
    });
    const pkce = await s256Fields();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    }));
    assert.equal(res.status, 401);
    assert.ok(await noStoredAuthorizeResponse(db));
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

// Authorize without S256 is a request fault (400),
// grant-first — no code, no stored pair.
test('authorize without S256 is rejected',
async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
    }));
    assert.equal(res.status, 400);
    assert.deepEqual(
        await res.json(),
        { error: 'S256 code_challenge is required' },
    );
    assert.ok(await noStoredAuthorizeResponse(db));
});

test('authorize with S256 issues a code',
async () => {
    const db = await dbWithPasswordUser();
    const verifier = 'pkce-verifier-server-tier';
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
        code_challenge: bytesToBase64Url(
            await sha256Bytes(verifier),
        ),
        code_challenge_method: 'S256',
    }));
    assert.equal(res.status, 201);
    const { code } = await res.json() as { code: string };
    assert.ok(code.length > 0);
});

test('PBKDF2 login appends a scrypt secret',
async () => {
    const db = await dbWithPasswordUser();
    setPasswordHasher(scryptHash);
    setScryptDerive(scryptDerive);
    const verifier = 'pkce-verifier-rehash';
    const res = await handleRequest(db, authorize({
        method: 'password', username: 'demo@example.com',
        password: 's3cret', client_id: 'web',
        code_challenge: bytesToBase64Url(
            await sha256Bytes(verifier),
        ),
        code_challenge_method: 'S256',
    }));
    assert.equal(res.status, 201);
    const rows = await deriveCredentialsFor(db, 'current');
    const passwords = rows.filter(
        row => row.kind === 'password',
    );
    assert.ok(passwords.length > 0);
    const latest = passwords.reduce((a, b) => {
        if (a.at > b.at) return a;
        if (a.at < b.at) return b;
        return a.id > b.id ? a : b;
    });
    assert.match(latest.secret, /^\$scrypt\$/);
    assert.ok(passwords.some(
        row => row.secret.startsWith('$pbkdf2-sha256$'),
    ));
});
