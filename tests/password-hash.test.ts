import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    hashPassword,
    setPasswordHasher,
    verifyPassword,
} from '../shared/password-hash.ts';
import { testHashPassword } from './mock-seed.ts';

test('hashPassword throws when hasher is unset', async () => {
    setPasswordHasher(null);
    await assert.rejects(
        () => hashPassword('x'),
        /password hasher is not configured/,
    );
    setPasswordHasher(testHashPassword);
});

test('hash then verify round-trips', async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('correct horse battery');
    assert.equal(
        await verifyPassword('correct horse battery', phc),
        true);
});

test('a wrong password fails verification', async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('correct horse battery');
    assert.equal(
        await verifyPassword('Correct horse battery', phc),
        false);
});

test('the stored hash is a self-describing PHC string',
async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('s3cret-value');
    assert.match(
        phc, /^\$pbkdf2-sha256\$i=1\$[^$]+\$[^$]+$/);
    assert.equal(phc.includes('s3cret-value'), false);
});

test('two hashes of one password differ (random salt)',
async () => {
    setPasswordHasher(testHashPassword);
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
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('embedded');
    assert.match(phc, /\$i=1\$/);
    const tampered = phc.replace('i=1', 'i=2');
    assert.equal(
        await verifyPassword('embedded', tampered), false);
});

test('pbkdf2Verify still accepts an old i=1 hash',
async () => {
    const phc = await testHashPassword('legacy');
    assert.equal(await verifyPassword('legacy', phc), true);
    assert.equal(await verifyPassword('wrong', phc), false);
});
