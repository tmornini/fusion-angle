import type { DbAdapter } from './db.ts';
import { missedReadError } from './derive-states.ts';
import type {
    Id,
    IdeaEntity,
    IdeaSubmissionEntity,
    StateEntity,
} from './types.ts';
import {
    pickString, pickNumber,
    validateIdeaSubmissionEntity,
} from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    documentMessagePairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    byIdAscending,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentMessagePair,
} from './derive-documents.ts';
import { liveHeadId, messageStore } from
    './message-store.ts';

// Ideas' own reshaping of the generic message-plane reduction
// (derive-documents.ts): the async fetching (one prefix scan per
// derivation, per family document) plus the entity/lifecycle
// knowledge only this family has. Read-only and additive — no
// route, adapter, or seed row reads any of this yet (Task 5 wires
// the route); tests/drift-ideas.test.ts is the proof of equality
// against the old plane.

const IDEAS_TABLE = 'ideas';

function ideasUriPrefix(organization: Id): string {
    return canonicalPath(organization, '/ideas/');
}

function submissionsUriPrefix(
    organization: Id,
    ideaId: Id,
): string {
    return canonicalPath(
        organization, '/ideas/' + ideaId + '/submissions/',
    );
}

// The derived entity: the head document's body plus
// organization_id stamped from the derivation's OWN
// organization parameter — never the body's own value. A
// create body omits organization_id, and the prefix scanned
// here already IS that organization, so the stamp is
// unconditional.
export function ideaEntityOf(
    document: DerivedDocument,
    organization: Id,
): IdeaEntity {
    const body = document.body;
    return {
        id: document.name,
        organization_id: organization,
        title: pickString(body, 'title'),
        position: pickNumber(body, 'position'),
        problem_statement: pickString(body, 'problem_statement'),
        target_users: pickString(body, 'target_users'),
        proposed_solution: pickString(body, 'proposed_solution'),
        expected_outcome: pickString(body, 'expected_outcome'),
        success_metrics: pickString(body, 'success_metrics'),
        state: pickString(body, 'state'),
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

async function fetchIdeaMessagePairs(
    db: DbAdapter,
    prefix: string,
): Promise<{
    readonly documents: Map<string, DerivedDocument>;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    return {
        documents: deriveDocumentsAt(messagePairs, prefix),
        messagePairs: documentMessagePairsAt(
            messagePairs, prefix,
        ),
    };
}

async function fetchIdeaDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    ideaId: Id,
): Promise<{
    readonly document: DerivedDocument | undefined;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, ideaId,
    );
    return {
        document: deriveDocumentsAt(history, prefix).get(ideaId),
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}

// Oldest live head (at, id) first via getCollection,
// deleted-filtered — the head lifecycle state 'deleted'
// excludes an idea exactly as EntityStore's states-log
// tombstone filter does today (archived ideas are NOT
// filtered here; ideaIsVisible does that downstream,
// untouched).
export async function deriveIdeas(
    db: DbAdapter,
    organization: Id,
): Promise<IdeaEntity[]> {
    const prefix = ideasUriPrefix(organization);
    const { documents, messagePairs } =
        await fetchIdeaMessagePairs(db, prefix);
    const messagePairsByIdeaId =
        new Map<Id, DocumentMessagePair[]>();
    for (const messagePair of messagePairs) {
        const list = messagePairsByIdeaId.get(
            messagePair.name,
        );
        if (list === undefined) {
            messagePairsByIdeaId.set(
                messagePair.name, [messagePair],
            );
        } else {
            list.push(messagePair);
        }
    }
    const byId = new Map<Id, IdeaEntity>();
    for (const [ideaId, document] of documents) {
        const history = stateHistoryFrom(
            documentLifecycleEvents(
                messagePairsByIdeaId.get(ideaId) ?? [],
            ),
            ideaId,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            continue;
        }
        byId.set(
            ideaId,
            ideaEntityOf(document, organization),
        );
    }
    const live = await messageStore(db).getCollection(prefix);
    const ideas: IdeaEntity[] = [];
    for (const entity of live) {
        const row = byId.get(liveHeadId(entity));
        if (row !== undefined) ideas.push(row);
    }
    return ideas;
}

export async function deriveIdea(
    db: DbAdapter,
    organization: Id,
    ideaId: Id,
): Promise<IdeaEntity> {
    const prefix = ideasUriPrefix(organization);
    const { document, messagePairs } =
        await fetchIdeaDocumentMessagePairs(db, prefix, ideaId);
    if (document === undefined) {
        throw await missedReadError(
            db, ideaId, organization, IDEAS_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        ideaId,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw await missedReadError(
            db, ideaId, organization, IDEAS_TABLE,
        );
    }
    return ideaEntityOf(document, organization);
}

// G6: GET derive is the stored PUT. id-first via
// validateIdeaSubmissionEntity (withoutId first).
export function ideaSubmissionEntityOf(
    document: DerivedDocument,
): IdeaSubmissionEntity {
    return {
        id: document.name,
        ...validateIdeaSubmissionEntity(
            withoutId(document.body),
        ),
    };
}

export async function deriveIdeaSubmissions(
    db: DbAdapter,
    organization: Id,
    ideaId: Id,
): Promise<IdeaSubmissionEntity[]> {
    const prefix = submissionsUriPrefix(organization, ideaId);
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    const documents = deriveDocumentsAt(
        messagePairs, prefix,
    );
    const submissions: IdeaSubmissionEntity[] = [];
    for (const document of documents.values()) {
        submissions.push(ideaSubmissionEntityOf(document));
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
    const { messagePairs } =
        await fetchIdeaDocumentMessagePairs(db, prefix, ideaId);
    return stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        ideaId,
    );
}
