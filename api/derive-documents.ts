import type {
    Id,
    MessagePairEntity,
    StateEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';

// The message-plane reduction, family-agnostic and pure over
// rows a family's own derivation has already fetched (Efficiency:
// one prefix scan per derivation lives in the caller, never
// here — this module never touches a DbAdapter).

const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

// The two methods a document-address pair can carry (design
// decision 6): PUT writes/edits/transitions the document,
// DELETE tombstones it. A POST at the SAME address is an
// OPERATION record, never a document — no-op for ideas/
// projects (neither ever POSTs at its own document address);
// load-bearing once a family's create-shaped genesis pair
// shares its document address (the flows family: POST
// 'flows' mints the create operation message pair at the
// SAME uriId a subsequent PUT 'flows/:id' revisits).
// Defense-in-depth, not the deciding mechanism —
// appendMessagePair's nowUtc() `at` already orders a
// synthesized document message pair strictly after its
// sibling operation message pair.
const DOCUMENT_METHODS: ReadonlySet<string> =
    new Set([PUT_METHOD, DELETE_METHOD]);

export function requestBodyOf(
    message: string,
): Record<string, unknown> {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

// One decoded PUT/DELETE pair at a prefix: the request's
// parsed body, plus the fields a family's own reduction needs
// beyond the document itself — the response envelope's own
// (at, id) for arrival order, and the requester for
// provenance. Shared raw material for both the head-document
// reduction below and a family's own lifecycle reduction over
// the SAME pairs, grouped and compared by fields the family
// alone knows (api/derive-ideas.ts's state trio).
export interface DocumentMessagePair {
    readonly id: Id;
    readonly at: string;
    readonly uriId: string;
    readonly method: string;
    readonly body: Record<string, unknown>;
    readonly requesterIdentityId: Id;
}

// Every PUT/DELETE pair at `uriCollection`, decoded once —
// ascending by the envelope (at, id), the SAME arrival order
// headMessagePairIdAt (message-pair.ts) picks a single
// head from. That shared mechanism is ordering ONLY:
// headMessagePairIdAt filters by uri_id/uri_collection
// alone — every method, since it serves
// Supersedes/Follows provenance (the LOCK head) — while
// this function excludes every method but PUT/DELETE
// (the DOCUMENT head — design decision 6).
// POST/PATCH rows at the same address are not heads. Only
// successful writes are stored, so there is no status
// filter. Method comes from the pair's `method` column.
// DocumentMessagePair.at is the response stamp.
export function documentMessagePairsAt(
    messagePairs: readonly MessagePairEntity[],
    uriCollection: string,
): readonly DocumentMessagePair[] {
    const out: DocumentMessagePair[] = [];
    for (const messagePair of messagePairs) {
        if (messagePair.uri_collection !== uriCollection) {
            continue;
        }
        if (!DOCUMENT_METHODS.has(messagePair.method)) {
            continue;
        }
        out.push({
            id: messagePair.id,
            at: messagePair.response_at,
            uriId: messagePair.uri_id,
            method: messagePair.method,
            body: requestBodyOf(messagePair.request),
            requesterIdentityId:
                messagePair.requester_identity_id,
        });
    }
    return out.sort((left, right) =>
        left.at < right.at ? -1
            : left.at > right.at ? 1
                : compareIdentifiers(left.id, right.id));
}

// The head document per uri_id at a prefix. Family-agnostic and
// pure over the fetched rows; a family's own reshaping (api/
// derive-ideas.ts) turns each DerivedDocument into its own entity
// shape.
export interface DerivedDocument {
    readonly uriId: string;
    readonly messagePairId: string; // head pair (== the
                                    // advertisable
                                    // Response-ID)
    readonly method: string;        // head method; DELETE
                                     // head == absent
    readonly body: Record<string, unknown>;
}

// Latest pair per uri_id at a prefix by the (at, id)
// reduction; a DELETE head excludes the document.
// Supersedes is NEVER walked (provenance-only — a DAG
// under races; only the reduction decides currency).
export function deriveDocumentsAt(
    messagePairs: readonly MessagePairEntity[],
    uriCollection: string,
): Map<string, DerivedDocument> {
    const documentMessagePairs = documentMessagePairsAt(
        messagePairs, uriCollection,
    );
    const heads = latestByKey(
        documentMessagePairs, (messagePair) => messagePair.uriId,
    );
    const documents = new Map<string, DerivedDocument>();
    for (const [uriId, head] of heads) {
        if (head.method === DELETE_METHOD) continue;
        documents.set(uriId, {
            uriId,
            messagePairId: head.id,
            method: head.method,
            body: head.body,
        });
    }
    return documents;
}

// The lifecycle trio (state/state_at/state_event_id) a
// document-class PUT body folds in (Decision 7), plus which
// identity is credited as its author — byte-identical across
// every document family (ideas, projects, and beyond): the
// trio's field names are the SAME wire vocabulary regardless
// of which entity the rest of the body describes, so this
// reduction was never per-family logic despite living
// duplicated in derive-ideas.ts/derive-projects.ts through
// Phase 3.
export const DELETED_STATE = 'deleted';

export interface DocumentLifecycleEvent {
    readonly stateEventId: Id;
    readonly state: string;
    readonly stateAt: string;
    readonly memberId: Id;
    readonly etag: string;
}

// Walk a document's pairs in ARRIVAL order and keep the FIRST
// occurrence of each distinct state_event_id: a later PUT
// resending the same trio (the document op's MEMBER_ID
// CAVEAT — an unchanged-state edit replays the STORED head's
// member_id) is a duplicate, not a new lifecycle event, so its
// own requester never surfaces as an author.
//
// A DELETE pair carries no trio — its stored body is empty
// (design decision 6: DELETE tombstones the document, it never
// carries wire fields), so it is skipped here entirely rather
// than walked into pickString, which would throw on the missing
// state_event_id key. The tombstone signal itself lives in
// deriveDocumentsAt's head-absence check, not in this lifecycle
// walk. Author gate 9: records is the first trio family whose
// :id address carries a live DELETE route, so a delete-then-
// recreate history (PUT, DELETE, PUT) is the first live case
// that would otherwise crash here; behavior-preserving for
// ideas/projects/flows, none of which has a DELETE at its own
// document address.
export function documentLifecycleEvents(
    messagePairs: readonly DocumentMessagePair[],
): DocumentLifecycleEvent[] {
    const seen = new Set<Id>();
    const events: DocumentLifecycleEvent[] = [];
    let afterDelete = false;
    for (const messagePair of messagePairs) {
        if (messagePair.method === DELETE_METHOD) {
            afterDelete = true;
            continue;
        }
        if ('state_event_id' in messagePair.body) {
            const stateEventId = pickString(
                messagePair.body, 'state_event_id',
            );
            if (seen.has(stateEventId)) continue;
            seen.add(stateEventId);
            events.push({
                stateEventId,
                state: pickString(messagePair.body, 'state'),
                stateAt: pickString(
                    messagePair.body, 'state_at',
                ),
                memberId: messagePair.requesterIdentityId,
                etag: messagePair.id,
            });
            afterDelete = false;
            continue;
        }
        const state = pickString(messagePair.body, 'state');
        const last = events[events.length - 1];
        if (
            !afterDelete
            && last !== undefined
            && last.state === state
        ) {
            continue;
        }
        afterDelete = false;
        events.push({
            stateEventId: messagePair.id,
            state,
            stateAt: messagePair.at,
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
    return rows.sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
                : compareIdentifiers(a.id, b.id));
}

// The CURRENT lifecycle event: the (state_at, state_event_id)
// reduction over a document's FULL history — a later `at` wins,
// an equal `at` falls to the larger id — never arrival order,
// never the envelope `at`s, so a clock-skewed transition (an
// older state_at than genesis) never displaces genesis. Mirrors
// StateStore.getCurrentForIn's own (at, id) reduction over the
// real states table exactly (shared/ledger-reduction.ts's
// default compare). Families that stamp the lifecycle trio on
// GET rows (ideas, projects, records, objectives, members)
// read the whole event; others only need `.state` via
// currentDocumentState.
export function currentLifecycleEvent(
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
