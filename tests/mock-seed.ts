// Test-only mock seed harness. Production postMockDataLoad
// keeps the real hasher; only this module injects the cheap
// test hash. Shared RO DB is RO by covenant — writers must
// call seededMockDb().

import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    bytesToBase64Url,
} from '../shared/base64url.ts';

const ALGO_ID = 'pbkdf2-sha256';
const TEST_PBKDF2_ITERATIONS = 1;
const SALT_BYTES = 16;
const DIGEST_BITS = 256;

/**
 * Low-iteration PBKDF2 for CLI test seeds only.
 * Emits a valid PHC string so verifyPassword works.
 */
export async function testHashPassword(
    plaintext: string,
): Promise<string> {
    const salt = crypto.getRandomValues(
        new Uint8Array(SALT_BYTES),
    );
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(plaintext),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: TEST_PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        DIGEST_BITS,
    );
    return '$' + ALGO_ID
        + '$i=' + TEST_PBKDF2_ITERATIONS
        + '$' + bytesToBase64Url(salt)
        + '$' + bytesToBase64Url(new Uint8Array(derived));
}

/** Full load; always a new memory DB. Safe for mutations. */
export async function seededMockDb(
): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    return db;
}

let sharedPromise: Promise<MemoryDbAdapter> | undefined;

/**
 * Memoized load for this process / module graph.
 * Read-only use only. Writers must use seededMockDb().
 */
export async function sharedMockDb(
): Promise<MemoryDbAdapter> {
    if (sharedPromise === undefined) {
        sharedPromise = seededMockDb();
    }
    return sharedPromise;
}
