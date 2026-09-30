// shared/http-message/multipart.ts
import { HttpMessageError } from './types.ts';

// A collection is multipart/mixed of the responses its
// documents serve (RFC 2046 §5.1; RFC 9112 §10.1). Every
// part is framed by its own content-length, never by
// scanning for the boundary, so a body that holds the
// boundary cannot split a part.

export const MULTIPART_MIXED = 'multipart/mixed';
export const RESPONSE_PART_TYPE =
    'application/http; msgtype=response';

const CRLF = '\r\n';
const DASHES = '--';
const PART_HEAD = 'content-type: ' + RESPONSE_PART_TYPE;
// RFC 2046 §5.1.1's bcharsnospace, 1 to 70 of them. The
// space it allows inside a boundary is refused: a minted
// UUID never needs one.
const BOUNDARY = /^[0-9A-Za-z'()+_,\-./:=?]{1,70}$/;

function assertBoundary(boundary: string): void {
    if (!BOUNDARY.test(boundary)) {
        throw new HttpMessageError(
            'invalid multipart boundary: ' + boundary,
        );
    }
}

export function joinParts(
    parts: readonly string[],
    boundary: string,
): string {
    assertBoundary(boundary);
    if (parts.length === 0) {
        // RFC 2046 §5.1.1: a multipart body needs a part.
        throw new HttpMessageError(
            'a multipart body needs at least one part',
        );
    }
    const framed = parts.map((part) =>
        DASHES + boundary + CRLF + PART_HEAD + CRLF + CRLF
            + part
    );
    return framed.join(CRLF) + CRLF
        + DASHES + boundary + DASHES;
}

// The boundary parameter, read by its own reader: the
// structured-field parser takes a leading digit for a
// number (finding 19).
export function boundaryOf(contentType: string): string {
    const [media, ...parameters] = contentType.split(';');
    if (media!.trim().toLowerCase() !== MULTIPART_MIXED) {
        throw new HttpMessageError(
            'content-type is not multipart/mixed: '
                + contentType,
        );
    }
    for (const parameter of parameters) {
        const equals = parameter.indexOf('=');
        if (equals < 0) continue;
        const name = parameter.slice(0, equals).trim()
            .toLowerCase();
        if (name !== 'boundary') continue;
        const raw = parameter.slice(equals + 1).trim();
        const boundary = raw.length >= 2
                && raw.startsWith('"')
                && raw.endsWith('"')
            ? raw.slice(1, -1)
            : raw;
        assertBoundary(boundary);
        return boundary;
    }
    throw new HttpMessageError(
        'multipart/mixed has no boundary: ' + contentType,
    );
}

export function splitParts(
    contentType: string,
    body: string,
): string[] {
    const boundary = boundaryOf(contentType);
    const delimiter = DASHES + boundary;
    if (!body.startsWith(delimiter + CRLF)) {
        throw new HttpMessageError(
            'multipart body lacks its opening delimiter',
        );
    }
    const parts: string[] = [];
    let at = delimiter.length + CRLF.length;
    for (;;) {
        const headEnd = body.indexOf(CRLF + CRLF, at);
        if (headEnd < 0 || body.slice(at, headEnd)
            .toLowerCase().replaceAll(' ', '')
            !== PART_HEAD.replaceAll(' ', '')) {
            throw new HttpMessageError(
                'multipart part is not an HTTP response part',
            );
        }
        const start = headEnd + 2 * CRLF.length;
        const messageHeadEnd = body.indexOf(CRLF + CRLF, start);
        if (messageHeadEnd < 0) {
            throw new HttpMessageError(
                'multipart part has no header section end',
            );
        }
        const end = messageHeadEnd + 2 * CRLF.length
            + contentLengthOf(body.slice(start, messageHeadEnd));
        if (end > body.length) {
            throw new HttpMessageError(
                'multipart part runs past the body',
            );
        }
        parts.push(body.slice(start, end));
        if (!body.startsWith(CRLF + delimiter, end)) {
            throw new HttpMessageError(
                'multipart part is not followed by a'
                    + ' delimiter',
            );
        }
        at = end + CRLF.length + delimiter.length;
        if (body.startsWith(DASHES, at)) {
            if (at + DASHES.length !== body.length) {
                throw new HttpMessageError(
                    'multipart body continues after the'
                        + ' closing delimiter',
                );
            }
            return parts;
        }
        if (!body.startsWith(CRLF, at)) {
            throw new HttpMessageError(
                'multipart body lacks its closing delimiter',
            );
        }
        at += CRLF.length;
    }
}

// The one content-length line of a part's message head;
// none means the part has no body.
function contentLengthOf(head: string): number {
    const values = head.split(CRLF).slice(1)
        .filter((line) => line.toLowerCase()
            .startsWith('content-length:'))
        .map((line) => line.slice('content-length:'.length)
            .trim());
    if (values.length === 0) return 0;
    const [value] = values;
    if (values.length > 1 || !/^\d+$/.test(value!)) {
        throw new HttpMessageError(
            'multipart part has an invalid content-length',
        );
    }
    return Number(value);
}
