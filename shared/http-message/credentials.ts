import { sortFields } from './canonical.ts';
import { parseWire, serializeWire } from './wire-codec.ts';

// Six names, and no name on both sides (RFC 9110 §11,
// RFC 6265). The list does not grow with routes. One
// secret is two blocks. Each line ends with CRLF, and
// one extra CRLF between the blocks is the blank line.
// Neither side is zero bytes, not that blank line.
// merge inserts only this message's block.
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
    const request: FieldLine[] = [];
    const response: FieldLine[] = [];
    for (const field of hoisted) {
        if (includesName(
            REQUEST_CREDENTIAL_NAMES,
            field.name,
        )) {
            request.push(field);
        } else if (includesName(
            RESPONSE_CREDENTIAL_NAMES,
            field.name,
        )) {
            response.push(field);
        } else {
            throw new Error(
                'secret line is not a credential: '
                    + field.name,
            );
        }
    }
    const requestBlock = blockText(request);
    const responseBlock = blockText(response);
    if (requestBlock === '' && responseBlock === '') {
        return new Uint8Array(0);
    }
    return latin1Bytes(
        requestBlock + CRLF + responseBlock,
    );
}

function fieldOf(line: string): FieldLine {
    const colon = line.indexOf(':');
    if (colon === -1) {
        throw new Error('secret line has no colon');
    }
    return {
        name: line.slice(0, colon).toLowerCase(),
        value: line.slice(colon + 1).trim(),
    };
}

function terminatedLines(text: string): string[] {
    if (!text.endsWith(CRLF)) {
        throw new Error('secret line is unterminated');
    }
    const lines: string[] = [];
    let pos = 0;
    while (pos < text.length) {
        const eol = text.indexOf(CRLF, pos);
        if (eol === -1) {
            throw new Error('secret line is unterminated');
        }
        lines.push(text.slice(pos, eol));
        pos = eol + CRLF.length;
    }
    return lines;
}

function fieldsOf(
    lines: readonly string[],
    allowed: readonly string[],
): FieldLine[] {
    const fields: FieldLine[] = [];
    for (const line of lines) {
        const field = fieldOf(line);
        if (!includesName(allowed, field.name)) {
            throw new Error(
                'secret line is not in this block: '
                    + field.name,
            );
        }
        fields.push(field);
    }
    return fields;
}

function blocksOf(secret: Uint8Array): {
    request: FieldLine[];
    response: FieldLine[];
} {
    if (secret.length === 0) {
        return { request: [], response: [] };
    }
    const lines = terminatedLines(latin1Text(secret));
    const blank = lines.indexOf('');
    if (blank === -1) {
        throw new Error('secret has no blank line');
    }
    return {
        request: fieldsOf(
            lines.slice(0, blank),
            REQUEST_CREDENTIAL_NAMES,
        ),
        response: fieldsOf(
            lines.slice(blank + 1),
            RESPONSE_CREDENTIAL_NAMES,
        ),
    };
}

export function mergeSecret(
    message: string,
    secret: Uint8Array,
): string {
    const model = parseWire(message);
    const blocks = blocksOf(secret);
    const added = model.startLine.kind === 'request'
        ? blocks.request
        : blocks.response;
    return serializeWire({
        ...model,
        fields: [...model.fields, ...added],
    });
}
