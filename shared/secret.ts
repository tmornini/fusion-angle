import { bytesToBase64Url } from './base64url.ts';

export const SECRET_BYTE_LENGTH = 32;

export function generateSecret(): string {
    const bytes = new Uint8Array(SECRET_BYTE_LENGTH);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
}
