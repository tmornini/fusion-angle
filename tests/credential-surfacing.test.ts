import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    populateBootstrapData,
    populateMockData,
    type SeededCredentials,
} from '../api/mock-data.ts';
import { verifyPassword } from '../api/password-hash.ts';

function currentReveal(creds: SeededCredentials) {
    return creds.identities.find(
        c => c.identityId === 'current');
}

async function adminCredential(db: MemoryDbAdapter) {
    const rows = await db.identityCredentials.getAll();
    return rows.find(
        r => r.identity_id === 'current'
            && r.kind === 'password',
    );
}

test('bootstrap surfaces an admin password that verifies',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const reveal = currentReveal(
        await populateBootstrapData(db));
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
});

test('mock data surfaces a verifying admin password',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const reveal = currentReveal(
        await populateMockData(db));
    assert.ok(reveal, 'current credential surfaced');
    const cred = await adminCredential(db);
    assert.ok(cred, 'admin password credential seeded');
    assert.equal(
        await verifyPassword(reveal.password, cred.secret),
        true);
});

test('each seed run yields a distinct admin password',
async () => {
    const db1 = new MemoryDbAdapter();
    await db1.createSchema();
    const db2 = new MemoryDbAdapter();
    await db2.createSchema();
    const a = currentReveal(
        await populateBootstrapData(db1));
    const b = currentReveal(
        await populateBootstrapData(db2));
    assert.ok(a && b, 'both surfaced');
    assert.notEqual(a.password, b.password);
});
