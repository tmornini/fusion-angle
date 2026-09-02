import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    verifyPassword,
    setPasswordHasher,
    setScryptDerive,
} from '../shared/password-hash.ts';
import {
    scryptHash,
    scryptDerive,
} from '../server/scrypt-hash.ts';

Deno.test.afterEach(() => {
    setPasswordHasher(null);
    setScryptDerive(null);
});


Deno.test('scryptHash then verifyPassword round-trips',
async () => {
    setScryptDerive(scryptDerive);
    const phc = await scryptHash('s3cret');
    assertMatch(
        phc,
        /^\$scrypt\$ln=17,r=8,p=1\$[^$]+\$[^$]+$/,
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
