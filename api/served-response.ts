import type { AttributeSchemaRow } from
    '../shared/record-constraints.ts';
import type { FieldLine } from
    '../shared/http-message/types.ts';
import { Octets } from '../shared/http-message/octets.ts';
import { contentLengthOfLatin1 } from
    '../shared/http-message/framing.ts';
import {
    parseWire,
    serializeWire,
} from '../shared/http-message/wire-codec.ts';
import {
    isRawJson,
    parsePreservingNumbers,
} from '../shared/http-message/json-numbers.ts';
import { sortJsonKeys } from
    '../shared/http-message/canonical.ts';
import { HTTP_OK } from '../shared/http-errors.ts';
import { rolesCanRead } from './attribute-acl.ts';

// A read serves what was stored (spec §2): the status line
// 200, this transmission's `date` and `request-id`, every
// other stored line as stored, and the body untouched but
// for the reader's projection. It is built from the
// `response` column alone: hoisted credential lines are
// never spliced back. The caller hands it everything; it
// reads no clock and no row.

export type Transmission = {
    readonly date: string,
    readonly requestId: string,
};

// A top-level key a reader sees only while holding one of
// its roles. Empty roles admit no reader; no bypass.
export type KeyReadRoles = ReadonlyMap<
    string, readonly string[]
>;

// What a reader sees of a body: all of it, the keys its
// roles admit, or an instance's values its roles may read
// by attribute (admin bypass included, as rolesCanRead).
export type Reader =
    | { readonly sees: 'whole' }
    | {
        readonly sees: 'keys',
        readonly readRoles: KeyReadRoles,
        readonly roles: readonly string[],
    }
    | {
        readonly sees: 'values',
        readonly attributesById: ReadonlyMap<
            string, AttributeSchemaRow
        >,
        readonly roles: readonly string[],
    };

const TRANSMISSION_LINES: ReadonlySet<string> = new Set([
    'date', 'request-id', 'content-length',
]);

export function servedResponse(
    stored: string,
    transmission: Transmission,
    reader: Reader,
): string {
    const model = parseWire(stored);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line',
        );
    }
    const body = model.body === undefined
        ? undefined
        : projectedBody(model.body.toLatin1(), reader);
    const fields: FieldLine[] = [
        ...model.fields.filter(
            (field) => !TRANSMISSION_LINES.has(field.name),
        ),
        { name: 'date', value: transmission.date },
        { name: 'request-id', value: transmission.requestId },
        ...(body === undefined
            ? []
            : [contentLengthOfLatin1(body)]),
    ];
    return serializeWire({
        startLine: {
            kind: 'response',
            version: 'HTTP/1.1',
            status: HTTP_OK,
            reason: '',
        },
        fields,
        body: body === undefined
            ? undefined
            : Octets.fromLatin1(body),
        trailer: undefined,
    });
}

// The only place a body is transformed (§3). It drops what
// the reader may not see and nothing else; when it drops
// nothing it returns the octets it was given. A body whose
// shape the projection does not declare is refused, never
// served whole: the guard on `secret` must not fail open.
export function projectedBody(
    body: string,
    reader: Reader,
): string {
    if (reader.sees === 'whole') return body;
    const value = parsePreservingNumbers(
        new TextDecoder().decode(
            Octets.fromLatin1(body).asBytes(),
        ),
    );
    // A number parses to a raw-JSON holder, itself an object.
    if (
        value === null
        || typeof value !== 'object'
        || Array.isArray(value)
        || isRawJson(value)
    ) {
        throw new Error('projected body is not a JSON object');
    }
    const record = value as Record<string, unknown>;
    const kept = reader.sees === 'keys'
        ? keptKeys(record, reader.readRoles, reader.roles)
        : keptValues(
            record, reader.attributesById, reader.roles,
        );
    if (kept === undefined) return body;
    return Octets.fromBytes(new TextEncoder().encode(
        JSON.stringify(sortJsonKeys(kept)),
    )).toLatin1();
}

// undefined: nothing was dropped.
function keptKeys(
    record: Record<string, unknown>,
    readRoles: KeyReadRoles,
    roles: readonly string[],
): Record<string, unknown> | undefined {
    const hidden = [...readRoles].filter(
        ([key, admitted]) => Object.hasOwn(record, key)
            && !admitted.some((role) => roles.includes(role)),
    ).map(([key]) => key);
    if (hidden.length === 0) return undefined;
    return Object.fromEntries(Object.entries(record)
        .filter(([key]) => !hidden.includes(key)));
}

// An attribute absent from the schema is unreadable.
function keptValues(
    record: Record<string, unknown>,
    attributesById: ReadonlyMap<string, AttributeSchemaRow>,
    roles: readonly string[],
): Record<string, unknown> | undefined {
    const values = record['values'];
    if (!Array.isArray(values)) {
        throw new Error(
            'projected instance body has no values array',
        );
    }
    const readable = values.filter((entry) => {
        const id = (entry as { attribute_id?: unknown })
            .attribute_id;
        const attribute = typeof id === 'string'
            ? attributesById.get(id)
            : undefined;
        return attribute !== undefined
            && rolesCanRead(roles, attribute);
    });
    if (readable.length === values.length) return undefined;
    return { ...record, values: readable };
}

// Our wire to the platform's Response: status, lines, and
// body octets, never decoded to text on the way.
export function responseOfWire(wire: string): Response {
    const model = parseWire(wire);
    if (model.startLine.kind !== 'response') {
        throw new Error('served message has no status line');
    }
    const headers = new Headers();
    for (const field of model.fields) {
        headers.append(field.name, field.value);
    }
    return new Response(
        model.body === undefined
            ? null
            : model.body.asBytes().buffer as ArrayBuffer,
        { status: model.startLine.status, headers },
    );
}
