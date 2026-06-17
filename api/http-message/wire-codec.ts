import { Octets } from './octets.ts';
import { sortFields } from './canonical.ts';
import {
    CONTENT_LENGTH,
    TRANSFER_ENCODING,
    isStoredField,
} from './framing.ts';
import {
    isHttpVersion,
    isStatusCodeText,
    isToken,
} from './grammar.ts';
import {
    HttpMessageError,
    type FieldLine,
    type MessageModel,
    type StartLine,
} from './types.ts';

const CRLF = '\r\n';
const SP = ' ';
const CHUNKED = 'chunked';

interface ChunkedBody {
    readonly body: Octets | undefined;
    readonly trailer: FieldLine[] | undefined;
}

// parseWire is the gate: profane wire text in, a trusted model
// out (or HttpMessageError). Wire is a Latin-1 binary string —
// one char per octet. serializeWire emits the canonical form.

export function parseWire(wire: string): MessageModel {
    const boundary = wire.indexOf(CRLF + CRLF);
    if (boundary === -1) {
        throw new HttpMessageError(
            'wire message has no header/body boundary',
        );
    }
    const head = wire.slice(0, boundary);
    const region = wire.slice(boundary + 4);
    const lines = head.split(CRLF);
    const startLine = parseStartLine(lines[0]!);
    const allFields = lines.slice(1).map(parseFieldLine);
    const fields = allFields.filter(isStoredField);
    const transfer = allFields.find(
        (field) => field.name === TRANSFER_ENCODING,
    );
    const length = allFields.find(
        (field) => field.name === CONTENT_LENGTH,
    );
    if (transfer !== undefined && length !== undefined) {
        throw new HttpMessageError(
            'both Transfer-Encoding and Content-Length present',
        );
    }
    if (transfer !== undefined) {
        if (transfer.value.toLowerCase() !== CHUNKED) {
            throw new HttpMessageError(
                'unsupported transfer-coding: ' + transfer.value,
            );
        }
        const decoded = decodeChunked(region);
        return {
            startLine,
            fields,
            body: decoded.body,
            trailer: decoded.trailer,
        };
    }
    return {
        startLine,
        fields,
        body: frameBody(length, region),
        trailer: undefined,
    };
}

function parseStartLine(line: string): StartLine {
    const first = line.indexOf(SP);
    const second = line.indexOf(SP, first + 1);
    if (first === -1 || second === -1) {
        throw new HttpMessageError(
            'malformed start-line: ' + line,
        );
    }
    const a = line.slice(0, first);
    const b = line.slice(first + 1, second);
    const c = line.slice(second + 1);
    if (a.startsWith('HTTP/')) {
        if (!isHttpVersion(a)) {
            throw new HttpMessageError(
                'invalid HTTP-version: ' + a,
            );
        }
        if (!isStatusCodeText(b)) {
            throw new HttpMessageError(
                'invalid status-code: ' + b,
            );
        }
        return {
            kind: 'response',
            version: a,
            status: Number(b),
            reason: c,
        };
    }
    if (!isToken(a)) {
        throw new HttpMessageError('invalid method: ' + a);
    }
    if (!isHttpVersion(c)) {
        throw new HttpMessageError('invalid HTTP-version: ' + c);
    }
    return { kind: 'request', method: a, target: b, version: c };
}

function parseFieldLine(line: string): FieldLine {
    const colon = line.indexOf(':');
    if (colon === -1) {
        throw new HttpMessageError(
            'field line without a colon: ' + line,
        );
    }
    const name = line.slice(0, colon).toLowerCase();
    if (!isToken(name)) {
        throw new HttpMessageError(
            'invalid field name: ' + name,
        );
    }
    const value = line.slice(colon + 1).trim();
    return { name, value };
}

