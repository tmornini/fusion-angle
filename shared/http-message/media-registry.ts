import { Octets } from './octets.ts';
import { HttpMessageError } from './types.ts';

// A pluggable registry of body codecs, keyed by media type. The
// body octets are the ledger; a codec decodes them into a
// queryable value (and encodes a value back for withBody). The
// registry is immutable and injected at construction — there is
// no global mutable state, so two messages never contaminate
// each other's parsing.

export interface BodyCodec {
    readonly kind: 'json' | 'other';
    handles(mediaType: string): boolean;
    decode(body: Octets): unknown;
    encode(value: unknown): Octets;
}

export class BodyRegistry {
    readonly #codecs: readonly BodyCodec[];

    constructor(codecs: readonly BodyCodec[]) {
        this.#codecs = [...codecs];
    }

    codecFor(mediaType: string): BodyCodec | undefined {
        return this.#codecs.find(
            (codec) => codec.handles(mediaType),
        );
    }
}

export const jsonBodyCodec: BodyCodec = {
    kind: 'json',
    handles(mediaType: string): boolean {
        const base = mediaType.split(';')[0]!.trim().toLowerCase();
        return base === 'application/json'
            || base.endsWith('+json');
    },
    decode(body: Octets): unknown {
        try {
            return JSON.parse(decodeUtf8(body));
        } catch {
            throw new HttpMessageError('malformed JSON body');
        }
    },
    encode(value: unknown): Octets {
        return encodeUtf8(JSON.stringify(value));
    },
};

// application/x-www-form-urlencoded. URLSearchParams is the
// platform primitive; Object.fromEntries collapses duplicate
// keys last-value-wins (the platform default).
export const formBodyCodec: BodyCodec = {
    kind: 'other',
    handles(mediaType: string): boolean {
        const base = mediaType.split(';')[0]!.trim()
            .toLowerCase();
        return base === 'application/x-www-form-urlencoded';
    },
    decode(body: Octets): unknown {
        return Object.fromEntries(
            new URLSearchParams(decodeUtf8(body)),
        );
    },
    encode(value: unknown): Octets {
        return encodeUtf8(toFormParams(value).toString());
    },
};

export const textBodyCodec: BodyCodec = {
    kind: 'other',
    handles(mediaType: string): boolean {
        const base = mediaType.split(';')[0]!.trim()
            .toLowerCase();
        return base === 'text/plain';
    },
    decode(body: Octets): unknown {
        return decodeUtf8(body);
    },
    encode(value: unknown): Octets {
        if (typeof value !== 'string') {
            throw new HttpMessageError(
                'text/plain body must be a string',
            );
        }
        return encodeUtf8(value);
    },
};

// Validate at the gate: a form body encodes from an object of
// string values, never any/coerced data.
function toFormParams(value: unknown): URLSearchParams {
    if (typeof value !== 'object' || value === null) {
        throw new HttpMessageError(
            'form body must encode from an object',
        );
    }
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw !== 'string') {
            throw new HttpMessageError(
                'form field is not a string: ' + key,
            );
        }
        params.append(key, raw);
    }
    return params;
}

export function defaultBodyRegistry(): BodyRegistry {
    return new BodyRegistry([
        jsonBodyCodec,
        formBodyCodec,
        textBodyCodec,
    ]);
}

function decodeUtf8(body: Octets): string {
    return new TextDecoder().decode(body.asBytes());
}

function encodeUtf8(text: string): Octets {
    return Octets.fromBytes(new TextEncoder().encode(text));
}
