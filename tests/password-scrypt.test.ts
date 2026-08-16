import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    verifyPassword,
    setPasswordHasher,
    setScryptDerive,
} from '../shared/password-hash.ts';
import {
    scryptHash,
    scryptDerive,
} from '../server/scrypt-hash.ts';

afterEach(() => {
    setPasswordHasher(null);
    setScryptDerive(null);
});


test('scryptHash then verifyPassword round-trips',
async () => {
    setScryptDerive(scryptDerive);
    const phc = await scryptHash('s3cret');
    assert.match(
        phc,
        /^\$scrypt\$ln=17,r=8,p=1\$[^$]+\$[^$]+$/,
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
