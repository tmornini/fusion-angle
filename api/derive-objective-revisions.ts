import type { DbAdapter } from './db.ts';
import type { Id, ObjectiveRevisionEntity } from './types.ts';
import { validateObjectiveRevisionEntity } from
    './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import { withoutId } from './document-family.ts';
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
// param() throws on '', and documentPairsAt matches uri_collection
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
    return canonicalUriCollection(
        organization,
        '/objectives/' + objectiveId + '/revisions/',
    );
}

// G6: GET derive is the stored PUT. id-first via
// validateObjectiveRevisionEntity (withoutId first).
export function objectiveRevisionEntityOf(
    document: DerivedDocument,
): ObjectiveRevisionEntity {
    return {
        id: document.uriId,
        ...validateObjectiveRevisionEntity(
            withoutId(document.body),
        ),
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
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    const documents = deriveDocumentsAt(pairs, prefix);
    const rows: ObjectiveRevisionEntity[] = [];
    for (const document of documents.values()) {
        rows.push(objectiveRevisionEntityOf(document));
    }
    return rows.sort(byIdAscending);
}
