// Password credential hashing for the identity_credentials
// `secret` column. Self-describing PHC / modular-crypt strings:
//
//   $pbkdf2-sha256$i=<iterations>$<b64url-salt>$<b64url-digest>
//   $scrypt$ln=17,r=8,p=1$<b64url-salt>$<b64url-digest>
//
// hashPassword writes with the registered hasher (scrypt
// in production via setPasswordHasher). verifyPassword
// parses the embedded algo-id + params and dispatches
// through a REGISTRY of per-algo verifiers — each a
// self-contained, deletable unit — and degrades to false
// on any malformed input (a bad column must never crash
// a login).
//
// pbkdf2Verify stays so old $pbkdf2-sha256$ secrets still
// verify. New hashes are scrypt (Node crypto.scrypt via
// server/scrypt-hash.ts). Tests use testHashPassword.

import {
    base64UrlToBytes,
} from './base64url.ts';

const ALGO_ID = 'pbkdf2-sha256';

export const SCRYPT_LOG_N = 17;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_MAXMEM_BYTES = 167772160;

export type PasswordHasher = (
    plaintext: string,
) => Promise<string>;

export type ScryptDerive = (
    plaintext: string,
    salt: Uint8Array<ArrayBuffer>,
    logN: number,
    r: number,
    p: number,
    keyLength: number,
) => Promise<Uint8Array<ArrayBuffer>>;

interface ParsedPhc {
    readonly algoId: string;
    readonly params: string;
    readonly salt: string;
    readonly digest: string;
}

// Split a `$algo$params$salt$digest` string; null on any shape
// that is not exactly those four non-empty fields.
function parsePhc(phc: string): ParsedPhc | null {
    const parts = phc.split('$');
    if (parts.length !== 5) return null;
    const [empty, algoId, params, salt, digest] = parts;
    if (empty !== ''
        || algoId === undefined || algoId === ''
        || params === undefined || params === ''
        || salt === undefined || salt === ''
        || digest === undefined || digest === '') {
        return null;
    }
    return { algoId, params, salt, digest };
}

function iterationsFromParams(params: string): number | null {
    if (!params.startsWith('i=')) return null;
    const n = Number(params.slice(2));
    if (!Number.isInteger(n) || n < 1) return null;
    return n;
}

function scryptParamsFrom(
    params: string,
): { logN: number; r: number; p: number } | null {
    const parts = params.split(',');
    if (parts.length !== 3) return null;
    const values: Record<string, number> = {};
    for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq < 1) return null;
        const key = part.slice(0, eq);
        const n = Number(part.slice(eq + 1));
        if (!Number.isInteger(n) || n < 1) return null;
        if (values[key] !== undefined) return null;
        values[key] = n;
    }
    const logN = values['ln'];
    const r = values['r'];
    const p = values['p'];
    if (logN === undefined
        || r === undefined
        || p === undefined) {
        return null;
    }
    return { logN, r, p };
}

async function pbkdf2Derive(
    plaintext: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
    bits: number,
): Promise<Uint8Array<ArrayBuffer>> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(plaintext),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        keyMaterial,
        bits,
    );
    return new Uint8Array(derived);
}

// A deliberate constant-time compare: returning early on the
// first differing byte would leak, through timing, how much of
// the digest a guess has matched. Length is not secret.
function constantTimeEqual(
    a: Uint8Array,
    b: Uint8Array,
): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i]! ^ b[i]!;
    }
    return diff === 0;
}

async function pbkdf2Verify(
    plaintext: string,
    parsed: ParsedPhc,
): Promise<boolean> {
    const iterations = iterationsFromParams(parsed.params);
    if (iterations === null) return false;
    let salt: Uint8Array<ArrayBuffer>;
    let expected: Uint8Array<ArrayBuffer>;
    try {
        salt = base64UrlToBytes(parsed.salt);
        expected = base64UrlToBytes(parsed.digest);
    } catch {
        return false;
    }
    const actual = await pbkdf2Derive(
        plaintext, salt, iterations, expected.length * 8,
    );
    return constantTimeEqual(actual, expected);
}

async function scryptVerify(
    plaintext: string,
    parsed: ParsedPhc,
): Promise<boolean> {
    if (scryptDerive === null) return false;
    const params = scryptParamsFrom(parsed.params);
    if (params === null) return false;
    let salt: Uint8Array<ArrayBuffer>;
    let expected: Uint8Array<ArrayBuffer>;
    try {
        salt = base64UrlToBytes(parsed.salt);
        expected = base64UrlToBytes(parsed.digest);
    } catch {
        return false;
    }
    try {
        const actual = await scryptDerive(
            plaintext,
            salt,
            params.logN,
            params.r,
            params.p,
            expected.length,
        );
        return constantTimeEqual(actual, expected);
    } catch {
        return false;
    }
}

type PhcVerifier = (
    plaintext: string,
    parsed: ParsedPhc,
) => Promise<boolean>;

const SCRYPT_ALGO_ID = 'scrypt';

// Per-algorithm verifiers keyed by PHC algo-id. Each is a
// self-contained, DELETABLE unit (see the scrypt-cutover note
// above). An unknown algo-id has no entry and fails closed.
const VERIFIERS: Record<string, PhcVerifier> = {
    [ALGO_ID]: pbkdf2Verify,
    [SCRYPT_ALGO_ID]: scryptVerify,
};

// The single algorithm hashPassword uses for NEW credentials.
// boot() registers scrypt. Tests register testHashPassword.
// Unset hasher is a caller bug — throw, do not write PBKDF2.
let currentPasswordHash: PasswordHasher | undefined;
let scryptDerive: ScryptDerive | null = null;

export function setPasswordHasher(
    hash: PasswordHasher | null,
): void {
    currentPasswordHash = hash ?? undefined;
}

export function setScryptDerive(
    derive: ScryptDerive | null,
): void {
    scryptDerive = derive;
}

export async function hashPassword(
    plaintext: string,
): Promise<string> {
    if (currentPasswordHash === undefined) {
        throw new Error(
            'password hasher is not configured',
        );
    }
    return currentPasswordHash(plaintext);
}

export async function verifyPassword(
    plaintext: string,
    storedPhc: string,
): Promise<boolean> {
    const parsed = parsePhc(storedPhc);
    if (parsed === null) return false;
    const verifier = VERIFIERS[parsed.algoId];
    if (verifier === undefined) return false;
    return verifier(plaintext, parsed);
}
