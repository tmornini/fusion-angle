const ALPHABET =
    '0123456789abcdefghijklmnopqrstuvwxyz'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateCryptoSafeBase62(): string {
    let id = '';
    const b = new Uint8Array(1);
    while (id.length < 22) {
        crypto.getRandomValues(b);
        if (b[0]! < 248) {
            id += ALPHABET[b[0]! % 62];
        }
    }
    return id;
}
