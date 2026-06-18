import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    hashPassword,
    verifyPassword,
} from '../shared/password-hash.ts';

test('hash then verify round-trips', async () => {
    const phc = await hashPassword('correct horse battery');
    assert.equal(
        await verifyPassword('correct horse battery', phc),
        true);
});

test('a wrong password fails verification', async () => {
    const phc = await hashPassword('correct horse battery');
    assert.equal(
        await verifyPassword('Correct horse battery', phc),
        false);
});

test('the stored hash is a self-describing PHC string',
async () => {
    const phc = await hashPassword('s3cret-value');
    assert.match(
        phc, /^\$pbkdf2-sha256\$i=\d+\$[^$]+\$[^$]+$/);
    // the plaintext never appears in the stored material
    assert.equal(phc.includes('s3cret-value'), false);
});

test('two hashes of one password differ (random salt)',
async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('same', a), true);
    assert.equal(await verifyPassword('same', b), true);
});

test('a malformed stored string verifies false, never throws',
async () => {
    const malformed = [
        '', 'not-a-phc', '$pbkdf2-sha256$', '$x$i=1$a$b',
        '$pbkdf2-sha256$i=1$$', '$pbkdf2-sha256$i=1$@@@$@@@',
    ];
    for (const bad of malformed) {
        assert.equal(await verifyPassword('pw', bad), false);
    }
});

test('an unknown algorithm id fails closed', async () => {
    assert.equal(
        await verifyPassword('pw', '$argon2id$m=1$c2FsdA$ZA'),
        false);
});

test('verification honors the embedded iteration count',
async () => {
    const phc = await hashPassword('embedded');
    assert.match(phc, /\$i=600000\$/);
    // re-deriving at a different count yields a different
    // digest, so verify must fail — proving the count is read
    // from the string, not from a hardcoded constant
    const tampered = phc.replace('i=600000', 'i=600001');
    assert.equal(
        await verifyPassword('embedded', tampered), false);
});
