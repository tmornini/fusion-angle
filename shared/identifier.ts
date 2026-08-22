import {
    base64UrlToBytes,
    bytesToBase64Url,
} from './base64url.ts';

export const IDENTIFIER_BYTE_LENGTH = 16;
export const IDENTIFIER_ASCII_LENGTH = 22;

export const NIL_IDENTIFIER = 'AAAAAAAAAAAAAAAAAAAAAA';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{21}[AQgw]$/;

const IDENTIFIER_DIGIT_VALUE = new Int16Array(128);
IDENTIFIER_DIGIT_VALUE.fill(-1);
for (let i = 0; i < 26; i++) {
    IDENTIFIER_DIGIT_VALUE[65 + i] = i;
    IDENTIFIER_DIGIT_VALUE[97 + i] = 26 + i;
}
for (let i = 0; i < 10; i++) {
    IDENTIFIER_DIGIT_VALUE[48 + i] = 52 + i;
}
IDENTIFIER_DIGIT_VALUE[45] = 62;
IDENTIFIER_DIGIT_VALUE[95] = 63;

export function isIdentifier(text: string): boolean {
    return IDENTIFIER_PATTERN.test(text);
}

export function encodeIdentifier(
    bytes: Uint8Array,
): string {
    if (bytes.length !== IDENTIFIER_BYTE_LENGTH) {
        throw new Error(
            'identifier requires 16 bytes',
        );
    }
    return bytesToBase64Url(bytes);
}

export function decodeIdentifier(
    text: string,
): Uint8Array {
    if (!isIdentifier(text)) {
        throw new Error(
            'identifier is not canonical',
        );
    }
    return base64UrlToBytes(text);
}

export function generateIdentifier(): string {
    const bytes = new Uint8Array(IDENTIFIER_BYTE_LENGTH);
    let text: string;
    do {
        crypto.getRandomValues(bytes);
        text = encodeIdentifier(bytes);
    } while (text === NIL_IDENTIFIER);
    return text;
}

export function compareIdentifiers(
    a: string, b: string,
): number {
    for (let i = 0; i < IDENTIFIER_ASCII_LENGTH; i++) {
        const av = IDENTIFIER_DIGIT_VALUE[a.charCodeAt(i)!]!;
        const bv = IDENTIFIER_DIGIT_VALUE[b.charCodeAt(i)!]!;
        if (av !== bv) return av - bv;
    }
    return 0;
}
