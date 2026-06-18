import { Octets } from './octets.ts';
import { sortFields, sortJsonKeys } from './canonical.ts';
import {
    isRawJson,
    parsePreservingNumbers,
} from './json-numbers.ts';
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
import type {
    BodyCodec,
    BodyRegistry,
} from './media-registry.ts';

// The JSON form: a deterministic object whose keys are sorted
// ASCII-ascending. Start-line fields are top-level siblings of
// header/body/trailer. The header (and trailer) is an ARRAY of
// [name, value] pairs — a JSON object cannot hold two
// set-cookie keys and would lose same-name order (RFC 9110
// §5.3). The body is INLINE JSON when a JSON codec handles its
// content-type and it decodes to a non-string value; otherwise
// it is the standard base64 of the octets. A string body is
// therefore always base64 and a non-string body always inline —
// an unambiguous discriminator. Absence is a missing key, never
// null (a null body is a present JSON null).
//
// An inline body round-trips its VALUES, not its exact bytes:
// key order and whitespace are normalized and duplicate keys
// collapse last-wins (standard JSON). Number tokens, however,
// are preserved VERBATIM via the ES2025 JSON source-text
// primitives (see json-numbers.ts), so integers and decimals
// beyond IEEE-754 range are not rounded. Callers needing a
// byte-exact body use the wire form.

export function parseJson(
    json: string,
    registry: BodyRegistry,
): MessageModel {
    const root = asObject(parseJsonText(json), 'message');
    const startLine = parseJsonStartLine(root);
    const header = parseJsonFields(root.header, 'header');
    const fields = header.filter(isStoredField);
    const body = parseJsonBody(root, fields, registry);
    const trailer = 'trailer' in root
        ? parseJsonFields(root.trailer, 'trailer')
        : undefined;
    return { startLine, fields, body, trailer };
}

function parseJsonBody(
    root: Record<string, unknown>,
    fields: readonly FieldLine[],
    registry: BodyRegistry,
): Octets | undefined {
    if (!('body' in root)) return undefined;
    const value = root.body;
    if (typeof value === 'string') {
        return Octets.fromBase64(value);
    }
    const codec = jsonCodecFor(fields, registry);
    if (codec === undefined) {
        throw new HttpMessageError(
            'inline JSON body without a JSON content-type',
        );
    }
    return codec.encode(sortJsonKeys(value));
}

function jsonCodecFor(
    fields: readonly FieldLine[],
    registry: BodyRegistry,
): BodyCodec | undefined {
    const type = fields.find(
        (field) => field.name === 'content-type',
    );
    if (type === undefined) return undefined;
    return registry.codecFor(type.value);
}

function parseJsonText(json: string): unknown {
    try {
        return parsePreservingNumbers(json);
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

export function serializeJson(
    model: MessageModel,
    registry: BodyRegistry,
): string {
    return JSON.stringify(
        sortJsonKeys(toJsonValue(model, registry)),
    );
}

function toJsonValue(
    model: MessageModel,
    registry: BodyRegistry,
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
        out.body = bodyToJson(model.body, model.fields, registry);
    }
    if (model.trailer !== undefined) {
        out.trailer = pairs(model.trailer);
    }
    return out;
}

// Inline when a JSON codec handles the content-type and the body
// decodes to a non-string value; otherwise base64. A malformed
// or empty body under a JSON content-type falls back to base64
// (so serialization is total — it never throws on a valid
// model), and the type-based parse rule round-trips it.
function bodyToJson(
    octets: Octets,
    fields: readonly FieldLine[],
    registry: BodyRegistry,
): unknown {
    if (jsonCodecFor(fields, registry) !== undefined) {
        try {
            const value = parsePreservingNumbers(
                new TextDecoder().decode(octets.asBytes()),
            );
            if (typeof value !== 'string') return value;
        } catch {
            // not valid JSON under a JSON content-type
        }
    }
    return octets.toBase64();
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
    // A number parsed by parsePreservingNumbers arrives as a raw
    // JSON holder; unwrap it (status is small, so exact).
    if (isRawJson(value)) {
        const parsed = Number(JSON.stringify(value));
        if (Number.isFinite(parsed)) return parsed;
        throw new HttpMessageError('expected number for ' + label);
    }
    if (typeof value !== 'number') {
        throw new HttpMessageError('expected number for ' + label);
    }
    return value;
}
