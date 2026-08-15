// The ONLY place web-app code names WebCrypto digest —
// the divorce point for content fingerprinting. SHA-256
// is part of the contract: derived display ids must stay
// stable across releases, so the algorithm is named here
// and nowhere else.
export async function sha256Bytes(
    text: string,
): Promise<Uint8Array> {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle
        .digest('SHA-256', data);
    return new Uint8Array(hash);
}

export async function sha256Hex(
    text: string,
): Promise<string> {
    const bytes = await sha256Bytes(text);
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

export async function sha256HexOfBytes(
    bytes: Uint8Array,
): Promise<string> {
    const hash = await crypto.subtle.digest(
        'SHA-256',
        bytes as unknown as ArrayBuffer,
    );
    const digest = new Uint8Array(hash);
    let hex = '';
    for (const byte of digest) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}
