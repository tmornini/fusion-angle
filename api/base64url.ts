// URL-safe base64 in two layers. The byte codec
// (bytesToBase64Url / base64UrlToBytes) is the primitive — HMAC
// signatures are raw bytes, not text. The text codec
// (base64UrlEncode / base64UrlDecode) is a UTF-8 adapter on top,
// for the JWT JSON header/claims segments. btoa/atob operate on
// Latin-1 binary strings, so the byte codec maps each byte to one
// char and back. Platform primitives only — zero runtime deps.

export function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function base64UrlToBytes(
    encoded: string,
): Uint8Array<ArrayBuffer> {
    const restored = encoded
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const remainder = restored.length % 4;
    const padded = remainder
        ? restored + '='.repeat(4 - remainder)
        : restored;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function base64UrlEncode(text: string): string {
    return bytesToBase64Url(new TextEncoder().encode(text));
}

export function base64UrlDecode(encoded: string): string {
    return new TextDecoder().decode(
        base64UrlToBytes(encoded),
    );
}
