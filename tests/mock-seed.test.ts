import {
    assert,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { verifyPassword } from
    '../shared/password-hash.ts';
import {
    testHashPassword,
    seededMockDb,
    sharedMockDb,
} from './mock-seed.ts';
import { deriveCredentialsFor } from
    '../api/derive-identity-spine.ts';

Deno.test('testHashPassword emits pbkdf2 PHC with i=1',
async () => {
    const phc = await testHashPassword('s3cret');
    assertMatch(
        phc,
        /^\$pbkdf2-sha256\$i=1\$[^$]+\$[^$]+$/,
    );
    assertStrictEquals(
        await verifyPassword('s3cret', phc),
        true,
    );
    assertStrictEquals(
        await verifyPassword('wrong', phc),
        false,
    );
});

Deno.test('seededMockDb seeds verifying current password',
async () => {
    const db = await seededMockDb();
    const rows = await deriveCredentialsFor(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    const passwordCred = rows.find(
        r => r.kind === 'password',
    );
    assert(passwordCred, 'password credential present');
    assertMatch(
        passwordCred.secret,
        /^\$pbkdf2-sha256\$i=1\$/,
    );
});

Deno.test('sharedMockDb returns the same adapter instance',
async () => {
    const a = await sharedMockDb();
    const b = await sharedMockDb();
    assertStrictEquals(a, b);
});

Deno.test('seededMockDb returns a fresh adapter each call',
async () => {
    const a = await seededMockDb();
    const b = await seededMockDb();
    assertNotStrictEquals(a, b);
});
