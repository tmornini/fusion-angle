// URL-safe base64 for the JWT-shaped access token. btoa/atob
// operate on Latin-1 binary strings, so route bytes through
// TextEncoder / TextDecoder to stay UTF-8 correct. Platform
// primitives only — zero runtime dependencies.

export function base64UrlEncode(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function base64UrlDecode(encoded: string): string {
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
    return new TextDecoder().decode(bytes);
}
