// Rejection sampling keeps the base62 mapping unbiased: a random
// byte at or above the largest multiple of the alphabet size would
// over-represent the low characters, so discard it and draw again.
const ALPHABET =
    '0123456789abcdefghijklmnopqrstuvwxyz'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const ALPHABET_SIZE = ALPHABET.length;
const BYTE_VALUE_COUNT = 256;
const UNBIASED_CEILING =
    BYTE_VALUE_COUNT - (BYTE_VALUE_COUNT % ALPHABET_SIZE);
const ID_LENGTH = 22;

export function generateCryptoSafeBase62(): string {
    let id = '';
    const b = new Uint8Array(1);
    while (id.length < ID_LENGTH) {
        crypto.getRandomValues(b);
        if (b[0]! < UNBIASED_CEILING) {
            id += ALPHABET[b[0]! % ALPHABET_SIZE];
        }
    }
    return id;
}
