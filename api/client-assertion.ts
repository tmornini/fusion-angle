// Real JWS verification of OAuth private_key_jwt client
// assertions (RFC 7523) against the client's registered JWKS.
// WebCrypto only — zero runtime dependencies. RS256 and ES256,
// the two registered asymmetric algorithms in broad service
// use; symmetric algorithms are refused outright so a stolen
// JWKS can never sign (the classic alg-confusion attack).
// The one seam left for the server tier is jti replay
// tracking: every assertion verifies fresh against the
// registered key, but nothing yet remembers a jti as spent.

import {
    base64UrlDecode,
    base64UrlToBytes,
} from './base64url.ts';
import type { ClientEntity } from './types.ts';

export type ClientAssertionResult =
    | { valid: true }
    | { valid: false; reason: string };

function fail(reason: string): ClientAssertionResult {
    return { valid: false, reason };
}

interface AlgorithmProfile {
    readonly kty: string;
    readonly importParams:
        RsaHashedImportParams | EcKeyImportParams;
    readonly verifyParams:
        AlgorithmIdentifier | EcdsaParams;
}

const ALGORITHM_PROFILES: Readonly<
    Record<string, AlgorithmProfile>
> = {
    RS256: {
        kty: 'RSA',
        importParams: {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256',
        },
        verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
    },
    ES256: {
        kty: 'EC',
        importParams: {
            name: 'ECDSA',
            namedCurve: 'P-256',
        },
        verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
    },
};

// A JWT segment is base64url-wrapped JSON; either layer can be
// corrupt independently, and both faults mean the same thing
// to the caller: not a JSON object segment.
function parseJsonSegment(
    segment: string,
): Record<string, unknown> | null {
    let decoded: string;
    try {
        decoded = base64UrlDecode(segment);
    } catch {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(decoded);
    } catch {
        return null;
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        return null;
    }
    return parsed as Record<string, unknown>;
}

// RFC 7523 §3 claim checks. iss and sub are both the client
// id (the client authenticates as itself); aud must match the
// client's registered audience — config of record on the
// client row; exp is REQUIRED and in the future; nbf, when
// present, must have arrived.
function claimsFault(
    claims: Record<string, unknown>,
    client: ClientEntity,
    nowSeconds: number,
): string | null {
    if (claims['iss'] !== client.id) {
        return 'assertion iss must be the client id';
    }
    if (claims['sub'] !== client.id) {
        return 'assertion sub must be the client id';
    }
    if (claims['aud'] !== client.aud) {
        return "assertion aud must be the client's"
            + ' registered audience';
    }
    const exp = claims['exp'];
    if (typeof exp !== 'number') {
        return 'assertion exp is required';
    }
    if (nowSeconds >= exp) {
        return 'assertion is expired';
    }
    const nbf = claims['nbf'];
    if (nbf !== undefined) {
        if (typeof nbf !== 'number') {
            return 'assertion nbf must be a number';
        }
        if (nowSeconds < nbf) {
            return 'assertion is not yet valid';
        }
    }
    return null;
}

// The registered keys eligible to verify this assertion: the
// algorithm's key type, narrowed by kid when the header names
// one. The JWKS column is registry config, but it crosses from
// storage — validate at this edge. null = malformed JWKS.
function candidateKeys(
    jwksJson: string,
    kty: string,
    kid: string | undefined,
): JsonWebKey[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jwksJson);
    } catch {
        return null;
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || !Array.isArray(
            (parsed as Record<string, unknown>)['keys'])
    ) {
        return null;
    }
    const keys = (parsed as { keys: unknown[] }).keys
        .filter((k): k is JsonWebKey =>
            typeof k === 'object'
            && k !== null
            && !Array.isArray(k));
    const ofType = keys.filter(k => k.kty === kty);
    if (kid === undefined) {
        return ofType;
    }
    return ofType.filter(k =>
        (k as { kid?: unknown }).kid === kid);
}

async function signatureVerifies(
    jwk: JsonWebKey,
    profile: AlgorithmProfile,
    signature: Uint8Array<ArrayBuffer>,
    signedData: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
    let key: CryptoKey;
    try {
        key = await crypto.subtle.importKey(
            'jwk', jwk, profile.importParams,
            false, ['verify'],
        );
    } catch {
        // A registered key that cannot import is config rot,
        // not a signature verdict — this key fails closed
        // while a well-formed sibling may still verify.
        return false;
    }
    return crypto.subtle.verify(
        profile.verifyParams, key, signature, signedData,
    );
}

export async function verifyClientAssertion(
    assertion: string,
    client: ClientEntity,
    nowSeconds: number,
): Promise<ClientAssertionResult> {
    const segments = assertion.split('.');
    if (segments.length !== 3) {
        return fail('malformed client_assertion');
    }
    const [headerB64, claimsB64, signatureB64] = segments;
    const header = parseJsonSegment(headerB64!);
    if (header === null) {
        return fail('malformed assertion header');
    }
    const alg = header['alg'];
    if (
        typeof alg !== 'string'
        || !(alg in ALGORITHM_PROFILES)
    ) {
        return fail('unsupported assertion alg');
    }
    const profile = ALGORITHM_PROFILES[alg]!;
    const claims = parseJsonSegment(claimsB64!);
    if (claims === null) {
        return fail('malformed assertion claims');
    }
    const fault = claimsFault(claims, client, nowSeconds);
    if (fault !== null) {
        return fail(fault);
    }
    const kid = typeof header['kid'] === 'string'
        ? header['kid']
        : undefined;
    const keys = candidateKeys(
        client.jwks, profile.kty, kid,
    );
    if (keys === null) {
        return fail('client JWKS is malformed');
    }
    if (keys.length === 0) {
        return fail(
            'no registered key matches the assertion');
    }
    let signature: Uint8Array<ArrayBuffer>;
    try {
        signature = base64UrlToBytes(signatureB64!);
    } catch {
        return fail('malformed assertion signature');
    }
    const signedData = new TextEncoder().encode(
        headerB64 + '.' + claimsB64);
    for (const jwk of keys) {
        if (await signatureVerifies(
            jwk, profile, signature, signedData,
        )) {
            return { valid: true };
        }
    }
    return fail('assertion signature does not verify');
}
