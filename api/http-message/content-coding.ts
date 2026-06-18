import { Octets } from './octets.ts';

// RFC 9110 §8.4.1 content codings. gzip and deflate decode
// through the platform DecompressionStream — zero runtime deps,
// genuine stream I/O (so the API is async). Brotli (br) has no
// platform primitive; it is NOT built in. A caller with its own
// adapter registers it — the divorce-point seam. The registry is
// immutable and injected, mirroring BodyRegistry.

export interface ContentCodec {
    handles(coding: string): boolean;
    decode(body: Octets): Promise<Octets>;
}

export class ContentCodingRegistry {
    readonly #codecs: readonly ContentCodec[];

    constructor(codecs: readonly ContentCodec[]) {
        this.#codecs = [...codecs];
    }

    codecFor(coding: string): ContentCodec | undefined {
        return this.#codecs.find(
            (codec) => codec.handles(coding),
        );
    }
}

async function inflate(
    coding: 'gzip' | 'deflate', body: Octets,
): Promise<Octets> {
    const stream = new Blob([new Uint8Array(body.asBytes())])
        .stream()
        .pipeThrough(new DecompressionStream(coding));
    const buffer = await new Response(stream).arrayBuffer();
    return Octets.fromBytes(new Uint8Array(buffer));
}

export const gzipContentCodec: ContentCodec = {
    handles(coding: string): boolean {
        return coding === 'gzip';
    },
    decode(body: Octets): Promise<Octets> {
        return inflate('gzip', body);
    },
};

export const deflateContentCodec: ContentCodec = {
    handles(coding: string): boolean {
        return coding === 'deflate';
    },
    decode(body: Octets): Promise<Octets> {
        return inflate('deflate', body);
    },
};

export function defaultContentCodingRegistry():
    ContentCodingRegistry {
    return new ContentCodingRegistry([
        gzipContentCodec,
        deflateContentCodec,
    ]);
}
