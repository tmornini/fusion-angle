// Mint/verify require JWT_HMAC_SIGNING_KEY. Tests that
// import token-fixtures or this module get a deterministic
// key so a bare `deno test` run — skipping ./test's own
// export — still signs.
// Registers the cheap test hasher so seed/login paths
// that call hashPassword() do not throw.
import { setPasswordHasher } from
    '../shared/password-hash.ts';
import { testHashPassword } from './mock-seed.ts';

if (
    Deno.env.get('JWT_HMAC_SIGNING_KEY') === undefined
    || Deno.env.get('JWT_HMAC_SIGNING_KEY') === ''
) {
    Deno.env.set(
        'JWT_HMAC_SIGNING_KEY', 'test-hmac-signing-key',
    );
}
setPasswordHasher(testHashPassword);
