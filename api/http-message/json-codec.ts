import { Octets } from './octets.ts';
import { sortFields, sortJsonKeys } from './canonical.ts';
import { isStoredField } from './framing.ts';
import {
    isHttpVersion,
    isStatusCode,
    isToken,
} from './grammar.ts';
import {
    HttpMessageError,
    type FieldLine,
    type MessageModel,
    type StartLine,
} from './types.ts';

// The JSON form: a deterministic object whose keys are sorted
// ASCII-ascending. Start-line fields are top-level siblings of
// header/body/trailer. The header (and trailer) is an ARRAY of
// [name, value] pairs — a JSON object cannot hold two
// set-cookie keys and would lose same-name order (RFC 9110
// §5.3). The body is the standard base64 of the octets — the
// lossless, charset-free encoding; absent when there is no body
// (absence is a missing key, never null).

export function parseJson(json: string): MessageModel {
    const root = asObject(parseJsonText(json), 'message');
    const startLine = parseJsonStartLine(root);
    const header = parseJsonFields(root.header, 'header');
    const fields = header.filter(isStoredField);
    const body = 'body' in root
        ? Octets.fromBase64(asString(root.body, 'body'))
        : undefined;
    const trailer = 'trailer' in root
        ? parseJsonFields(root.trailer, 'trailer')
        : undefined;
    return { startLine, fields, body, trailer };
}

function parseJsonText(json: string): unknown {
    try {
        return JSON.parse(json);
    } catch {
        throw new HttpMessageError('malformed JSON text');
    }
}

function parseJsonStartLine(
    root: Record<string, unknown>,
): StartLine {
    if ('method' in root) {
        const method = asString(root.method, 'method');
        const target = asString(root.target, 'target');
        const version = asString(root.version, 'version');
        if (!isToken(method)) {
            throw new HttpMessageError(
                'invalid method: ' + method,
            );
        }
        if (!isHttpVersion(version)) {
            throw new HttpMessageError(
                'invalid HTTP-version: ' + version,
            );
        }
        return { kind: 'request', method, target, version };
    }
    if ('status' in root) {
        const version = asString(root.version, 'version');
        const status = asNumber(root.status, 'status');
        const reason = asString(root.reason, 'reason');
        if (!isHttpVersion(version)) {
            throw new HttpMessageError(
                'invalid HTTP-version: ' + version,
            );
        }
        if (!isStatusCode(status)) {
            throw new HttpMessageError(
                'invalid status-code: ' + status,
            );
        }
        return { kind: 'response', version, status, reason };
    }
    throw new HttpMessageError(
        'message has neither method nor status',
    );
}

function parseJsonFields(
    value: unknown,
    label: string,
): FieldLine[] {
    return asArray(value, label).map((pair, index) => {
        const tuple = asArray(pair, label + '[' + index + ']');
        const name = asString(tuple[0], label + ' name')
            .toLowerCase();
        const fieldValue = asString(tuple[1], label + ' value');
        if (!isToken(name)) {
            throw new HttpMessageError(
                'invalid field name: ' + name,
            );
        }
        return { name, value: fieldValue };
    });
}

export function serializeJson(model: MessageModel): string {
    return JSON.stringify(sortJsonKeys(toJsonValue(model)));
}

function toJsonValue(
    model: MessageModel,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const line = model.startLine;
    if (line.kind === 'request') {
        out.method = line.method;
        out.target = line.target;
        out.version = line.version;
    } else {
        out.version = line.version;
        out.status = line.status;
        out.reason = line.reason;
    }
    out.header = pairs(model.fields);
    if (model.body !== undefined) {
        out.body = model.body.toBase64();
    }
    if (model.trailer !== undefined) {
        out.trailer = pairs(model.trailer);
    }
    return out;
}

function pairs(fields: readonly FieldLine[]): string[][] {
    return sortFields(fields).map((field) => [
        field.name,
        field.value,
    ]);
}

function asObject(
    value: unknown,
    label: string,
): Record<string, unknown> {
    if (
        value === null
        || typeof value !== 'object'
        || Array.isArray(value)
    ) {
        throw new HttpMessageError('expected object for ' + label);
    }
    return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new HttpMessageError('expected array for ' + label);
    }
    return value;
}

function asString(value: unknown, label: string): string {
    if (typeof value !== 'string') {
        throw new HttpMessageError('expected string for ' + label);
    }
    return value;
}

function asNumber(value: unknown, label: string): number {
    if (typeof value !== 'number') {
        throw new HttpMessageError('expected number for ' + label);
    }
    return value;
}
