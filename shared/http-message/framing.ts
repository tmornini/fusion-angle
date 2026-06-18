import type { FieldLine } from './types.ts';

// Content-Length and Transfer-Encoding are DERIVED from the body
// octets and the presence of a trailer — never stored as model
// fields. Both gates (wire, JSON) strip them on the way in and
// both serializers synthesize them on the way out. Keeping the
// policy in one place keeps the two gates from drifting.
export const CONTENT_LENGTH = 'content-length';
export const TRANSFER_ENCODING = 'transfer-encoding';

export function isStoredField(field: FieldLine): boolean {
    return field.name !== CONTENT_LENGTH
        && field.name !== TRANSFER_ENCODING;
}
