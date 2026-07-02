import {
    HttpMessage,
} from '../shared/http-message/http-message.ts';
import {
    parseJson,
} from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import type {
    FieldLine,
    MessageModel,
} from '../shared/http-message/types.ts';
import { sha256Hex } from '../shared/digest.ts';

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

export function messageHashOf(
    canonical: string,
): Promise<string> {
    return sha256Hex(canonical);
}

export async function bodyEtagOf(
    model: MessageModel,
): Promise<string> {
    const body = HttpMessage.fromModel(model).body();
    return sha256Hex(
        body.exists() ? body.toBase64() : '',
    );
}
