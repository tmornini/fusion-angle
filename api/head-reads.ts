import type { Id, MessagePairEntity } from
    '../shared/types.ts';
import { RetiredEntityError } from './db.ts';
import {
    responseOfWire,
    servedResponse,
    type Reader,
    type Transmission,
} from './served-response.ts';
import {
    documentIsTombstone,
    headDocumentOf,
} from './derive-documents.ts';

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

export function isDeletedHead(
    head: MessagePairEntity,
    lifecycle: Lifecycle,
): boolean {
    return head.method === 'DELETE'
        || (lifecycle === 'state'
            && documentIsTombstone(headDocumentOf(head)));
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
