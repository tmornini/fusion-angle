import type { DbAdapter } from './db.ts';
import { missedReadError } from './derive-states.ts';
import type {
    Id,
    IdeaEntity,
    IdeaSubmissionEntity,
    StateEntity,
} from './types.ts';
import { pickString, pickNumber } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    byIdAscending,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentPair,
} from './derive-documents.ts';

// Ideas' own reshaping of the generic message-plane reduction
// (derive-documents.ts): the async fetching (one prefix scan per
// derivation, per family address) plus the entity/lifecycle
// knowledge only this family has. Read-only and additive — no
// route, adapter, or seed row reads any of this yet (Task 5 wires
// the route); tests/drift-ideas.test.ts is the proof of equality
// against the old plane.

const IDEAS_TABLE = 'ideas';

function ideasUriPrefix(organization: Id): string {
    return canonicalUriPrefix(organization, '/ideas/');
}

function submissionsUriPrefix(
    organization: Id,
    ideaId: Id,
): string {
    return canonicalUriPrefix(
        organization, '/ideas/' + ideaId + '/submissions/',
    );
}

// The derived entity: the head document's body minus the
// lifecycle trio (state/state_at/state_event_id, simply never
// copied across) plus organization_id stamped from the
// derivation's OWN organization parameter — never the body's own
// value. A create body omits organization_id; the org-scoped
// store stamps it on the old plane, and the prefix scanned here
// already IS that same org, so the stamp is unconditional.
export function ideaEntityOf(
    document: DerivedDocument,
    organization: Id,
): IdeaEntity {
    const body = document.body;
    return {
        id: document.uriId,
        organization_id: organization,
        title: pickString(body, 'title'),
        position: pickNumber(body, 'position'),
        problem_statement: pickString(body, 'problem_statement'),
        target_users: pickString(body, 'target_users'),
        proposed_solution: pickString(body, 'proposed_solution'),
        expected_outcome: pickString(body, 'expected_outcome'),
        success_metrics: pickString(body, 'success_metrics'),
    };
}

// The lifecycle trio walk, its (state_at, id) history ordering,
// and the current-state reduction are byte-identical across
// every document family — shared in derive-documents.ts
// (documentLifecycleEvents/stateHistoryFrom/currentDocumentState)
// rather than duplicated here. Deliberately separate from
// DerivedDocument — the entity's OTHER fields follow arrival
// order (whichever PUT landed last), but which lifecycle event
// is CURRENT follows the trio's own (state_at, state_event_id),
// never arrival order and never the envelope's `at`
// (postIdeaDocumentOp's genesis-wins-under-skew guarantee).

async function fetchIdeaPairs(
    db: DbAdapter,
    prefix: string,
): Promise<{
    readonly documents: Map<string, DerivedDocument>;
    readonly pairs: readonly DocumentPair[];
}> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    return {
        documents: deriveDocumentsAt(requests, responses, prefix),
        pairs: documentPairsAt(requests, responses, prefix),
    };
}

// id-lex ordered (the IndexedDB reference), deleted-filtered —
// the head lifecycle state 'deleted' excludes an idea exactly as
// EntityStore's states-log tombstone filter does today (archived
// ideas are NOT filtered here; ideaIsVisible does that downstream,
// untouched).
export async function deriveIdeas(
    db: DbAdapter,
    organization: Id,
): Promise<IdeaEntity[]> {
    const prefix = ideasUriPrefix(organization);
    const { documents, pairs } = await fetchIdeaPairs(db, prefix);
    const pairsByIdeaId = new Map<Id, DocumentPair[]>();
    for (const pair of pairs) {
        const list = pairsByIdeaId.get(pair.uriId);
        if (list === undefined) {
            pairsByIdeaId.set(pair.uriId, [pair]);
        } else {
            list.push(pair);
        }
    }
    const ideas: IdeaEntity[] = [];
    for (const [ideaId, document] of documents) {
        const history = stateHistoryFrom(
            documentLifecycleEvents(
                pairsByIdeaId.get(ideaId) ?? [],
            ),
            ideaId,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            continue;
        }
        ideas.push(ideaEntityOf(document, organization));
    }
    return ideas.sort(byIdAscending);
}

export async function deriveIdea(
    db: DbAdapter,
    organization: Id,
    ideaId: Id,
): Promise<IdeaEntity> {
    const prefix = ideasUriPrefix(organization);
    const { documents, pairs } = await fetchIdeaPairs(db, prefix);
    const document = documents.get(ideaId);
    if (document === undefined) {
        throw await missedReadError(
            db, ideaId, organization, IDEAS_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(
            pairs.filter((pair) => pair.uriId === ideaId),
        ),
        ideaId,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw await missedReadError(
            db, ideaId, organization, IDEAS_TABLE,
        );
    }
    return ideaEntityOf(document, organization);
}

export async function deriveIdeaSubmissions(
    db: DbAdapter,
    organization: Id,
    ideaId: Id,
): Promise<IdeaSubmissionEntity[]> {
    const prefix = submissionsUriPrefix(organization, ideaId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const documents = deriveDocumentsAt(requests, responses, prefix);
    const submissions: IdeaSubmissionEntity[] = [];
    for (const [submissionId, document] of documents) {
        submissions.push({
            id: submissionId,
            idea_id: pickString(document.body, 'idea_id'),
            member_id: pickString(document.body, 'member_id'),
            at: pickString(document.body, 'at'),
        });
    }
    return submissions.sort(byIdAscending);
}

// One row per pair whose state_event_id is NEW — the document
// sequence IS the history, (state_at, id) ascending. Returns every
// event regardless of current lifecycle state (deletion is just
// another transition here) — the deleted-filter lives in
// deriveIdeas/deriveIdea alone, mirroring how the real states
// table's getAllFor never filters either.
export async function deriveIdeaStateHistory(
    db: DbAdapter,
    organization: Id,
    ideaId: Id,
): Promise<StateEntity[]> {
    const prefix = ideasUriPrefix(organization);
    const { pairs } = await fetchIdeaPairs(db, prefix);
    return stateHistoryFrom(
        documentLifecycleEvents(
            pairs.filter((pair) => pair.uriId === ideaId),
        ),
        ideaId,
    );
}
