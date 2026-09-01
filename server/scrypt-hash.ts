// Web Crypto has no scrypt, and neither does Deno's
// namespace, so this module imports node:crypto
// deliberately. A Deno or @std scrypt landing retires it.

import { scrypt as scryptCallback } from 'node:crypto';
import {
    bytesToBase64Url,
} from '../shared/base64url.ts';
import {
    SCRYPT_LOG_N,
    SCRYPT_R,
    SCRYPT_P,
    SCRYPT_MAXMEM_BYTES,
} from '../shared/password-hash.ts';

const SALT_BYTES = 16;
const DIGEST_BYTES = 32;

export async function scryptDerive(
    plaintext: string,
    salt: Uint8Array<ArrayBuffer>,
    logN: number,
    r: number,
    p: number,
    keyLength: number,
): Promise<Uint8Array<ArrayBuffer>> {
    const derived = await new Promise<Uint8Array>(
        (resolve, reject) => {
            scryptCallback(
                plaintext,
                salt,
                keyLength,
                {
                    N: 2 ** logN,
                    r,
                    p,
                    maxmem: SCRYPT_MAXMEM_BYTES,
                },
                (error, hash) => {
                    if (error !== null) {
                        reject(error);
                        return;
                    }
                    resolve(hash);
                },
            );
        },
    );
    return new Uint8Array(derived);
}

export async function scryptHash(
    plaintext: string,
): Promise<string> {
    const salt = crypto.getRandomValues(
        new Uint8Array(SALT_BYTES),
    );
    const digest = await scryptDerive(
        plaintext,
        salt,
        SCRYPT_LOG_N,
        SCRYPT_R,
        SCRYPT_P,
        DIGEST_BYTES,
    );
    return '$scrypt$ln=' + SCRYPT_LOG_N
        + ',r=' + SCRYPT_R
        + ',p=' + SCRYPT_P
        + '$' + bytesToBase64Url(salt)
        + '$' + bytesToBase64Url(digest);
}
