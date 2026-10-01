import type {
    Id,
    MessagePairEntity,
    StateEntity,
} from '../shared/types.ts';
import { pickString } from './validators.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    byAtThenIdAscending,
    compareIdentifiers,
} from '../shared/identifier.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';

// The message-plane reduction, family-agnostic and pure over
// rows a family's own derivation has already fetched (Efficiency:
// one prefix scan per derivation lives in the caller, never
// here — this module never touches a DbAdapter).

const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

// The two methods a document pair can carry (design
// decision 6): PUT writes/edits/transitions the document,
// DELETE tombstones it. A POST at the SAME document is an
// OPERATION record, never a document — no-op for ideas/
// projects (neither ever POSTs at its own document);
// load-bearing once a family's create-shaped genesis pair
// shares its (path, name) (the flows family: POST
// 'flows' mints the create operation message pair at the
// SAME name a subsequent PUT 'flows/:id' revisits).
// Defense-in-depth, not the deciding mechanism —
// appendMessagePairOnce's nowUtc() `at` already orders a
// synthesized document message pair strictly after its
// sibling operation message pair.
const DOCUMENT_METHODS: ReadonlySet<string> =
    new Set([PUT_METHOD, DELETE_METHOD]);

export function bodyOf(
    message: string,
): Record<string, unknown> {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

// One decoded PUT/DELETE pair at a prefix: its stored
// response's parsed body (the wire), plus the fields a
// family's own reduction needs beyond the document itself —
// the response envelope's own
// (at, id) for arrival order, and the requester for
// provenance. Shared raw material for both the head-document
// reduction below and a family's own lifecycle reduction over
// the SAME pairs, grouped and compared by fields the family
// alone knows.
export interface DocumentMessagePair {
    readonly id: Id;
    readonly at: string;
    readonly name: string;
    readonly method: string;
    readonly body: Record<string, unknown>;
    readonly requesterIdentityId: Id;
}

// Every PUT/DELETE pair at `path`, decoded once —
// ascending by the envelope (at, id), the SAME arrival order
// the store's document head read (`messageStore(db).get`)
// picks a single head from. That shared mechanism is
// ordering ONLY: the store's document head read
// (`messageStore(db).get`) filters by name/path
// alone — every method, since it serves
// Supersedes/Follows provenance (the LOCK head) — while
// this function excludes every method but PUT/DELETE
// (the DOCUMENT head — design decision 6).
// POST/PATCH rows at the same document are not heads. Only
// successful writes are stored, so there is no status
// filter. Method comes from the pair's `method` column.
// DocumentMessagePair.at is the response stamp.
export function documentMessagePairsAt(
    messagePairs: readonly MessagePairEntity[],
    path: string,
): readonly DocumentMessagePair[] {
    const out: DocumentMessagePair[] = [];
    for (const messagePair of messagePairs) {
        if (messagePair.path !== path) {
            continue;
        }
        if (!DOCUMENT_METHODS.has(messagePair.method)) {
            continue;
        }
        out.push({
            id: messagePair.id,
            at: messagePair.response_at,
            name: messagePair.name,
            method: messagePair.method,
            body: bodyOf(messagePair.response),
            requesterIdentityId:
                messagePair.requester_identity_id,
        });
    }
    return out.sort(byAtThenIdAscending);
}

// The head document per name at a prefix. Family-agnostic and
// pure over the fetched rows; a family's own reshaping (api/
// derive-ideas.ts) turns each DerivedDocument into its own entity
// shape.
export interface DerivedDocument {
    readonly name: string;
    readonly messagePairId: string; // head pair (== the
                                    // advertisable ETag)
    readonly method: string;        // head method; DELETE
                                     // head == absent
    readonly body: Record<string, unknown>;
}

// Latest pair per name at a prefix by the (at, id)
// reduction; a DELETE head excludes the document.
// Supersedes is NEVER walked (provenance-only — a DAG
// under races; only the reduction decides currency).
export function deriveDocumentsAt(
    messagePairs: readonly MessagePairEntity[],
    path: string,
): Map<string, DerivedDocument> {
    const documentMessagePairs = documentMessagePairsAt(
        messagePairs, path,
    );
    const heads = latestByKey(
        documentMessagePairs, (messagePair) => messagePair.name,
    );
    const documents = new Map<string, DerivedDocument>();
    for (const [name, head] of heads) {
        if (head.method === DELETE_METHOD) continue;
        documents.set(name, {
            name,
            messagePairId: head.id,
            method: head.method,
            body: head.body,
        });
    }
    return documents;
}

// Flows' document body carries state, state_at, and
// state_event_id; every other document family carries state
// alone.
export const DELETED_STATE = 'deleted';

// The head pair as the document a family mapper reads.
export function headDocumentOf(
    head: MessagePairEntity,
): DerivedDocument {
    return {
        name: head.name,
        messagePairId: head.id,
        method: head.method,
        body: bodyOf(head.response),
    };
}

// A head whose body says `deleted` is a tombstone: absent
// from GET and from its collection.
export function documentIsTombstone(
    document: DerivedDocument,
): boolean {
    return pickString(document.body, 'state') === DELETED_STATE;
}

export interface DocumentLifecycleEvent {
    readonly stateEventId: Id;
    readonly state: string;
    readonly stateAt: string;
    readonly memberId: Id;
    readonly etag: string;
}

// Flows' lifecycle walk. One event per distinct
// state_event_id in arrival order: a later PUT resending the
// same event id is an echo, not a new event. The validator
// guarantees the key on every flow document body; a DELETE
// pair carries no body and is skipped.
export function documentLifecycleEvents(
    messagePairs: readonly DocumentMessagePair[],
): DocumentLifecycleEvent[] {
    const seen = new Set<Id>();
    const events: DocumentLifecycleEvent[] = [];
    for (const messagePair of messagePairs) {
        if (messagePair.method === DELETE_METHOD) continue;
        const stateEventId = pickString(
            messagePair.body, 'state_event_id',
        );
        if (seen.has(stateEventId)) continue;
        seen.add(stateEventId);
        events.push({
            stateEventId,
            state: pickString(messagePair.body, 'state'),
            stateAt: pickString(messagePair.body, 'state_at'),
            memberId: messagePair.requesterIdentityId,
            etag: messagePair.id,
        });
    }
    return events;
}

// One StateEntity row per lifecycle event, (state_at, id)
// ascending — the SAME order store-state.ts's getAllForIn
// returns the real states table rows in.
export function stateHistoryFrom(
    events: readonly DocumentLifecycleEvent[],
    documentId: Id,
): StateEntity[] {
    const rows: StateEntity[] = events.map((event) => ({
        id: event.stateEventId,
        entity_id: documentId,
        state: event.state,
        member_id: event.memberId,
        at: event.stateAt,
        etag: event.etag,
    }));
    return rows.sort(byAtThenIdAscending);
}

// The CURRENT lifecycle event: the (state_at, state_event_id)
// reduction over a document's FULL history — a later `at` wins,
// an equal `at` falls to the larger id — never arrival order,
// never the envelope `at`s, so a clock-skewed transition (an
// older state_at than genesis) never displaces genesis. Mirrors
// StateStore.getCurrentForIn's own (at, id) reduction over the
// real states table exactly (shared/ledger-reduction.ts's
// default compare).
function currentLifecycleEvent(
    history: readonly StateEntity[],
): StateEntity | undefined {
    return latestByKey(history, () => 'current')
        .get('current');
}

export function currentDocumentState(
    history: readonly StateEntity[],
): string | undefined {
    return currentLifecycleEvent(history)?.state;
}

// The shared identifier order every document family's list
// derivation sorts its final rows by — byte-identical
// across families, so it lives here. The order is the
// derivation's own: the seam promises rows, never an
// order, so no backend's row order is a fact to inherit.
export function byIdAscending<T extends { id: Id }>(
    a: T, b: T,
): number {
    return compareIdentifiers(a.id, b.id);
}
