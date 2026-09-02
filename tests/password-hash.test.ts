import {
    assertMatch,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    hashPassword,
    setPasswordHasher,
    verifyPassword,
} from '../shared/password-hash.ts';
import { testHashPassword } from './mock-seed.ts';

Deno.test('hashPassword throws when hasher is unset', async () => {
    setPasswordHasher(null);
    await assertRejects(
        () => hashPassword('x'),
        Error, 'password hasher is not configured',
    );
    setPasswordHasher(testHashPassword);
});

Deno.test('hash then verify round-trips', async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('correct horse battery');
    assertStrictEquals(
        await verifyPassword('correct horse battery', phc),
        true);
});

Deno.test('a wrong password fails verification', async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('correct horse battery');
    assertStrictEquals(
        await verifyPassword('Correct horse battery', phc),
        false);
});

Deno.test('the stored hash is a self-describing PHC string',
async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('s3cret-value');
    assertMatch(
        phc, /^\$pbkdf2-sha256\$i=1\$[^$]+\$[^$]+$/);
    assertStrictEquals(phc.includes('s3cret-value'), false);
});

Deno.test('two hashes of one password differ (random salt)',
async () => {
    setPasswordHasher(testHashPassword);
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    assertNotStrictEquals(a, b);
    assertStrictEquals(await verifyPassword('same', a), true);
    assertStrictEquals(await verifyPassword('same', b), true);
});

Deno.test('a malformed stored string verifies false, never throws',
async () => {
    const malformed = [
        '', 'not-a-phc', '$pbkdf2-sha256$', '$x$i=1$a$b',
        '$pbkdf2-sha256$i=1$$', '$pbkdf2-sha256$i=1$@@@$@@@',
    ];
    for (const bad of malformed) {
        assertStrictEquals(await verifyPassword('pw', bad), false);
    }
});

Deno.test('an unknown algorithm id fails closed', async () => {
    assertStrictEquals(
        await verifyPassword('pw', '$argon2id$m=1$c2FsdA$ZA'),
        false);
});

Deno.test('verification honors the embedded iteration count',
async () => {
    setPasswordHasher(testHashPassword);
    const phc = await hashPassword('embedded');
    assertMatch(phc, /\$i=1\$/);
    const tampered = phc.replace('i=1', 'i=2');
    assertStrictEquals(
        await verifyPassword('embedded', tampered), false);
});

Deno.test('pbkdf2Verify still accepts an old i=1 hash',
async () => {
    const phc = await testHashPassword('legacy');
    assertStrictEquals(await verifyPassword('legacy', phc), true);
    assertStrictEquals(await verifyPassword('wrong', phc), false);
});
