import { mintAccessToken } from '../api/access-token.ts';

// A deterministic, always-valid 'current' token: a fixed iat
// with an enormous TTL puts exp far in the future, so it
// verifies against any wall clock without a clock seam.
// Async because minting now signs via WebCrypto (HMAC-SHA256).
export async function devToken(sub = 'current'): Promise<string> {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'dev-' + sub,
    });
}

// An org-scoped dev token: the org-exchanged session a web-app
// adapter sees post-boot, carrying the `org` claim activeOrg
// reads. Defaults to `current` in org '1'.
export async function orgToken(
    sub = 'current', org = '1',
): Promise<string> {
    return mintAccessToken({
        sub, roles: [], name: 'Demo', org,
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'org-' + sub + '-' + org,
    });
}

export async function expiredToken(sub = 'current'): Promise<string> {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_600_000_000, ttlSeconds: 1,
        jti: 'exp-' + sub,
    });
}

export async function notYetValidToken(sub = 'current'): Promise<string> {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 4_000_000_000, ttlSeconds: 10_000_000_000,
        jti: 'nbf-' + sub,
    });
}

// Pre-minted 'current' dev token for the common case. Minting
// is async now, but devToken() is deterministic, so one value
// equals every call. Tests that need the token as a plain
// string — e.g. inside a synchronous assert.throws thunk —
// import this instead of awaiting at each call site. Minted
// once here via top-level await; the async module graph waits.
export const DEV_TOKEN = await devToken();
