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

// The member directory's own reduction over the message ledger —
// Phase 8 Task 7, the roster's last derivation before the readers
// flip (Task 8). Two heads and a join, mirrored BY CONTENT from
// today's live closures: deriveMemberParents/deriveMemberParent
// read the FLAT '/members/' address (members is the FIRST
// global-plane family — family-registry.ts: organizationNested:
// false — so canonicalUriCollection ignores whatever organization
// argument a caller passes for this family); deriveMembers
// re-derives route('members')'s own hand-written GET closure
// (api/routes.ts): a membership names an org's roster by
// identity_id, and the system member rides along unconditionally
// — it authors events in every org but holds no membership row
// of its own.
//
// THE JOIN DIRECTION (Commandment IV — Logic): deriveMembers
// iterates deriveMemberParents and TESTS each member for a
// membership — never the reverse. An identity with a membership
// row but no members row (live-reachable via
// postIdentityCreationOp, the shipped Add Identity flow, which
// creates identity + pii with NO members row) is silently
// DROPPED here, exactly as the live closure drops it — never a
// non-null assertion on a parent that may not exist.
//
// Reads db.requests/db.responses (+ pickString over their decoded
// bodies) ONLY. route('members') and route('members/:id') derive
// through this; tests/drift-roster.test.ts pins parity with the
// retired old-plane closure.

const MEMBERS_PREFIX = canonicalUriCollection(undefined, '/members/');

function membershipsPrefixFor(organization: Id): string {
    return canonicalUriCollection(organization, '/memberships/');
}

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

// The JOIN view — route('members')'s own GET closure
// (api/routes.ts), re-derived from the ledger: the org-nested
// memberships heads name an org's roster by identity_id; every
// member-parent whose id lands in that set, PLUS every 'system'
// member unconditionally (a system member authors events in
// every org but holds no membership row), survives the filter.
// See the module header for the join-direction covenant this
// mirrors exactly — an orphaned membership (an identity with no
// members row) is silently absent from the result, never thrown.
export async function deriveMembers(
    db: DbAdapter,
    organization: Id,
): Promise<MemberEntity[]> {
    const membershipsPrefix = membershipsPrefixFor(organization);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', membershipsPrefix),
        db.responses.getAllWhere('uri_collection', membershipsPrefix),
    ]);
    const memberships = deriveDocumentsAt(
        requests, responses, membershipsPrefix,
    );
    const identityIds = new Set<Id>();
    for (const document of memberships.values()) {
        identityIds.add(pickString(document.body, 'identity_id'));
    }
    const parents = await deriveMemberParents(db);
    return parents.filter(
        (member) => identityIds.has(member.id)
            || member.type === 'system',
    );
}
