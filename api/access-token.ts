import {
    base64UrlEncode,
    bytesToBase64Url,
    base64UrlToBytes,
} from '../shared/base64url.ts';
import type { Id } from './types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    decodeAccessToken,
    type AccessTokenClaims,
} from '../shared/access-token-decode.ts';

export {
    ANONYMOUS_ID,
    decodeAccessToken,
    principalFromClaims,
    principalFromToken,
} from '../shared/access-token-decode.ts';
export type {
    AccessTokenClaims,
    Principal,
} from '../shared/access-token-decode.ts';

export const TOKEN_AUDIENCE = 'fusion-angle';
const SIGNING_KEY_ID = 'dev-co-located';

// The HMAC secret. Mint/verify require
// JWT_HMAC_SIGNING_KEY. Never log the material.
function hmacSigningKeyMaterial(): string {
    const runtime = globalThis as {
        process?: {
            env?: Record<string, string | undefined>;
        };
    };
    const key = runtime.process?.env?.[
        'JWT_HMAC_SIGNING_KEY'
    ];
    if (typeof key === 'string' && key !== '') {
        return key;
    }
    throw new Error(
        'missing required env JWT_HMAC_SIGNING_KEY',
    );
}

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

// HMAC-SHA256 over the head.body signing input, via the
// WebCrypto subtle primitive. The alg (HS256) and the
// three-segment wire shape are FROZEN; subtle.verify performs
// the constant-time compare — we never hand-roll one.
// JWT_HMAC_SIGNING_KEY is required; there is no client
// default.

// The imported key handle, memoized as a one-time Promise so
// repeated sign/verify share one non-extractable CryptoKey
// (extractable:false — the handle cannot re-export the bytes).
let signingKeyHandle: Promise<CryptoKey> | undefined;

function signingKey(): Promise<CryptoKey> {
    if (signingKeyHandle === undefined) {
        signingKeyHandle = crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(
                hmacSigningKeyMaterial(),
            ),
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
        claims = decodeAccessToken(token);
    } catch (error) {
        if (error instanceof Error
            && error.message
                === 'malformed token: bad claim shape') {
            return {
                valid: false, reason: 'bad claim shape',
            };
        }
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
