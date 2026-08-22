import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassword } from
    '../shared/password-hash.ts';
import {
    testHashPassword,
    seededMockDb,
    sharedMockDb,
} from './mock-seed.ts';
import { deriveCredentialsFor } from
    '../api/derive-identity-spine.ts';

test('testHashPassword emits pbkdf2 PHC with i=1',
async () => {
    const phc = await testHashPassword('s3cret');
    assert.match(
        phc,
        /^\$pbkdf2-sha256\$i=1\$[^$]+\$[^$]+$/,
    );
    assert.equal(
        await verifyPassword('s3cret', phc),
        true,
    );
    assert.equal(
        await verifyPassword('wrong', phc),
        false,
    );
});

test('seededMockDb seeds verifying current password',
async () => {
    const db = await seededMockDb();
    const rows = await deriveCredentialsFor(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    const passwordCred = rows.find(
        r => r.kind === 'password',
    );
    assert.ok(passwordCred, 'password credential present');
    assert.match(
        passwordCred.secret,
        /^\$pbkdf2-sha256\$i=1\$/,
    );
});

test('sharedMockDb returns the same adapter instance',
async () => {
    const a = await sharedMockDb();
    const b = await sharedMockDb();
    assert.equal(a, b);
});

test('seededMockDb returns a fresh adapter each call',
async () => {
    const a = await seededMockDb();
    const b = await seededMockDb();
    assert.notEqual(a, b);
});
