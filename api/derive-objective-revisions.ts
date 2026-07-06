import type { DbAdapter } from './db.ts';
import type { Id, ObjectiveRevisionEntity } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The objective<->revision nest's own reshaping of the generic
// message-plane reduction (derive-documents.ts) — the
// deriveFlowRecords structural mirror (api/derive-flow-
// records.ts): one prefix scan per parent objective, at the
// nested address a live genesis create (POST /objectives, the
// synthesized revision pair) and a live PUT objectives/:id/
// revisions/:rid (a fresh revision) both write. The GENERIC
// entity/collection handlers (documentGetHandler/document
// CollectionGetHandler, api/document-family.ts) serve only the
// FAMILY-ROOTED objectives/ prefix — OBJECTIVES_WIRING IS that
// derivation — so this nested sub-resource needs its own bespoke
// module, exactly as flow_records did (research finding 10:
// param() throws on '', and documentPairsAt matches uri_prefix
// by EQUALITY, so a revision pair at .../objectives/{id}/
// revisions/ can never leak into the objectives-collection
// derivation, or vice versa).
//
// Revisions carry NO lifecycle of their own — there is no
// revision-level trio, no DELETE at this address, and no by-id
// GET route (only objectives/:id/revisions is live; :rid is
// PUT-only) — so this module exports the collection derivation
// alone, unlike deriveFlowRecords' by-id sibling (deriveFlow
// Record), which exists only because flows/:id/records/:frid
// carries a live GET the revisions address never gained.
//
// H7: id-lex explicit sort (IndexedDB-invisible, memory-tier
// load-bearing — the archived-list raw-order surface and the
// org-page next-position computation are the named pre-existing
// H7-class surfaces; this derivation joins them). The states/:id
// escape hatch (objectives edition, Author gate 3's watch-point)
// is UNRELATED to this module — it concerns the PARENT
// objective's own lifecycle, never its revisions, which carry no
// lifecycle concept at all.

function objectiveRevisionsUriPrefix(
    organization: Id,
    objectiveId: Id,
): string {
    return canonicalUriPrefix(
        organization,
        '/objectives/' + objectiveId + '/revisions/',
    );
}

// The derived entity: the head document's body's own five fields
// plus `id` from the uriId, id FIRST — the seven-sibling
// entityOf convention (deriveFlowRecords' own comment), picked
// explicitly (pickString) rather than a body spread: a leaked
// operation-pair body reaching this construction would throw
// loudly (the method-filter's defense-in-depth) rather than
// silently mis-derive.
function objectiveRevisionEntityOf(
    document: DerivedDocument,
): ObjectiveRevisionEntity {
    const body = document.body;
    return {
        id: document.uriId,
        objective_id: pickString(body, 'objective_id'),
        name: pickString(body, 'name'),
        description: pickString(body, 'description'),
        member_id: pickString(body, 'member_id'),
        at: pickString(body, 'at'),
    };
}

// id-lex ordered (the IndexedDB reference). Serves the live GET
// objectives/:id/revisions route (a future task's flip): the
// SERVER already filters by the parent objective through this
// derivation's own nested prefix, so the org fence and the
// parent scope are both closed by the address alone — no
// foreign-parent row can ever surface (a foreign organization or
// a foreign objective id yields a distinct, empty prefix, never
// a filtered-out row).
export async function deriveObjectiveRevisions(
    db: DbAdapter,
    organization: Id,
    objectiveId: Id,
): Promise<ObjectiveRevisionEntity[]> {
    const prefix = objectiveRevisionsUriPrefix(
        organization, objectiveId,
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const documents = deriveDocumentsAt(
        requests, responses, prefix,
    );
    const rows: ObjectiveRevisionEntity[] = [];
    for (const document of documents.values()) {
        rows.push(objectiveRevisionEntityOf(document));
    }
    return rows.sort(byIdAscending);
}
