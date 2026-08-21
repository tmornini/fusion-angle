import type { DbAdapter } from './db.ts';
import type { Id, StateEntity } from './types.ts';
import { canonicalUriCollection } from './message-pair.ts';
import {
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
} from './derive-documents.ts';

// Objectives' own reshaping of the generic message-plane
// reduction (derive-documents.ts): the fifth trio family
// (states-address retirement). One prefix scan per
// derivation; the trio walk, its (state_at, id) ordering,
// and echo dedup are the shared derive-documents.ts cores —
// never rebuilt here (the derive-ideas.ts shape).

function objectivesUriPrefix(organization: Id): string {
    return canonicalUriCollection(organization, '/objectives/');
}

// One row per pair whose state_event_id is NEW — the document
// sequence IS the history, (state_at, id) ascending. Returns
// every event regardless of current lifecycle state; there is
// no objectives DELETE route, so the DELETED filter upstream
// never fires for this family.
export async function deriveObjectiveStateHistory(
    db: DbAdapter,
    organization: Id,
    objectiveId: Id,
): Promise<StateEntity[]> {
    const prefix = objectivesUriPrefix(organization);
    const stored = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    const pairs = documentPairsAt(
        stored, prefix,
    ).filter((pair) => pair.uriId === objectiveId);
    return stateHistoryFrom(
        documentLifecycleEvents(pairs), objectiveId,
    );
}
