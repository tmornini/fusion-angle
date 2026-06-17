import { CONTENT_LENGTH, TRANSFER_ENCODING } from './framing.ts';
import { isStatusCode, isToken } from './grammar.ts';
import type { Octets } from './octets.ts';
import {
    HttpMessageError,
    type MessageModel,
} from './types.ts';

// Pure model transformations. Each returns a NEW model; the
// caller never mutates in place. Field names and values are
// validated here (the modification surface is a gate too — a
// value with CR/LF would inject a header). Derived framing
// fields cannot be set directly; they are computed from the
// body and trailer.

export function putField(
    model: MessageModel,
    name: string,
    value: string,
): MessageModel {
    const settable = settableName(name);
    const kept = model.fields.filter(
        (field) => field.name !== settable,
    );
    return {
        ...model,
        fields: [...kept, { name: settable, value: checkValue(value) }],
    };
}

export function appendField(
    model: MessageModel,
    name: string,
    value: string,
): MessageModel {
    const settable = settableName(name);
    return {
        ...model,
        fields: [
            ...model.fields,
            { name: settable, value: checkValue(value) },
        ],
    };
}

export function deleteField(
    model: MessageModel,
    name: string,
): MessageModel {
    const lower = name.toLowerCase();
    return {
        ...model,
        fields: model.fields.filter(
            (field) => field.name !== lower,
        ),
    };
}

export function putMethod(
    model: MessageModel,
    method: string,
): MessageModel {
    if (model.startLine.kind !== 'request') {
        throw new HttpMessageError(
            'cannot set a method on a response',
        );
    }
    if (!isToken(method)) {
        throw new HttpMessageError('invalid method: ' + method);
    }
    return {
        ...model,
        startLine: { ...model.startLine, method },
    };
}

export function putTarget(
    model: MessageModel,
    target: string,
): MessageModel {
    if (model.startLine.kind !== 'request') {
        throw new HttpMessageError(
            'cannot set a target on a response',
        );
    }
    return {
        ...model,
        startLine: { ...model.startLine, target: checkTarget(target) },
    };
}

export function putStatus(
    model: MessageModel,
    status: number,
    reason: string,
): MessageModel {
    if (model.startLine.kind !== 'response') {
        throw new HttpMessageError(
            'cannot set a status on a request',
        );
    }
    if (!isStatusCode(status)) {
        throw new HttpMessageError('invalid status: ' + status);
    }
    return {
        ...model,
        startLine: {
            ...model.startLine,
            status,
            reason: checkValue(reason),
        },
    };
}

export function putBody(
    model: MessageModel,
    mediaType: string,
    body: Octets,
): MessageModel {
    const typed = putField(model, 'content-type', mediaType);
    return { ...typed, body };
}

function settableName(name: string): string {
    const lower = name.toLowerCase();
    if (!isToken(lower)) {
        throw new HttpMessageError('invalid field name: ' + name);
    }
    if (lower === CONTENT_LENGTH || lower === TRANSFER_ENCODING) {
        throw new HttpMessageError(
            lower + ' is derived, not settable',
        );
    }
    return lower;
}

// A field value or reason-phrase may carry internal SP/HTAB but
// never CR, LF, or NUL — those would splice a new line into the
// wire output (header / response splitting).
function checkValue(value: string): string {
    if (/[\r\n\0]/.test(value)) {
        throw new HttpMessageError(
            'value contains a control character',
        );
    }
    return value;
}

// A request-target carries no whitespace at all — a SP or HTAB
// would break the request-line into extra tokens, and CR/LF/NUL
// would splice a new line (request splitting).
function checkTarget(target: string): string {
    if (/[\r\n\0 \t]/.test(target)) {
        throw new HttpMessageError('invalid request target');
    }
    return target;
}
