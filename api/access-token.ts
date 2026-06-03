import {
    base64UrlEncode,
    base64UrlDecode,
} from './base64url.ts';
import type { Id } from './types.ts';

// The resolved principal — the verified subject of a request.
// Distinct from the storage `Identity` ({id,kind}): this is
// the token's claim view. `roles` stays [] until SP-4 reads
// role_grants; `name` is a display copy.
export interface Principal {
    readonly id: Id;
    readonly roles: readonly string[];
    readonly name: string;
}

// The JWT claim contract. `aud` names the origin the token is
// for; `cnf` is the DPoP confirmation (SP-5 binds the key —
// present in the contract, unenforced now); `jti` is the
// unique token id (reuse-detection: SP-5).
export interface AccessTokenClaims {
    readonly sub: Id;
    readonly roles: readonly string[];
    readonly name: string;
    readonly aud: string;
    readonly cnf?: { readonly jkt: string };
    readonly iat: number;
    readonly nbf: number;
    readonly exp: number;
    readonly jti: string;
}

export const ANONYMOUS_ID: Id = 'anonymous';

// The logged-out principal — a real, named first-class
// subject, never null. The gate ACCEPTS it on public routes
// and REJECTS it on protected routes (deny-by-default
// authentication; role-based authorization is SP-4).
export const ANONYMOUS_PRINCIPAL: Principal = {
    id: ANONYMOUS_ID,
    roles: [],
    name: 'Anonymous',
};

const TOKEN_AUDIENCE = 'fusion-ai-web';
const SIGNING_KEY_ID = 'dev-co-located';

interface AccessTokenHeader {
    readonly alg: 'HS256';
    readonly typ: 'JWT';
    readonly kid: string;
}

const HEADER: AccessTokenHeader = {
    alg: 'HS256',
    typ: 'JWT',
    kid: SIGNING_KEY_ID,
};

// SEAM (SP-5 divorce point): real HS256/DPoP signing and
// verification land in the server tier with a non-co-located
// key. The placeholder freezes the three-segment wire shape
// without claiming cryptographic integrity — exactly as SP-1
// stored the credential secret unhashed and deferred
// verification to where it lives. The gate's REAL teeth are
// structure + exp/nbf + revoked-before + anonymous-rejection.
function signAccessToken(_signingInput: string): string {
    return base64UrlEncode(SIGNING_KEY_ID);
}

function verifyTokenSignature(
    _signingInput: string,
    signature: string,
): boolean {
    return signature === base64UrlEncode(SIGNING_KEY_ID);
}

export interface MintInput {
    readonly sub: Id;
    readonly roles: readonly string[];
    readonly name: string;
    readonly iat: number;
    readonly ttlSeconds: number;
    readonly jti: string;
}

export function mintAccessToken(input: MintInput): string {
    const claims: AccessTokenClaims = {
        sub: input.sub,
        roles: input.roles,
        name: input.name,
        aud: TOKEN_AUDIENCE,
        iat: input.iat,
        nbf: input.iat,
        exp: input.iat + input.ttlSeconds,
        jti: input.jti,
    };
    const head =
        base64UrlEncode(JSON.stringify(HEADER));
    const body =
        base64UrlEncode(JSON.stringify(claims));
    const signingInput = head + '.' + body;
    return signingInput + '.'
        + signAccessToken(signingInput);
}

function hasClaimShape(
    value: unknown,
): value is AccessTokenClaims {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const c = value as Record<string, unknown>;
    return typeof c.sub === 'string'
        && Array.isArray(c.roles)
        && typeof c.name === 'string'
        && typeof c.iat === 'number'
        && typeof c.nbf === 'number'
        && typeof c.exp === 'number'
        && typeof c.jti === 'string';
}

export function decodeAccessToken(
    token: string,
): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error(
            'malformed token: expected 3 segments',
        );
    }
    const claims = JSON.parse(
        base64UrlDecode(parts[1]!),
    ) as unknown;
    if (!hasClaimShape(claims)) {
        throw new Error('malformed token: bad claim shape');
    }
    return claims;
}

export function principalFromToken(
    token: string,
): Principal {
    const claims = decodeAccessToken(token);
    return {
        id: claims.sub,
        roles: claims.roles,
        name: claims.name,
    };
}

export type VerifyResult =
    | { readonly valid: true; readonly claims: AccessTokenClaims }
    | { readonly valid: false; readonly reason: string };

export function verifyAccessToken(
    token: string,
    nowSeconds: number,
): VerifyResult {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { valid: false, reason: 'malformed token' };
    }
    const signingInput = parts[0]! + '.' + parts[1]!;
    if (!verifyTokenSignature(signingInput, parts[2]!)) {
        return { valid: false, reason: 'bad signature' };
    }
    let claims: AccessTokenClaims;
    try {
        const parsed = JSON.parse(
            base64UrlDecode(parts[1]!),
        ) as unknown;
        if (!hasClaimShape(parsed)) {
            return {
                valid: false, reason: 'bad claim shape',
            };
        }
        claims = parsed;
    } catch {
        return { valid: false, reason: 'unparseable claims' };
    }
    if (nowSeconds < claims.nbf) {
        return { valid: false, reason: 'not yet valid' };
    }
    if (nowSeconds >= claims.exp) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true, claims };
}

// Derive the revoked-before stamp from the ledger rows for one
// identity: the LATEST event wins (RFC-3339 zulu sorts
// lexically = chronologically). Returns epoch seconds or null
// (no revocation). Shared by the gate (server) and any client
// reducer so the derivation has ONE home.
export function revokedBeforeSeconds(
    rows: readonly { identity_id: Id; at: string }[],
    identityId: Id,
): number | null {
    let latest: string | null = null;
    for (const row of rows) {
        if (row.identity_id !== identityId) continue;
        if (latest === null || row.at > latest) {
            latest = row.at;
        }
    }
    return latest === null
        ? null
        : Math.floor(Date.parse(latest) / 1000);
}
