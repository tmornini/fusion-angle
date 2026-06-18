import {
    base64UrlEncode,
    bytesToBase64Url,
} from '../shared/base64url.ts';

// Mint a fresh key pair and sign private_key_jwt assertions
// with it. Keys are generated IN-TEST — no fixture key
// material is ever committed; the public half is exported as
// the JWKS the client row registers.
export interface AssertionSigner {
    readonly jwks: string;
    sign(
        claims: Record<string, unknown>,
        headerOverrides?: Record<string, unknown>,
    ): Promise<string>;
}

export async function makeAssertionSigner(
    alg: 'RS256' | 'ES256',
    kid?: string,
): Promise<AssertionSigner> {
    const generateParams = alg === 'RS256'
        ? {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        }
        : { name: 'ECDSA', namedCurve: 'P-256' };
    const pair = await crypto.subtle.generateKey(
        generateParams, true, ['sign', 'verify'],
    ) as CryptoKeyPair;
    const publicJwk = await crypto.subtle.exportKey(
        'jwk', pair.publicKey,
    );
    const registered = kid === undefined
        ? publicJwk
        : { ...publicJwk, kid };
    const signParams = alg === 'RS256'
        ? 'RSASSA-PKCS1-v1_5'
        : { name: 'ECDSA', hash: 'SHA-256' };
    return {
        jwks: JSON.stringify({ keys: [registered] }),
        async sign(claims, headerOverrides) {
            const header: Record<string, unknown> = {
                alg,
                typ: 'JWT',
                ...(kid === undefined ? {} : { kid }),
                ...headerOverrides,
            };
            const signedPart =
                base64UrlEncode(JSON.stringify(header))
                + '.'
                + base64UrlEncode(JSON.stringify(claims));
            const signature = await crypto.subtle.sign(
                signParams, pair.privateKey,
                new TextEncoder().encode(signedPart),
            );
            return signedPart + '.'
                + bytesToBase64Url(
                    new Uint8Array(signature));
        },
    };
}
