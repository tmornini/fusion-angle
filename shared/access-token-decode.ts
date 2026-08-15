import { base64UrlDecode } from './base64url.ts';

// The anonymous seed subject. Decode-side so the server
// client can name it without importing mint/verify.
export const ANONYMOUS_ID = 'anonymous';

// The resolved principal — the subject of a request as
// claimed by the token. Distinct from the storage
// Identity ({id,kind}): this is the token's claim view.
// `roles` are `{type}:{organization_id}` claims baked at
// mint from memberships; the gate projects them for the
// fenced organization. `name` is a display copy.
// Decode does not verify the signature.
export interface Principal {
    readonly id: string;
    readonly roles: readonly string[];
    readonly name: string;
    // SP-2 tenant scope: set once from the token's
    // organization claim; absent for an unscoped
    // single-organization principal.
    readonly organization?: string;
    // The reachable set, from the token's organizations
    // claim — every organization this identity is a
    // member of (enumerate without a round-trip). The
    // active organization is one of these.
    readonly organizations?: readonly string[];
}

// The JWT claim contract. `aud` names the origin the
// token is for. `cnf` is the DPoP confirmation (present
// in the contract, unenforced now); `jti` is the unique
// token id; `act` is the RFC 8693 delegation actor.
// `organization` is the SP-2 tenant scope, present only
// on an organization-exchanged token; its absence is an
// unscoped single-organization caller. `organizations`
// is the reachable set — every organization the subject
// is a member of, from the membership ledger at mint.
// This module decodes only — it does not mint or verify.
export interface AccessTokenClaims {
    readonly sub: string;
    readonly roles: readonly string[];
    readonly name: string;
    readonly aud: string;
    readonly cnf?: { readonly jkt: string };
    readonly act?: { readonly sub: string };
    readonly organization?: string;
    readonly organizations?: readonly string[];
    readonly iat: number;
    readonly nbf: number;
    readonly exp: number;
    readonly jti: string;
}

function hasClaimShape(
    value: unknown,
): value is AccessTokenClaims {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const c = value as Record<string, unknown>;
    if (c.act !== undefined) {
        if (typeof c.act !== 'object' || c.act === null) {
            return false;
        }
        if (typeof (c.act as { sub?: unknown }).sub
            !== 'string') {
            return false;
        }
    }
    if (c.organization !== undefined
        && typeof c.organization !== 'string') {
        return false;
    }
    if (c.organizations !== undefined) {
        if (!Array.isArray(c.organizations)
            || c.organizations.some(
                o => typeof o !== 'string')) {
            return false;
        }
    }
    if (!Array.isArray(c.roles)
        || c.roles.some(r => typeof r !== 'string')) {
        return false;
    }
    return typeof c.sub === 'string'
        && typeof c.name === 'string'
        && typeof c.aud === 'string'
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

// The one claims→principal projection. Callers that
// already hold VERIFIED claims (the request gate)
// project directly — re-decoding the raw token would
// revisit verification's work.
export function principalFromClaims(
    claims: AccessTokenClaims,
): Principal {
    return {
        id: claims.sub,
        roles: claims.roles,
        name: claims.name,
        ...(claims.organization
            ? { organization: claims.organization } : {}),
        ...(claims.organizations
            ? { organizations: claims.organizations }
            : {}),
    };
}

export function principalFromToken(
    token: string,
): Principal {
    return principalFromClaims(decodeAccessToken(token));
}
