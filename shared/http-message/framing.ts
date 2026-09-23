// content-length is a stored field. transfer-encoding is
// transport: the wire gate decodes it and drops the line.
// putField refuses both names; putBody writes the length.
export const CONTENT_LENGTH = 'content-length';
export const TRANSFER_ENCODING = 'transfer-encoding';
