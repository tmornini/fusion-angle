import { decodeAccessToken } from
    '../../shared/access-token-decode.ts';
import type {
    SessionCredentials,
} from './adapters/session-credentials.ts';

// The branch the boot gate and runtime recovery both act on,
// decided from token expiry alone — one pure voice for two
// callers (Generality).
export type CredentialDecision =
    | {
        readonly kind: 'install';
        readonly accessToken: string;
    }
    | {
        readonly kind: 'refresh';
        readonly refreshToken: string;
    }
    | { readonly kind: 'login' };

// PURE: no clock, no I/O. `now` is seconds since the epoch,
// passed in (Office of Time — testable without a wall clock).
// Decode-only via the token's exp: a client-side signature
// check on a self-shipped HMAC adds no security, and the server
// re-verifies at the refresh grant. The `now >= exp` boundary
// mirrors verifyAccessToken exactly — a token AT its exp is
// dead. install (access live) → refresh (access dead, refresh
// live) → login (no creds, or both dead).
export function resolveCredentialDecision(
    creds: SessionCredentials | null,
    now: number,
): CredentialDecision {
    if (creds === null) {
        return { kind: 'login' };
    }
    if (isLive(creds.accessToken, now)) {
        return {
            kind: 'install',
            accessToken: creds.accessToken,
        };
    }
    if (isLive(creds.refreshToken, now)) {
        return {
            kind: 'refresh',
            refreshToken: creds.refreshToken,
        };
    }
    return { kind: 'login' };
}

function isLive(token: string, now: number): boolean {
    return now < decodeAccessToken(token).exp;
}
