import type { Id, MessagePairEntity } from
    '../shared/types.ts';
import { EntityNotFoundError, RetiredEntityError } from './db.ts';
import type { DbAdapter } from './db.ts';
import {
    responseOfWire,
    servedResponse,
    type Reader,
    type Transmission,
} from './served-response.ts';
import { bodyOf, DELETED_STATE } from './derive-documents.ts';
import {
    joinParts,
    MULTIPART_MIXED,
} from '../shared/http-message/multipart.ts';
import { serializeWire } from '../shared/http-message/wire-codec.ts';
import { Octets } from '../shared/http-message/octets.ts';
import { contentLengthOfLatin1 } from
    '../shared/http-message/framing.ts';
import type { StatusLine } from '../shared/http-message/types.ts';
import { HTTP_NO_CONTENT, HTTP_OK } from '../shared/http-errors.ts';

// A family's lifecycle: in a 'state' family a head whose
// body says `deleted` is a deleted document, as every
// family's DELETE head is.
export type Lifecycle = 'state' | 'stateless';

// What a GET selected (spec Decision 2). The selector
// computes which heads, after the fence; a document's miss
// is its to throw (403 or 404). Each head is served as
// stored. A collection's heads are a subsequence of one
// store read, in its (response_at, id) order.
export type HeadSelection =
    | {
        readonly kind: 'document',
        readonly head: MessagePairEntity,
        readonly lifecycle: Lifecycle,
        readonly table: string,
        readonly id: Id,
        readonly reader: Reader,
    }
    | {
        readonly kind: 'collection',
        readonly heads: readonly MessagePairEntity[],
        readonly lifecycle: Lifecycle,
        readonly reader: Reader,
    };

// A head served whole needs no reader of its own: the
// credential and the instance are the only projections.
export function wholeHeadSelection(
    head: MessagePairEntity,
    lifecycle: Lifecycle,
    table: string,
    id: Id,
): HeadSelection {
    return {
        kind: 'document', head, lifecycle, table, id,
        reader: { sees: 'whole' },
    };
}

export function wholeCollectionSelection(
    heads: readonly MessagePairEntity[],
    lifecycle: Lifecycle,
): HeadSelection {
    return {
        kind: 'collection', heads, lifecycle,
        reader: { sees: 'whole' },
    };
}

// A stateless head at a prefix the gate has already fenced:
// its miss is plain absence, with no owner to probe.
export async function selectHeadAtPath(
    db: DbAdapter,
    prefix: string,
    name: string,
    table: string,
): Promise<HeadSelection> {
    const head = await db.messagePairs.getHeadPair(prefix, name);
    if (head === null) {
        throw new EntityNotFoundError(table, name);
    }
    return wholeHeadSelection(head, 'stateless', table, name);
}

// The live heads at a prefix the gate has already fenced.
// A deleted head among them is the gate's to drop.
export async function selectHeadsAtPath(
    db: DbAdapter,
    prefix: string,
    lifecycle: Lifecycle,
): Promise<HeadSelection> {
    return wholeCollectionSelection(
        await db.messagePairs.getCollectionHeadPairs(prefix),
        lifecycle,
    );
}

export function isDeletedHead(
    head: MessagePairEntity,
    lifecycle: Lifecycle,
): boolean {
    return head.method === 'DELETE'
        || (lifecycle === 'state'
            && storedStateOf(head) === DELETED_STATE);
}

// A 'state' family's PUT validator admits no body without
// `state`, so a stored head lacking it is the store's bug,
// never the reader's request: it names the head and fails
// the request, as a stored message with no status line does.
function storedStateOf(head: MessagePairEntity): string {
    const state = bodyOf(head.response)['state'];
    if (typeof state !== 'string') {
        throw new Error(
            'stored head has no state: '
                + head.path + head.name + ' (' + head.id + ')',
        );
    }
    return state;
}

// The ladder's last rungs (spec §5): a deleted document
// is Gone; a live one is its stored response, served.
export function servedSelection(
    selection: HeadSelection,
    transmission: Transmission,
): Response {
    if (selection.kind === 'collection') {
        return servedCollection(selection, transmission);
    }
    if (isDeletedHead(selection.head, selection.lifecycle)) {
        throw new RetiredEntityError(
            selection.table, selection.id,
        );
    }
    return responseOfWire(servedResponse(
        selection.head.response,
        transmission,
        selection.reader,
    ));
}

// A collection is multipart/mixed of the responses its
// live heads serve (spec §4); a collection that selects
// none answers 204, since a multipart body needs a part
// (RFC 2046 §5.1.1). It carries no etag: it names no one
// state.
function servedCollection(
    selection: Extract<HeadSelection, { kind: 'collection' }>,
    transmission: Transmission,
): Response {
    const parts = selection.heads
        .filter((head) =>
            !isDeletedHead(head, selection.lifecycle))
        .map((head) => servedResponse(
            head.response, transmission, selection.reader,
        ));
    const lines = [
        { name: 'date', value: transmission.date },
        { name: 'request-id', value: transmission.requestId },
    ];
    if (parts.length === 0) {
        return responseOfWire(serializeWire({
            startLine: statusLine(HTTP_NO_CONTENT),
            fields: lines,
            body: undefined,
            trailer: undefined,
        }));
    }
    const boundary = crypto.randomUUID();
    const body = joinParts(parts, boundary);
    return responseOfWire(serializeWire({
        startLine: statusLine(HTTP_OK),
        fields: [
            ...lines,
            contentLengthOfLatin1(body),
            {
                name: 'content-type',
                value: MULTIPART_MIXED + '; boundary=' + boundary,
            },
        ],
        body: Octets.fromLatin1(body),
        trailer: undefined,
    }));
}

function statusLine(status: number): StatusLine {
    return {
        kind: 'response', version: 'HTTP/1.1',
        status, reason: '',
    };
}
