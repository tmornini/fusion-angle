import {
    base64UrlEncode,
    base64UrlDecode,
    bytesToBase64Url,
    base64UrlToBytes,
} from '../shared/base64url.ts';
import type { Id } from './types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';

// The resolved principal — the verified subject of a request.
// Distinct from the storage `Identity` ({id,kind}): this is
// the token's claim view. `roles` are `{type}:{organization_id}`
// claims baked at mint from memberships; the gate projects
// them for the fenced org. `name` is a display copy.
export interface Principal {
    readonly id: Id;
    readonly roles: readonly string[];
    readonly name: string;
    // SP-2 tenant scope: set once from the token's `org`
    // claim; absent for an unscoped single-org principal.
    readonly organization?: Id;
    // The reachable set, from the token's `orgs` claim — every
    // org this identity is a member of (enumerate without a
    // round-trip). The active `organization` is one of these.
    readonly organizations?: readonly Id[];
}

// The JWT claim contract. `aud` names the origin the token is
// for — verifyAccessToken now ENFORCES the single audience
// (TOKEN_AUDIENCE); per-client multi-audience validation via
// the registration facet is SP-5. `cnf` is the DPoP
// confirmation (SP-5 binds the key — present in the contract,
// unenforced now); `jti` is the unique token id
// (reuse-detection: SP-5); `act` is the RFC 8693 delegation
// actor (token-exchange shapes sub = the subject and act.sub
// = the acting party). `org` is the SP-2 tenant scope, present
// only on an org-exchanged token; its absence is an unscoped
// single-org caller. `orgs` is the reachable set — every org
// the subject is a member of, from the membership ledger at
// mint time.
export interface AccessTokenClaims {
    readonly sub: Id;
    readonly roles: readonly string[];
    readonly name: string;
    readonly aud: string;
    readonly cnf?: { readonly jkt: string };
    readonly act?: { readonly sub: Id };
    readonly organization?: Id;
    readonly organizations?: readonly Id[];
    readonly iat: number;
    readonly nbf: number;
    readonly exp: number;
    readonly jti: string;
}

export const ANONYMOUS_ID: Id = 'anonymous';

export const TOKEN_AUDIENCE = 'fusion-ai-web';
const SIGNING_KEY_ID = 'dev-co-located';

// The HMAC secret. CLIENT-SHIPPED CONSTANT — the one thing the
// server tier relocates (see the seam note below).
const SIGNING_KEY_MATERIAL =
    'dev-co-located-hmac-secret-frozen-wire-format';

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

// SEAM (SP-5 divorce point): the signature is now REAL
// HMAC-SHA256 over the head.body signing input, via the
// WebCrypto subtle primitive. The alg (HS256) and the
// three-segment wire shape are FROZEN; subtle.verify performs
// the constant-time compare — we never hand-roll one.
//
// !!! DEPLOYMENT CONSTRAINT — REDUCED, NOT RESOLVED. The key is
// still a constant shipped in client JS, so any party with the
// bundle can mint a valid token: forgery stays trivial. What
// changed is the future server tier's BLAST RADIUS — it
// relocates ONLY the key (client constant -> server secret/KMS)
// and who-mints (browser -> /authentication/token); the wire
// format, the alg, and every caller signature stay put. Safe
// today ONLY because the whole store is client-side localStorage
// (no trust boundary — the page-runner owns their own data). DO
// NOT enable this gate in a networked / multi-user /
// untrusted-client-reachable context until the key lives
// server-side. That move arrives WITH the server tier; the gate
// and a server-held key are inseparable.

// The imported key handle, memoized as a one-time Promise so
// repeated sign/verify share one non-extractable CryptoKey
// (extractable:false — the handle cannot re-export the bytes).
let signingKeyHandle: Promise<CryptoKey> | undefined;

function signingKey(): Promise<CryptoKey> {
    if (signingKeyHandle === undefined) {
        signingKeyHandle = crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(SIGNING_KEY_MATERIAL),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify'],
        );
    }
    return signingKeyHandle;
}

async function signAccessToken(
    signingInput: string,
): Promise<string> {
    const mac = await crypto.subtle.sign(
        'HMAC',
        await signingKey(),
        new TextEncoder().encode(signingInput),
    );
    return bytesToBase64Url(new Uint8Array(mac));
}

