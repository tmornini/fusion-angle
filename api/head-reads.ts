import type { Id, MessagePairEntity } from
    '../shared/types.ts';
import { EntityNotFoundError, RetiredEntityError } from './db.ts';
import type { DbAdapter } from './db.ts';
import {
    envelopeOf,
    placedLines,
    responseOfWire,
    servedBodyOf,
    servedResponse,
    type Reader,
    type Transmission,
} from './served-response.ts';
import { rankedBySearch } from '../shared/search-match.ts';
import { bodyOf, DELETED_STATE } from './derive-documents.ts';
import {
    joinParts,
    MULTIPART_MIXED,
} from '../shared/http-message/multipart.ts';
import {
    parseWire,
    serializeWire,
} from '../shared/http-message/wire-codec.ts';
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
// store read, in its (response_at, id) order; a QUERY's
// collection is in best-match order instead. A version
// selection is one document's history from that same read:
// its head is the last PUT or DELETE, its versions are
// the PUTs in that order, and its miss is the family's. A
// mixed selection is the parts of several families, in the
// order the selector gave.
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
    }
    | {
        readonly kind: 'version',
        readonly head: MessagePairEntity,
        // The PUT the tag names at this document;
        // undefined when the tag names no PUT here.
        readonly pair: MessagePairEntity | undefined,
        readonly lifecycle: Lifecycle,
        readonly table: string,
        readonly id: Id,
        readonly tag: string,
        readonly reader: Reader,
    }
    | {
        readonly kind: 'versions',
        readonly head: MessagePairEntity,
        // Every PUT, in the history's (response_at, id)
        // order: oldest first.
        readonly pairs: readonly MessagePairEntity[],
        readonly lifecycle: Lifecycle,
        readonly table: string,
        readonly id: Id,
        readonly reader: Reader,
    }
    | {
        readonly kind: 'mixed',
        readonly parts: readonly MixedPart[],
    };

// A part of a selection over several families, each with
// its own reader and lifecycle, served in the given order.
// Its stored response names no document, and a head's
// prefix need not be its document's path (a seat's is
// not), so the part carries the path its document's GET
// answers at, served as its content-location (RFC 9110
// §8.7). A deleted head is dropped.
export interface MixedPart {
    readonly head: MessagePairEntity;
    readonly lifecycle: Lifecycle;
    readonly reader: Reader;
    readonly location: string;
}

// A head served whole needs no reader of its own: the
// credential, the instance, and the work order's event
// values are the only projections.
export function wholeHeadSelection(
    head: MessagePairEntity,
    lifecycle: Lifecycle,
    table: string,
    id: Id,
): Extract<HeadSelection, { kind: 'document' }> {
    return {
        kind: 'document', head, lifecycle, table, id,
        reader: { sees: 'whole' },
    };
}

export function wholeCollectionSelection(
    heads: readonly MessagePairEntity[],
    lifecycle: Lifecycle,
): Extract<HeadSelection, { kind: 'collection' }> {
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
): Promise<Extract<HeadSelection, { kind: 'collection' }>> {
    return wholeCollectionSelection(
        await db.messagePairs.getCollectionHeadPairs(prefix),
        lifecycle,
    );
}

// One history read, already (response_at, id). The head
// is the last PUT or DELETE; a document with neither is
// the family's miss. The PUTs, in that order, are the
// versions. A POST is neither.
async function writtenDocument(
    db: DbAdapter,
    prefix: string,
    name: string,
    miss: () => Promise<never>,
): Promise<{
    readonly head: MessagePairEntity,
    readonly pairs: readonly MessagePairEntity[],
}> {
    const history = await db.messagePairs
        .getDocumentHistory(prefix, name);
    const pairs: MessagePairEntity[] = [];
    let head: MessagePairEntity | undefined;
    for (const pair of history) {
        if (pair.method === 'PUT') {
            pairs.push(pair);
            head = pair;
        } else if (pair.method === 'DELETE') {
            head = pair;
        }
    }
    if (head === undefined) return await miss();
    return { head, pairs };
}

export async function selectVersionsAt(
    db: DbAdapter,
    prefix: string,
    name: string,
    lifecycle: Lifecycle,
    table: string,
    reader: Reader,
    miss: () => Promise<never>,
): Promise<HeadSelection> {
    const read = await writtenDocument(
        db, prefix, name, miss,
    );
    return {
        kind: 'versions',
        head: read.head,
        pairs: read.pairs,
        lifecycle,
        table,
        id: name,
        reader,
    };
}

