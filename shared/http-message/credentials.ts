import { sortFields } from './canonical.ts';

// Six names, and no name on both sides (RFC 9110 §11,
// RFC 6265). The list does not grow with routes. The
// canonical order puts these lines after every other
// field, so a message's hoisted lines are the tail of
// its header block. Each message stores that tail
// beside it, zero bytes when it carried none, and
// putting it back is a splice before the blank line.
export const REQUEST_CREDENTIAL_NAMES = [
    'authorization',
    'proxy-authorization',
    'cookie',
] as const;

export const RESPONSE_CREDENTIAL_NAMES = [
    'set-cookie',
    'authentication-info',
    'proxy-authentication-info',
] as const;

const CRLF = '\r\n';

type FieldLine = {
    readonly name: string;
    readonly value: string;
};

function includesName(
    names: readonly string[],
    name: string,
): boolean {
    for (const candidate of names) {
        if (candidate === name) return true;
    }
    return false;
}

function credentialName(name: string): boolean {
    return includesName(REQUEST_CREDENTIAL_NAMES, name)
        || includesName(RESPONSE_CREDENTIAL_NAMES, name);
}

export function splitCredentials(
    fields: readonly FieldLine[],
): { kept: FieldLine[]; hoisted: FieldLine[] } {
    const kept: FieldLine[] = [];
    const hoisted: FieldLine[] = [];
    for (const field of fields) {
        if (credentialName(field.name)) {
            hoisted.push(field);
        } else {
            kept.push(field);
        }
    }
    return { kept, hoisted };
}

// A stable partition of fields already in name order:
// the credential lines keep their order at the end.
export function credentialsLast(
    fields: readonly FieldLine[],
): FieldLine[] {
    const split = splitCredentials(fields);
    return [...split.kept, ...split.hoisted];
}

function latin1Bytes(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
}

function latin1Text(bytes: Uint8Array): string {
    let text = '';
    for (const byte of bytes) {
        text += String.fromCharCode(byte);
    }
    return text;
}

function blockText(fields: readonly FieldLine[]): string {
    let text = '';
    for (const field of sortFields(fields)) {
        text += field.name + ': ' + field.value + CRLF;
    }
    return text;
}

export function secretBytes(
    hoisted: readonly FieldLine[],
): Uint8Array {
    for (const field of hoisted) {
        if (!credentialName(field.name)) {
            throw new Error(
                'secret line is not a credential: '
                    + field.name,
            );
        }
    }
    return latin1Bytes(blockText(hoisted));
}

const HEADER_END = CRLF + CRLF;

// Zero or more lines, each `name: value` with one of
// the six names and CRLF-terminated. Line order and
// joining are not checked.
export function isSecretsText(text: string): boolean {
    if (text === '') return true;
    if (!text.endsWith(CRLF)) return false;
    for (const line of text.slice(0, -CRLF.length).split(CRLF)) {
        if (line.includes('\r') || line.includes('\n')) {
            return false;
        }
        const colon = line.indexOf(': ');
        if (colon === -1) return false;
        if (!credentialName(line.slice(0, colon))) return false;
    }
    return true;
}

export function mergeSecret(
    message: string,
    secrets: Uint8Array,
): string {
    const end = message.indexOf(HEADER_END);
    if (end === -1) {
        throw new Error('message has no header block');
    }
    const at = end + CRLF.length;
    return message.slice(0, at)
        + latin1Text(secrets)
        + message.slice(at);
}
