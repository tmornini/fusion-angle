import { Decoded } from './decoded.ts';
import { Octets } from './octets.ts';
import {
    HttpMessageError,
    type FieldLine,
    type MessageModel,
} from './types.ts';
import type { BodyRegistry } from './media-registry.ts';
import type { ContentCodingRegistry } from './content-coding.ts';

const CONTENT_TYPE = 'content-type';
const CONTENT_ENCODING = 'content-encoding';
const IDENTITY = 'identity';

// The message body as a value object. The raw octets are the
// ledger; decoders project them. exists() is the absence probe;
// every accessor on an absent body throws (Design by Contract),
// and decoded() throws on a missing/unknown codec or a malformed
// body — a TELL, where message.query('body.x') stays a lenient
// ASK that returns absent.
export class Body {
    readonly #octets: Octets | undefined;
    readonly #fields: readonly FieldLine[];
    readonly #registry: BodyRegistry;
    readonly #codingRegistry: ContentCodingRegistry;

    private constructor(
        octets: Octets | undefined,
        fields: readonly FieldLine[],
        registry: BodyRegistry,
        codingRegistry: ContentCodingRegistry,
    ) {
        this.#octets = octets;
        this.#fields = fields;
        this.#registry = registry;
        this.#codingRegistry = codingRegistry;
    }

    static fromModel(
        model: MessageModel,
        registry: BodyRegistry,
        codingRegistry: ContentCodingRegistry,
    ): Body {
        return new Body(
            model.body, model.fields, registry, codingRegistry,
        );
    }

    exists(): boolean {
        return this.#octets !== undefined;
    }

    toBytes(): Uint8Array {
        return this.#require().asBytes();
    }

    // UTF-8 decode. A body whose real charset is not UTF-8 will
    // mojibake or hit U+FFFD; toBase64()/toBytes() stay lossless.
    toText(): string {
        return new TextDecoder().decode(this.#require().asBytes());
    }

    toBase64(): string {
        return this.#require().toBase64();
    }

    base64Decoded(): Body {
        return new Body(
            Octets.fromBase64(this.toText()),
            this.#fields,
            this.#registry,
            this.#codingRegistry,
        );
    }

    // Strip the Content-Encoding. Identity when there is none (or
    // only `identity`); every real coding (gzip, br, …) is a
    // deferred pluggable seam that throws loudly rather than
    // silently passing the still-encoded bytes through.
    contentDecoded(): Body {
        this.#require();
        const codings = this.#contentEncodings();
        if (codings.every((coding) => coding === IDENTITY)) {
            return this;
        }
        throw new HttpMessageError(
            'unsupported content-encoding: ' + codings.join(', '),
        );
    }

    // Decode per Content-Type, after stripping any Content-
    // Encoding — so a still-encoded (gzip, …) body fails loudly
    // rather than feeding compressed octets to the codec.
    decoded(): Decoded {
        return this.contentDecoded().#decodeByType();
    }

    #decodeByType(): Decoded {
        const octets = this.#require();
        const type = this.#fields.find(
            (field) => field.name === CONTENT_TYPE,
        );
        if (type === undefined) {
            throw new HttpMessageError(
                'body has no content-type to decode',
            );
        }
        const codec = this.#registry.codecFor(type.value);
        if (codec === undefined) {
            throw new HttpMessageError(
                'no body codec for ' + type.value,
            );
        }
        return Decoded.of(codec.decode(octets));
    }

    // Async sibling of contentDecoded: strip gzip/deflate via the
    // coding registry, returning a Body with the content-encoding
    // field removed (it is identity-coded now). An unknown coding
    // throws — the seam refuses to pass still-encoded octets on,
    // exactly as the sync path does.
    async contentDecodedAsync(): Promise<Body> {
        this.#require();
        const codings = this.#contentEncodings();
        if (codings.every((coding) => coding === IDENTITY)) {
            return this;
        }
        let octets = this.#require();
        for (const coding of [...codings].reverse()) {
            if (coding === IDENTITY) continue;
            const codec = this.#codingRegistry.codecFor(coding);
            if (codec === undefined) {
                throw new HttpMessageError(
                    'unsupported content-encoding: ' + coding,
                );
            }
            octets = await codec.decode(octets);
        }
        const fields = this.#fields.filter(
            (line) => line.name !== CONTENT_ENCODING,
        );
        return new Body(
            octets, fields, this.#registry, this.#codingRegistry,
        );
    }

    async decodedAsync(): Promise<Decoded> {
        const source = await this.contentDecodedAsync();
        return source.#decodeByType();
    }

    toNumber(): number {
        return this.decoded().toNumber();
    }

    toBoolean(): boolean {
        return this.decoded().toBoolean();
    }

    toDate(): Date {
        return this.decoded().toDate();
    }

    #require(): Octets {
        if (this.#octets === undefined) {
            throw new HttpMessageError('message has no body');
        }
        return this.#octets;
    }

    #contentEncodings(): string[] {
        const field = this.#fields.find(
            (line) => line.name === CONTENT_ENCODING,
        );
        if (field === undefined) return [];
        return field.value
            .split(',')
            .map((coding) => coding.trim().toLowerCase())
            .filter((coding) => coding !== '');
    }
}
