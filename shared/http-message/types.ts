import type { Octets } from './octets.ts';

// The canonical in-memory model. Request and response are
// COMPOSED from shared parts and distinguished only by the
// start-line's self-disclosing `kind` — never an inheritance
// hierarchy. Framing fields (Content-Length, Transfer-Encoding)
// are NOT stored: they are derived from the body octets and the
// presence of a trailer (derive from the ledger).

export interface RequestLine {
    readonly kind: 'request';
    readonly method: string;   // RFC 9110 token
    readonly target: string;   // request-target, verbatim
    readonly version: string;  // e.g. "HTTP/1.1"
}

export interface StatusLine {
    readonly kind: 'response';
    readonly version: string;  // e.g. "HTTP/1.1"
    readonly status: number;   // 100..599
    readonly reason: string;   // reason-phrase, may be ''
}

export type StartLine = RequestLine | StatusLine;

// One field line. `name` is lower-cased (field names are
// case-insensitive; lowercase is the deterministic canonical
// case, matching HTTP/2). Array order is significant for
// same-name fields (RFC 9110 §5.3).
export interface FieldLine {
    readonly name: string;
    readonly value: string;
}

// `body` absent (undefined) is the absence of a body section;
// a present zero-length `Octets` is a present empty body. The
// two are distinct. `trailer` is present only with a chunked
// transfer (RFC 9112 §7.1.2).
export interface MessageModel {
    readonly startLine: StartLine;
    readonly fields: readonly FieldLine[];
    readonly body: Octets | undefined;
    readonly trailer: readonly FieldLine[] | undefined;
}

// A rejection at the parse gate is an EXPECTED failure: profane
// wire/JSON stopped before it can enter the model. Mirrors
// api/types.ts ValidationError. An impossible internal state is
// a bug and crashes instead.
export class HttpMessageError extends Error {}
