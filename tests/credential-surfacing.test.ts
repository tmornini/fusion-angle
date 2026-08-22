import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    postBootstrap,
    postMockDataLoad,
    type SeededCredentials,
} from '../api/mock-data.ts';
import { verifyPassword } from '../shared/password-hash.ts';
import { deriveCredentialsFor } from
    '../api/derive-identity-spine.ts';

function currentReveal(creds: SeededCredentials) {
    return creds.identities.find(
        c => c.identityId === 'XXZruirZyAOoRpNxaDnpSA');
}

// Phase Final Task 2: identity_credentials ROW half stripped —
// admin credential oracle is the pair plane.
async function adminCredential(db: MemoryDbAdapter) {
    const rows = await deriveCredentialsFor(db, 'XXZruirZyAOoRpNxaDnpSA');
    return rows.find(r => r.kind === 'password');
}

test('bootstrap surfaces an admin password that verifies',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const reveal = currentReveal(
        await postBootstrap(db));
    assert.ok(reveal, 'current credential surfaced');
    assert.equal(reveal.username, 'demo@example.com');
    assert.ok(reveal.password.length >= 16);
    const cred = await adminCredential(db);
    assert.ok(cred, 'admin password credential seeded');
    // the column holds a hash, never the surfaced plaintext
    assert.match(cred.secret, /^\$pbkdf2-sha256\$/);
    assert.notEqual(cred.secret, reveal.password);
    // and the surfaced plaintext verifies against that hash
    assert.equal(
        await verifyPassword(reveal.password, cred.secret),
        true);
    // Phase Final Stage B: identity spine tables retired.
});

test('mock data surfaces a verifying admin password',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const reveal = currentReveal(
        await postMockDataLoad(db));
    assert.ok(reveal, 'current credential surfaced');
    const cred = await adminCredential(db);
    assert.ok(cred, 'admin password credential seeded');
    assert.equal(
        await verifyPassword(reveal.password, cred.secret),
        true);
});

// Phase Final Task 1(d): SeededCredentials count is
// row-independent — 11 human passwords (buildMembers) for
// mock-data; 1 for bootstrap. System client_secret is not
// surfaced in the reveal list.
test('mock-data surfaces exactly eleven human credentials',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const creds = await postMockDataLoad(db);
    assert.equal(creds.identities.length, 11);
    assert.ok(
        creds.identities.every((c) => c.password.length >= 16),
    );
});

test('bootstrap surfaces exactly one human credential',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const creds = await postBootstrap(db);
    assert.equal(creds.identities.length, 1);
    assert.equal(creds.identities[0]!.identityId, 'XXZruirZyAOoRpNxaDnpSA');
});

test('each seed run yields a distinct admin password',
async () => {
    const db1 = memoryDbAdapter();
    await db1.postSchemaCreation();
    const db2 = memoryDbAdapter();
    await db2.postSchemaCreation();
    const a = currentReveal(
        await postBootstrap(db1));
    const b = currentReveal(
        await postBootstrap(db2));
    assert.ok(a && b, 'both surfaced');
    assert.notEqual(a.password, b.password);
});
