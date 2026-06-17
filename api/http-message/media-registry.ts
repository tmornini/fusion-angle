import { Octets } from './octets.ts';
import { HttpMessageError } from './types.ts';

// A pluggable registry of body codecs, keyed by media type. The
// body octets are the ledger; a codec decodes them into a
// queryable value (and encodes a value back for withBody). The
// registry is immutable and injected at construction — there is
// no global mutable state, so two messages never contaminate
// each other's parsing.

export interface BodyCodec {
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

export function defaultBodyRegistry(): BodyRegistry {
    return new BodyRegistry([jsonBodyCodec]);
}

function decodeUtf8(body: Octets): string {
    return new TextDecoder().decode(body.asBytes());
}

function encodeUtf8(text: string): Octets {
    return Octets.fromBytes(new TextEncoder().encode(text));
}
