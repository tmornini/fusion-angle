import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, MemberEntity, StateEntity } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    currentLifecycleEvent,
    byIdAscending,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentPair,
} from './derive-documents.ts';
import {
    deriveOrganizationMemberSeats,
} from './derive-memberships.ts';

// Roster is seats ∩ identities. Leftover /members/ parent
// documents do not join. A person identity with a live seat
// is a human roster row; absence of either is not a member.

const MEMBERS_PREFIX = canonicalUriCollection(undefined, '/members/');

// id-first — the seven-sibling entityOf convention — picked
// explicitly (pickString) rather than a body spread, the
// deriveObjectiveRevisions/deriveFlowRecords precedent: a leaked
// operation-pair body reaching this construction throws loudly
// rather than silently mis-deriving. `type`'s validated alphabet
// ('human' | 'ai' | 'system') was enforced at write time
// (validateMemberDocumentBody) — trusted here, not re-checked,
// per the Article of Faith: once data has crossed validation,
// trust it completely. Head document → wire MemberEntity:
// entity field (`type`) from the head body; the lifecycle trio
// is stamped from the lifecycle-current StateEntity (never
// re-copied from the head body — genesis-wins-under-skew).
// `current` is required: every live member GET builds history
// first and passes the lifecycle-current event.
export function memberParentOf(
    document: DerivedDocument,
    current: StateEntity,
): MemberEntity {
    return {
        id: document.uriId,
        type: pickString(document.body, 'type') as
            MemberEntity['type'],
        state: current.state,
        state_at: current.at,
        state_event_id: current.id,
    };
}

function memberRowsFrom(
    documents: Map<string, DerivedDocument>,
    pairs: readonly DocumentPair[],
): MemberEntity[] {
    const pairsById = new Map<Id, DocumentPair[]>();
    for (const pair of pairs) {
        const list = pairsById.get(pair.uriId);
        if (list === undefined) {
            pairsById.set(pair.uriId, [pair]);
        } else {
            list.push(pair);
        }
    }
    const rows: MemberEntity[] = [];
    for (const [id, document] of documents) {
        const history = stateHistoryFrom(
            documentLifecycleEvents(
                pairsById.get(id) ?? [],
            ),
            id,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            continue;
        }
        // After DELETED filter history is non-empty for every
        // live trio document (genesis always mints an event).
        const current = currentLifecycleEvent(history)!;
        rows.push(memberParentOf(document, current));
    }
    return rows;
}

// Every member-parent head, id-lex ordered (byIdAscending, the
// IndexedDB reference — H7: the memory tier's own getAll is
// insertion-ordered, never id-lex, so this sort is load-bearing
// for every caller that compares against it). Trio stamped from
// lifecycle-current (genesis-wins-under-skew).
export async function deriveMemberParents(
    db: DbAdapter,
): Promise<MemberEntity[]> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', MEMBERS_PREFIX),
        db.responses.getAllWhere('uri_collection', MEMBERS_PREFIX),
    ]);
    const documents = deriveDocumentsAt(
        requests, responses, MEMBERS_PREFIX,
    );
    const pairs = documentPairsAt(
        requests, responses, MEMBERS_PREFIX,
    );
    return memberRowsFrom(documents, pairs)
        .sort(byIdAscending);
}

// The single-head read; throws EntityNotFoundError('members', id)
// on absence — the 404-byte parity anchor ('Not found:
// members/<id>') tests/drift-roster.test.ts pins byte-for-byte
// against the old plane. Lifecycle-deleted heads 404 the same
// way (DELETED filter; members alphabet has no 'deleted' today,
// but the generic trio path still walks it).
export async function deriveMemberParent(
    db: DbAdapter,
    id: Id,
): Promise<MemberEntity> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', MEMBERS_PREFIX),
        db.responses.getAllWhere('uri_collection', MEMBERS_PREFIX),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, MEMBERS_PREFIX,
    ).get(id);
    if (document === undefined) {
        throw new EntityNotFoundError('members', id);
    }
    const pairs = documentPairsAt(
        requests, responses, MEMBERS_PREFIX,
    ).filter((pair) => pair.uriId === id);
    const history = stateHistoryFrom(
        documentLifecycleEvents(pairs), id,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw new EntityNotFoundError('members', id);
    }
    const current = currentLifecycleEvent(history)!;
    return memberParentOf(document, current);
}

const IDENTITIES_PREFIX = canonicalUriCollection(
    undefined, '/identities/',
);

function seatedHumanOf(
    identityId: Id,
    at: string,
): MemberEntity {
    return {
        id: identityId,
        type: 'human',
        state: 'active',
        state_at: at,
        state_event_id: identityId,
    };
}

// Roster is seats ∩ person identities. Leftover /members/
// parent documents do not join. System is not a seat.
export async function deriveMembers(
    db: DbAdapter,
    organization: Id,
): Promise<MemberEntity[]> {
    const [seats, identityRequests, identityResponses] =
        await Promise.all([
            deriveOrganizationMemberSeats(db, organization),
            db.requests.getAllWhere(
                'uri_collection', IDENTITIES_PREFIX,
            ),
            db.responses.getAllWhere(
                'uri_collection', IDENTITIES_PREFIX,
            ),
        ]);
    const identities = deriveDocumentsAt(
        identityRequests, identityResponses,
        IDENTITIES_PREFIX,
    );
    const rows: MemberEntity[] = [];
    for (const seat of seats) {
        const identity = identities.get(seat.identity_id);
        if (identity === undefined) continue;
        if (pickString(identity.body, 'kind') !== 'person') {
            continue;
        }
        rows.push(seatedHumanOf(seat.identity_id, seat.at));
    }
    return rows.sort(byIdAscending);
}
