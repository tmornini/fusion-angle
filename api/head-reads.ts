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

// A family's lifecycle (api/document-family.ts:108): in
// a 'state' family a head whose body says `deleted` is a
// deleted document, as every family's DELETE head is.
export type Lifecycle = 'state' | 'stateless';

// What a GET selected (spec Decision 2). The selector
// computes which head, after the fence; a miss is its to
// throw (403 or 404). The head is served as stored.
export type HeadSelection = {
    readonly kind: 'document',
    readonly head: MessagePairEntity,
    readonly lifecycle: Lifecycle,
    readonly table: string,
    readonly id: Id,
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

// A stateless head at a prefix the gate has already fenced:
// its miss is plain absence, with no owner to probe.
export async function selectGlobalHead(
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
