import {
    HttpMessage,
} from '../shared/http-message/http-message.ts';
import {
    parseJson,
} from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import {
    serializeWire,
} from '../shared/http-message/wire-codec.ts';
import type {
    FieldLine,
    MessageModel,
} from '../shared/http-message/types.ts';
import {
    sha256HexOfBytes,
} from '../shared/digest.ts';
import { Octets } from '../shared/http-message/octets.ts';

export const HEX64 = /^[0-9a-f]{64}$/;

const HTTP_VERSION = 'HTTP/1.1';
const JSON_MEDIA_TYPE = 'application/json';

// `HttpMessage`'s `#model` is private with no accessor, so
// the round trip through the library's own canonical JSON is
// the seam that recovers a `MessageModel` from a built
// `HttpMessage` — keeping the declared MessageModel-in/out
// interface without adding exports to shared/http-message.
function modelOf(message: HttpMessage): MessageModel {
    return parseJson(
        message.toJson(), defaultBodyRegistry(),
    );
}

export function buildRequestModel(input: {
    readonly method: string;
    readonly target: string;
    readonly fields: readonly FieldLine[];
    readonly body: unknown | undefined;
}): MessageModel {
    let message = HttpMessage.fromModel({
        startLine: {
            kind: 'request',
            method: input.method,
            target: input.target,
            version: HTTP_VERSION,
        },
        fields: [],
        body: undefined,
        trailer: undefined,
    });
    for (const field of input.fields) {
        message = message.withFieldPut(
            field.name, field.value,
        );
    }
    if (input.body !== undefined) {
        message = message.withBody(
            JSON_MEDIA_TYPE, input.body,
        );
    }
    return modelOf(message);
}

export function buildResponseModel(input: {
    readonly status: number;
    readonly fields: readonly FieldLine[];
    readonly body: unknown | undefined;
}): MessageModel {
    let message = HttpMessage.fromModel({
        startLine: {
            kind: 'response',
            version: HTTP_VERSION,
            status: input.status,
            reason: '',
        },
        fields: [],
        body: undefined,
        trailer: undefined,
    });
    for (const field of input.fields) {
        message = message.withFieldPut(
            field.name, field.value,
        );
    }
    if (input.body !== undefined) {
        message = message.withBody(
            JSON_MEDIA_TYPE, input.body,
        );
    }
    return modelOf(message);
}

export function canonicalJson(
    model: MessageModel,
): string {
    return HttpMessage.fromModel(model).toJson();
}

export function storedWire(
    model: MessageModel,
): string {
    return serializeWire(model);
}

export function requestMessageHash(
    wire: string,
): Promise<string> {
    return sha256HexOfBytes(
        Octets.fromLatin1(wire).asBytes(),
    );
}

export function bodyOctetsOf(
    model: MessageModel,
): Uint8Array {
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? body.toBytes()
        : new Uint8Array(0);
}

export function jsonBodyOctets(
    body: unknown,
): Uint8Array {
    return bodyOctetsOf(buildResponseModel({
        status: 200,
        fields: [],
        body,
    }));
}

export async function documentVersion(
    bodyOctets: Uint8Array,
    matchedEtag?: string,
): Promise<string> {
    if (matchedEtag === undefined) {
        return sha256HexOfBytes(bodyOctets);
    }
    const tag = Octets.fromLatin1(matchedEtag).asBytes();
    const joined = new Uint8Array(
        bodyOctets.length + tag.length,
    );
    joined.set(bodyOctets, 0);
    joined.set(tag, bodyOctets.length);
    return sha256HexOfBytes(joined);
}
