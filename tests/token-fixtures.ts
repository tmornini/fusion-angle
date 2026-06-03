import { mintAccessToken } from '../api/access-token.ts';

// A deterministic, always-valid 'current' token: a fixed iat
// with an enormous TTL puts exp far in the future, so it
// verifies against any wall clock without a clock seam.
export function devToken(sub = 'current'): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'dev-' + sub,
    });
}

export function expiredToken(sub = 'current'): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_600_000_000, ttlSeconds: 1,
        jti: 'exp-' + sub,
    });
}

export function notYetValidToken(sub = 'current'): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 4_000_000_000, ttlSeconds: 10_000_000_000,
        jti: 'nbf-' + sub,
    });
}
