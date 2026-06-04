// Password credential hashing for the identity_credentials
// `secret` column. Self-describing PHC / modular-crypt strings:
//
//   $pbkdf2-sha256$i=<iterations>$<b64url-salt>$<b64url-digest>
//
// hashPassword writes with CURRENT_PASSWORD_HASH (one algorithm,
// never a permanent second). verifyPassword parses the embedded
// algo-id + params and dispatches through a REGISTRY of per-algo
// verifiers — each a self-contained, deletable unit — and
// degrades to false on any malformed input (a bad column must
// never crash a login).
//
// PBKDF2 is TRANSITIONAL. At the server tier CURRENT_PASSWORD_HASH
// flips to scrypt (Node's built-in crypto.scryptSync — a
// zero-dependency, memory-hard platform primitive). During a
// bounded window the pbkdf2 verifier stays so any $pbkdf2-sha256$
// row verifies-then-rehashes on next login; the self-describing
// prefix makes "any PBKDF2 rows left?" a decidable query. Once
// none remain — immediate here, because credentials are seed data
// and snapshots wipe-first — the pbkdf2 verifier entry AND
// pbkdf2Hash/pbkdf2Verify are DELETED. PBKDF2 never coexists
// permanently; the registry makes deletion one edit + one removal.

import {
    bytesToBase64Url,
    base64UrlToBytes,
} from './base64url.ts';

const ALGO_ID = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const DIGEST_BITS = 256;

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

async function pbkdf2Hash(plaintext: string): Promise<string> {
    const salt = crypto.getRandomValues(
        new Uint8Array(SALT_BYTES),
    );
    const digest = await pbkdf2Derive(
        plaintext, salt, PBKDF2_ITERATIONS, DIGEST_BITS,
    );
    return '$' + ALGO_ID + '$i=' + PBKDF2_ITERATIONS
        + '$' + bytesToBase64Url(salt)
        + '$' + bytesToBase64Url(digest);
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

type PhcVerifier = (
    plaintext: string,
    parsed: ParsedPhc,
) => Promise<boolean>;

// Per-algorithm verifiers keyed by PHC algo-id. Each is a
// self-contained, DELETABLE unit (see the scrypt-cutover note
// above). An unknown algo-id has no entry and fails closed.
const VERIFIERS: Record<string, PhcVerifier> = {
    [ALGO_ID]: pbkdf2Verify,
};

// The single algorithm hashPassword uses for NEW credentials.
// The server tier flips this to scrypt — never adds a second
// permanent algorithm.
const CURRENT_PASSWORD_HASH = pbkdf2Hash;

export async function hashPassword(
    plaintext: string,
): Promise<string> {
    return CURRENT_PASSWORD_HASH(plaintext);
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
