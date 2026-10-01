import type { FieldLine } from './types.ts';

// content-length is a stored field. transfer-encoding is
// transport: the wire gate decodes it and drops the line.
// putField refuses both names; putBody writes the length.
export const CONTENT_LENGTH = 'content-length';
export const TRANSFER_ENCODING = 'transfer-encoding';

// A Latin-1 string holds one char per octet, so its length
// is the octet count the line must carry.
export function contentLengthOfLatin1(body: string): FieldLine {
    return { name: CONTENT_LENGTH, value: String(body.length) };
}
