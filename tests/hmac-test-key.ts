// Mint/verify require JWT_HMAC_SIGNING_KEY. Tests that
// import token-fixtures or this module get a deterministic
// key so a lone `node --test` run still signs.
// Registers the cheap test hasher so seed/login paths
// that call hashPassword() do not throw.
import { setPasswordHasher } from
    '../shared/password-hash.ts';
import { testHashPassword } from './mock-seed.ts';

if (
    process.env['JWT_HMAC_SIGNING_KEY'] === undefined
    || process.env['JWT_HMAC_SIGNING_KEY'] === ''
) {
    process.env['JWT_HMAC_SIGNING_KEY'] =
        'test-hmac-signing-key';
}
setPasswordHasher(testHashPassword);
