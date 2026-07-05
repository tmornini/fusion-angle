import type { DbAdapter } from './db.ts';
import type { Id, StateEntity } from './types.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
} from './derive-documents.ts';

// Records' own state-history reduction — deriveIdeaStateHistory's
// (api/derive-ideas.ts) structural mirror by content. Every trio
// family ships its OWN history module built on the shared
// stateHistoryFrom primitive plus a family prefix-scan (deriveIdea
// StateHistory / deriveProjectStateHistory / deriveFlowState
// History are the other three); records is the first whose trio
// walk must also tolerate a DELETE-method pair at its own :id
// address (Author gate 9 — documentLifecycleEvents already skips
// it; see that function's own header). Read-only and additive —
// no route reads this yet (Task 7 wires it);
// tests/drift-records.test.ts's case 9 proves equality against
// the old plane's states.getAllFor.

function recordsUriPrefix(organization: Id): string {
    return canonicalUriPrefix(organization, '/records/');
}

// One row per pair whose state_event_id is NEW — the document
// sequence IS the history, (state_at, id) ascending. Returns
// every event regardless of current lifecycle state (deletion is
// just another transition here) — the deleted-filter lives in
// the entity/collection reads alone (the generic document-family
// machinery), mirroring how the real states table's getAllFor
// never filters either.
export async function deriveRecordStateHistory(
    db: DbAdapter,
    organization: Id,
    recordId: Id,
): Promise<StateEntity[]> {
    const prefix = recordsUriPrefix(organization);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const pairs = documentPairsAt(requests, responses, prefix)
        .filter((pair) => pair.uriId === recordId);
    return stateHistoryFrom(
        documentLifecycleEvents(pairs), recordId,
    );
}