async function verifyTokenSignature(
    signingInput: string,
    signature: string,
): Promise<boolean> {
    let signatureBytes: Uint8Array<ArrayBuffer>;
    try {
        signatureBytes = base64UrlToBytes(signature);
    } catch {
        return false;   // a non-decodable signature is invalid
    }
    return crypto.subtle.verify(
        'HMAC',
        await signingKey(),
        signatureBytes,
        new TextEncoder().encode(signingInput),
    );
}

export interface MintInput {
    readonly sub: Id;
    readonly roles: readonly string[];
    readonly name: string;
    readonly iat: number;
    readonly ttlSeconds: number;
    readonly jti: string;
    // Production passes TOKEN_AUDIENCE; tests that must
    // mint a real-signed wrong-aud token pass another.
    readonly aud: string;
    readonly act?: { readonly sub: Id };
    readonly organization?: Id;
    readonly organizations?: readonly Id[];
}

export async function mintAccessToken(
    input: MintInput,
): Promise<string> {
    const claims: AccessTokenClaims = {
        sub: input.sub,
        roles: input.roles,
        name: input.name,
        aud: input.aud,
        iat: input.iat,
        nbf: input.iat,
        exp: input.iat + input.ttlSeconds,
        jti: input.jti,
        ...(input.act ? { act: input.act } : {}),
        ...(input.organization ? { organization: input.organization } : {}),
        ...(input.organizations
            ? { organizations: input.organizations }
            : {}),
    };
    const head =
        base64UrlEncode(JSON.stringify(HEADER));
    const body =
        base64UrlEncode(JSON.stringify(claims));
    const signingInput = head + '.' + body;
    const signature = await signAccessToken(signingInput);
    return signingInput + '.' + signature;
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
    if (c.organization !== undefined && typeof c.organization !== 'string') {
        return false;
    }
    if (c.organizations !== undefined) {
        if (!Array.isArray(c.organizations)
            || c.organizations.some(o => typeof o !== 'string')) {
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

// The one claims→principal projection. Callers that already
// hold VERIFIED claims (the request gate) project directly —
// re-decoding the raw token would revisit verification's work.
export function principalFromClaims(
    claims: AccessTokenClaims,
): Principal {
    return {
        id: claims.sub,
        roles: claims.roles,
        name: claims.name,
        ...(claims.organization ? { organization: claims.organization } : {}),
        ...(claims.organizations
            ? { organizations: claims.organizations } : {}),
    };
}

export function principalFromToken(
    token: string,
): Principal {
    return principalFromClaims(decodeAccessToken(token));
}

export type VerifyResult =
    | { readonly valid: true; readonly claims: AccessTokenClaims }
    | { readonly valid: false; readonly reason: string };

export async function verifyAccessToken(
    token: string,
    nowSeconds: number,
): Promise<VerifyResult> {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { valid: false, reason: 'malformed token' };
    }
    const signingInput = parts[0]! + '.' + parts[1]!;
    const signatureValid = await verifyTokenSignature(
        signingInput, parts[2]!,
    );
    if (!signatureValid) {
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
    if (claims.aud !== TOKEN_AUDIENCE) {
        return { valid: false, reason: 'wrong audience' };
    }
    if (nowSeconds < claims.nbf) {
        return { valid: false, reason: 'not yet valid' };
    }
    if (nowSeconds >= claims.exp) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true, claims };
}

// The single home of the latest-`at`-wins revocation reduce.
// RFC-3339 zulu sorts lexically = chronologically. The default
// (at, id) total order decides; since this extracts the `at`
// stamp, a same-`at` tie is value-identical either way.
// Returns the stamp string or null.
export function latestRevocationAt(
    rows: readonly {
        id: Id; identity_id: Id; at: string;
    }[],
    identityId: Id,
): string | null {
    const latest = latestByKey(
        rows, row => row.identity_id,
    ).get(identityId);
    return latest === undefined ? null : latest.at;
}

// Convert the shared latest-wins reduce to epoch seconds for
// the gate's `iat <= revokedThrough` comparison. The floor
// makes the stamp's whole second inclusive — hence "through":
// a token minted within the revocation second is dead (shared
// seconds fail closed). Returns null when the identity has no
// revocation. The reduce itself lives in latestRevocationAt —
// this only does the epoch conversion.
export function revokedThroughSeconds(
    rows: readonly {
        id: Id; identity_id: Id; at: string;
    }[],
    identityId: Id,
): number | null {
    const at = latestRevocationAt(rows, identityId);
    return at === null ? null : Math.floor(Date.parse(at) / 1000);
}
