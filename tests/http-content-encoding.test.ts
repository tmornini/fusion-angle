import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Octets } from '../shared/http-message/octets.ts';
import {
    ContentCodingRegistry,
    defaultContentCodingRegistry,
    gzipContentCodec,
    deflateContentCodec,
    type ContentCodec,
} from '../shared/http-message/content-coding.ts';
import { Body } from '../shared/http-message/body.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import {
    HttpMessageError,
} from '../shared/http-message/types.ts';

async function deflate(
    coding: 'gzip' | 'deflate', text: string,
): Promise<Octets> {
    const stream = new Blob([new TextEncoder().encode(text)])
        .stream()
        .pipeThrough(new CompressionStream(coding));
    const buffer = await new Response(stream).arrayBuffer();
    return Octets.fromBytes(new Uint8Array(buffer));
}

test('gzip codec round-trips compressed octets', async () => {
    const decoded = await gzipContentCodec.decode(
        await deflate('gzip', 'hello, world'),
    );
    assert.equal(
        new TextDecoder().decode(decoded.asBytes()),
        'hello, world',
    );
});

test('deflate codec round-trips compressed octets', async () => {
    const decoded = await deflateContentCodec.decode(
        await deflate('deflate', 'hello, world'),
    );
    assert.equal(
        new TextDecoder().decode(decoded.asBytes()),
        'hello, world',
    );
});

test('the default registry has no br codec', () => {
    assert.equal(
        defaultContentCodingRegistry().codecFor('br'),
        undefined,
    );
});

test('an injected br codec is found', () => {
    const br: ContentCodec = {
        handles: (coding) => coding === 'br',
        decode: (body) => Promise.resolve(body),
    };
    assert.equal(
        new ContentCodingRegistry([br]).codecFor('br'), br,
    );
});

const RESPONSE_LINE = {
    kind: 'response' as const,
    version: 'HTTP/1.1', status: 200, reason: 'OK',
};

test('decodedAsync strips gzip then decodes JSON', async () => {
    const body = Body.fromModel(
        {
            startLine: RESPONSE_LINE,
            fields: [
                { name: 'content-encoding', value: 'gzip' },
                {
                    name: 'content-type',
                    value: 'application/json',
                },
            ],
            body: await deflate('gzip', '{"ok":true}'),
            trailer: undefined,
        },
        defaultBodyRegistry(),
        defaultContentCodingRegistry(),
    );
    const decoded = await body.decodedAsync();
    assert.equal(decoded.query('ok').toBoolean(), true);
});

test('contentDecodedAsync rejects br by default', async () => {
    const body = Body.fromModel(
        {
            startLine: RESPONSE_LINE,
            fields: [{ name: 'content-encoding', value: 'br' }],
            body: Octets.fromLatin1('x'),
            trailer: undefined,
        },
        defaultBodyRegistry(),
        defaultContentCodingRegistry(),
    );
    await assert.rejects(
        body.contentDecodedAsync(), HttpMessageError,
    );
});
