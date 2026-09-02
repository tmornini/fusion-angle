import {
    assert,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
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
// admin credential oracle is the message plane.
async function adminCredential(db: MemoryDbAdapter) {
    const rows = await deriveCredentialsFor(db, 'XXZruirZyAOoRpNxaDnpSA');
    return rows.find(r => r.kind === 'password');
}

Deno.test('bootstrap surfaces an admin password that verifies',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const reveal = currentReveal(
        await postBootstrap(db));
    assert(reveal, 'current credential surfaced');
    assertStrictEquals(reveal.username, 'demo@example.com');
    assert(reveal.password.length >= 16);
    const cred = await adminCredential(db);
    assert(cred, 'admin password credential seeded');
    // the column holds a hash, never the surfaced plaintext
    assertMatch(cred.secret, /^\$pbkdf2-sha256\$/);
    assertNotStrictEquals(cred.secret, reveal.password);
    // and the surfaced plaintext verifies against that hash
    assertStrictEquals(
        await verifyPassword(reveal.password, cred.secret),
        true);
    // Phase Final Stage B: identity spine tables retired.
});

Deno.test('mock data surfaces a verifying admin password',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const reveal = currentReveal(
        await postMockDataLoad(db));
    assert(reveal, 'current credential surfaced');
    const cred = await adminCredential(db);
    assert(cred, 'admin password credential seeded');
    assertStrictEquals(
        await verifyPassword(reveal.password, cred.secret),
        true);
});

// Phase Final Task 1(d): SeededCredentials count is
// row-independent — 12 human passwords (buildMembers +
// buildUnaffiliatedIdentity) for mock-data; 1 for
// bootstrap. System client_secret is not surfaced in
// the reveal list.
Deno.test('mock-data surfaces exactly twelve human credentials',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const creds = await postMockDataLoad(db);
    assertStrictEquals(creds.identities.length, 12);
    assert(
        creds.identities.every((c) => c.password.length >= 16),
    );
});

Deno.test('bootstrap surfaces exactly one human credential',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const creds = await postBootstrap(db);
    assertStrictEquals(creds.identities.length, 1);
    assertStrictEquals(
        creds.identities[0]!.identityId,
        'XXZruirZyAOoRpNxaDnpSA',
    );
});

Deno.test('each seed run yields a distinct admin password',
async () => {
    const db1 = memoryDbAdapter();
    await db1.postSchemaCreation();
    const db2 = memoryDbAdapter();
    await db2.postSchemaCreation();
    const a = currentReveal(
        await postBootstrap(db1));
    const b = currentReveal(
        await postBootstrap(db2));
    assert(a && b, 'both surfaced');
    assertNotStrictEquals(a.password, b.password);
});
