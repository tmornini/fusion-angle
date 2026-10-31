import { bytesToBase64Url } from './base64url.ts';

export const SECRET_BYTE_LENGTH = 32;
export const PASSWORD_BYTE_LENGTH = 16;
export const PASSWORD_ASCII_LENGTH = 22;

function mint(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
}

export function generateSecret(): string {
    return mint(SECRET_BYTE_LENGTH);
}

export function generatePassword(): string {
    return mint(PASSWORD_BYTE_LENGTH);
}
