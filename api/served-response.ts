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
import { compareAscii, sortJsonKeys } from
    '../shared/http-message/canonical.ts';
import { imfFixdate } from '../shared/pair-root.ts';
import { HTTP_OK } from '../shared/http-errors.ts';
import type { MessagePairEntity } from '../shared/types.ts';
import { rolesCanRead } from './attribute-acl.ts';

// A read serves what was stored (spec §6): status 200,
// this transmission's date and request-id, the pair's
// three lines, every other stored line as stored, and
// the body untouched but for the reader's projection.
// Hoisted credential lines are never spliced back. The
// caller hands it everything; it reads no clock and no row.

export type Transmission = {
    readonly date: string,
    readonly requestId: string,
};

// What the pair's row says about the write (§6).
export type Envelope = {
    readonly responseAt: string, // six-digit zulu
    readonly requesterIdentityId: string,
};

export function envelopeOf(
    pair: MessagePairEntity,
): Envelope {
    return {
        responseAt: pair.response_at,
        requesterIdentityId: pair.requester_identity_id,
    };
}

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

export function servedResponse(
    stored: string,
    transmission: Transmission,
    envelope: Envelope,
    reader: Reader,
): string {
    const model = parseWire(stored);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line',
        );
    }
    const original = model.body === undefined
        ? undefined
        : model.body.toLatin1();
    const body = original === undefined
        ? undefined
        : projectedBody(original, reader);
    const lengthLine = body !== undefined
        && body !== original
        ? [contentLengthOfLatin1(body)]
        : [];
    // Already in name order, so no sort runs.
    const placed: FieldLine[] = [
        ...lengthLine,
        { name: 'date', value: transmission.date },
        {
            name: 'last-modified',
            value: imfFixdate(envelope.responseAt),
        },
        {
            name: 'request-id',
            value: transmission.requestId,
        },
        {
            name: 'requester-identity-id',
            value: envelope.requesterIdentityId,
        },
        {
            name: 'response-at',
            value: envelope.responseAt,
        },
    ];
    return serializeWire({
        startLine: {
            kind: 'response',
            version: 'HTTP/1.1',
            status: HTTP_OK,
            reason: '',
        },
        fields: placedLines(model.fields, placed),
        body: body === undefined
            ? undefined
            : Octets.fromLatin1(body),
        trailer: undefined,
    });
}

// One ordered pass over a canonical head block. A placed
// line takes its value where that name stands, or is
// inserted in order when absent; a stored copy of a
// placed name is dropped. Every other line passes
// through. Nothing compares the result afterward.
export function placedLines(
    stored: readonly FieldLine[],
    placed: readonly FieldLine[],
): FieldLine[] {
    const out: FieldLine[] = [];
    let storedAt = 0;
    let placedAt = 0;
    while (
        storedAt < stored.length
        && placedAt < placed.length
    ) {
        const storedLine = stored[storedAt]!;
        const placedLine = placed[placedAt]!;
        const order = compareAscii(
            placedLine.name, storedLine.name,
        );
        if (order < 0) {
            out.push(placedLine);
            placedAt += 1;
        } else if (order === 0) {
            out.push(placedLine);
            placedAt += 1;
            storedAt += 1;
        } else {
            out.push(storedLine);
            storedAt += 1;
        }
    }
    while (storedAt < stored.length) {
        out.push(stored[storedAt]!);
        storedAt += 1;
    }
    while (placedAt < placed.length) {
        out.push(placed[placedAt]!);
        placedAt += 1;
    }
    return out;
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
