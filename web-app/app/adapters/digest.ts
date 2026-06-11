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