function frameBody(
    declared: FieldLine | undefined,
    bodyText: string,
): Octets | undefined {
    if (declared !== undefined) {
        const length = Number(declared.value);
        if (!Number.isInteger(length) || length < 0) {
            throw new HttpMessageError(
                'invalid content-length: ' + declared.value,
            );
        }
        if (bodyText.length !== length) {
            throw new HttpMessageError(
                'content-length ' + length
                    + ' does not match body of '
                    + bodyText.length,
            );
        }
        return Octets.fromLatin1(bodyText);
    }
    return bodyText.length > 0
        ? Octets.fromLatin1(bodyText)
        : undefined;
}

// Decode the chunked body region. Chunk boundaries are a
// transport artifact (RFC 9112 §7.1) — they are concatenated
// away. A trailer survives only when it carries fields; absent
// fields collapse to undefined so serialization falls back to
// Content-Length framing.
function decodeChunked(region: string): ChunkedBody {
    let pos = 0;
    let data = '';
    for (;;) {
        const eol = region.indexOf(CRLF, pos);
        if (eol === -1) {
            throw new HttpMessageError(
                'chunk-size line is unterminated',
            );
        }
        const sizeText = region.slice(pos, eol);
        if (sizeText.includes(';')) {
            throw new HttpMessageError(
                'chunk extensions are not supported',
            );
        }
        const size = parseChunkSize(sizeText);
        pos = eol + 2;
        if (size === 0) break;
        const chunk = region.slice(pos, pos + size);
        if (chunk.length !== size) {
            throw new HttpMessageError(
                'chunk shorter than its declared size',
            );
        }
        data += chunk;
        pos += size;
        if (region.slice(pos, pos + 2) !== CRLF) {
            throw new HttpMessageError(
                'chunk data is not CRLF-terminated',
            );
        }
        pos += 2;
    }
    const trailer = parseTrailer(region, pos);
    return {
        body: data.length > 0
            ? Octets.fromLatin1(data)
            : undefined,
        trailer: trailer.length > 0 ? trailer : undefined,
    };
}

function parseChunkSize(text: string): number {
    if (!/^[0-9A-Fa-f]+$/.test(text)) {
        throw new HttpMessageError('invalid chunk size: ' + text);
    }
    return parseInt(text, 16);
}

function parseTrailer(region: string, start: number): FieldLine[] {
    const trailer: FieldLine[] = [];
    let pos = start;
    for (;;) {
        const eol = region.indexOf(CRLF, pos);
        if (eol === -1) {
            throw new HttpMessageError(
                'trailer section is unterminated',
            );
        }
        const line = region.slice(pos, eol);
        pos = eol + 2;
        if (line === '') break;
        trailer.push(parseFieldLine(line));
    }
    return trailer;
}

export function serializeWire(model: MessageModel): string {
    const fields = [...model.fields];
    if (model.trailer !== undefined) {
        fields.push({ name: TRANSFER_ENCODING, value: CHUNKED });
        return serializeHead(model.startLine, fields)
            + serializeChunked(model.body, model.trailer);
    }
    if (model.body !== undefined) {
        fields.push({
            name: CONTENT_LENGTH,
            value: String(model.body.byteLength()),
        });
    }
    let out = serializeHead(model.startLine, fields);
    if (model.body !== undefined) {
        out += model.body.toLatin1();
    }
    return out;
}

function serializeHead(
    startLine: StartLine,
    fields: readonly FieldLine[],
): string {
    let out = serializeStartLine(startLine) + CRLF;
    for (const field of sortFields(fields)) {
        out += field.name + ': ' + field.value + CRLF;
    }
    return out + CRLF;
}

function serializeChunked(
    body: Octets | undefined,
    trailer: readonly FieldLine[],
): string {
    let out = '';
    if (body !== undefined && body.byteLength() > 0) {
        out += body.byteLength().toString(16) + CRLF;
        out += body.toLatin1() + CRLF;
    }
    out += '0' + CRLF;
    for (const field of sortFields([...trailer])) {
        out += field.name + ': ' + field.value + CRLF;
    }
    return out + CRLF;
}

function serializeStartLine(line: StartLine): string {
    if (line.kind === 'request') {
        return line.method + SP + line.target + SP + line.version;
    }
    return line.version + SP + line.status + SP + line.reason;
}