export async function selectVersionAt(
    db: DbAdapter,
    prefix: string,
    name: string,
    tag: string,
    lifecycle: Lifecycle,
    table: string,
    reader: Reader,
    miss: () => Promise<never>,
): Promise<HeadSelection> {
    const read = await writtenDocument(
        db, prefix, name, miss,
    );
    let named: MessagePairEntity | undefined;
    for (const pair of read.pairs) {
        if (pair.id === tag) {
            named = pair;
            break;
        }
    }
    return {
        kind: 'version',
        head: read.head,
        pair: named,
        lifecycle,
        table,
        id: name,
        tag,
        reader,
    };
}

export function isDeletedHead(
    head: MessagePairEntity,
    lifecycle: Lifecycle,
): boolean {
    return head.method === 'DELETE'
        || (lifecycle === 'state'
            && storedStateOf(head) === DELETED_STATE);
}

// A QUERY's selection: the collection's live heads whose
// served bodies match `text`, best first. A deleted head
// is dropped before matching, as servedCollection would
// drop it, and each head is matched on the body its
// reader serves, so a QUERY never matches on what the GET
// hides.
export function matchingCollection(
    selection: HeadSelection,
    text: string,
    fieldsOf: (
        body: Record<string, unknown>,
        head: MessagePairEntity,
    ) => readonly string[],
): HeadSelection {
    if (selection.kind !== 'collection') {
        throw new Error(
            'matchingCollection needs a collection, not a '
                + selection.kind,
        );
    }
    const live = selection.heads.filter((head) =>
        !isDeletedHead(head, selection.lifecycle));
    return {
        ...selection,
        heads: rankedBySearch(live, text, (head) =>
            fieldsOf(servedBodyOf(head, selection.reader), head)),
    };
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
// is Gone before any tag; a live version is the PUT the
// tag names, or not found; a live list is every PUT,
// oldest first; a live document is its stored head.
export function servedSelection(
    selection: HeadSelection,
    transmission: Transmission,
): Response {
    if (selection.kind === 'collection') {
        return servedCollection(selection, transmission);
    }
    if (selection.kind === 'mixed') {
        return servedMixed(selection, transmission);
    }
    if (isDeletedHead(selection.head, selection.lifecycle)) {
        throw new RetiredEntityError(
            selection.table, selection.id,
        );
    }
    if (selection.kind === 'version') {
        if (selection.pair === undefined) {
            throw new EntityNotFoundError(
                selection.table, selection.tag,
            );
        }
        return responseOfWire(servedResponse(
            selection.pair.response,
            transmission,
            envelopeOf(selection.pair),
            selection.reader,
        ));
    }
    if (selection.kind === 'versions') {
        return servedVersions(selection, transmission);
    }
    return responseOfWire(servedResponse(
        selection.head.response,
        transmission,
        envelopeOf(selection.head),
        selection.reader,
    ));
}

// A collection is multipart/mixed of the responses its
// live heads serve (spec §4).
function servedCollection(
    selection: Extract<HeadSelection, { kind: 'collection' }>,
    transmission: Transmission,
): Response {
    return multipartAnswer(
        selection.heads
            .filter((head) =>
                !isDeletedHead(head, selection.lifecycle))
            .map((head) => servedResponse(
                head.response,
                transmission,
                envelopeOf(head),
                selection.reader,
            )),
        transmission,
    );
}

// A mixed selection is multipart/mixed as a collection
// is, each live part through its own reader and carrying
// its document's path.
function servedMixed(
    selection: Extract<HeadSelection, { kind: 'mixed' }>,
    transmission: Transmission,
): Response {
    return multipartAnswer(
        selection.parts
            .filter((part) =>
                !isDeletedHead(part.head, part.lifecycle))
            .map((part) => locatedResponse(
                servedResponse(
                    part.head.response,
                    transmission,
                    envelopeOf(part.head),
                    part.reader,
                ),
                part.location,
            )),
        transmission,
    );
}

function locatedResponse(served: string, location: string): string {
    const model = parseWire(served);
    return serializeWire({
        ...model,
        fields: placedLines(
            model.fields,
            [{ name: 'content-location', value: location }],
        ),
    });
}

// A document's versions, joined as a collection joins
// its heads. A written document has a PUT, so there is
// no empty body and no 204.
function servedVersions(
    selection: Extract<HeadSelection, { kind: 'versions' }>,
    transmission: Transmission,
): Response {
    return multipartAnswer(
        selection.pairs.map((pair) => servedResponse(
            pair.response,
            transmission,
            envelopeOf(pair),
            selection.reader,
        )),
        transmission,
    );
}

// Served parts as one multipart/mixed answer; none answers
// 204, since a multipart body needs a part (RFC 2046
// §5.1.1). It carries no etag: it names no one state.
function multipartAnswer(
    parts: readonly string[],
    transmission: Transmission,
): Response {
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
