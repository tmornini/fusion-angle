import type { DbAdapter } from './db.ts';
import type {
    Id,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
} from './types.ts';
import { pickString, pickNumber } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The project<->objective-score nest's own reshaping of the
// generic message-plane reduction (derive-documents.ts) — the
// deriveFlowRecords structural mirror (api/derive-flow-
// records.ts), for TWO byte-twin nested collections that share
// one module because they are the SAME shape at two sibling
// addresses: /projects/{id}/objective-baseline-scores/ and
// /projects/{id}/objective-actual-scores/, written by a live
// standalone PUT at either leaf AND by the idea-conversion
// bundle's per-baseline synthesized pairs (routes.ts's
// route('ideas/:id/conversion', ...)). The GENERIC entity/
// collection handlers serve only a FAMILY-ROOTED prefix
// (research finding 10), never a project-nested one, so both
// leaves need this bespoke module, exactly as flow_records
// needed its own.
//
// Neither leaf carries a lifecycle, a DELETE, or a by-id GET
// route (only the bare collection GET is live at each address;
// the leaf is PUT-only) — so, like deriveObjectiveRevisions, this
// module exports the two collection derivations alone, no by-id
// sibling.
//
// H7: explicit id-lex sort — load-bearing, because the
// backend's row order is not a contract and no caller may
// inherit it. The archived-list raw-order surface and the
// org-page next-position computation are the named
// pre-existing H7-class surfaces; these two derivations
// join them.

function scoresUriPrefix(
    organization: Id,
    projectId: Id,
    segment: string,
): string {
    return canonicalUriCollection(
        organization, '/projects/' + projectId + '/' + segment + '/',
    );
}

// G6: GET derive is the stored PUT. Shared five-field
// shape (baseline and actual are byte-twins), id FIRST.
export function scoreEntityOf(document: DerivedDocument): {
    id: Id;
    project_id: Id;
    objective_id: Id;
    score: number;
    member_id: Id;
    at: string;
} {
    const body = withoutId(document.body);
    return {
        id: document.uriId,
        project_id: pickString(body, 'project_id'),
        objective_id: pickString(body, 'objective_id'),
        score: pickNumber(body, 'score'),
        member_id: pickString(body, 'member_id'),
        at: pickString(body, 'at'),
    };
}

async function fetchScoreDocuments(
    db: DbAdapter,
    organization: Id,
    projectId: Id,
    segment: string,
): Promise<Map<string, DerivedDocument>> {
    const prefix = scoresUriPrefix(organization, projectId, segment);
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    return deriveDocumentsAt(pairs, prefix);
}

// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's). Serves a future live
// GET projects/:id/objective-baseline-scores route: the SERVER
// already filters by the parent project through this
// derivation's own nested prefix, so the org fence and the
// parent scope are both closed by the address alone.
export async function deriveBaselineScores(
    db: DbAdapter,
    organization: Id,
    projectId: Id,
): Promise<ProjectObjectiveBaselineScoreEntity[]> {
    const documents = await fetchScoreDocuments(
        db, organization, projectId, 'objective-baseline-scores',
    );
    const rows: ProjectObjectiveBaselineScoreEntity[] = [];
    for (const document of documents.values()) {
        rows.push(scoreEntityOf(document));
    }
    return rows.sort(byIdAscending);
}

// The actuals byte-twin of deriveBaselineScores above — same
// prefix shape, same reduction, the sibling address.
export async function deriveActualScores(
    db: DbAdapter,
    organization: Id,
    projectId: Id,
): Promise<ProjectObjectiveActualScoreEntity[]> {
    const documents = await fetchScoreDocuments(
        db, organization, projectId, 'objective-actual-scores',
    );
    const rows: ProjectObjectiveActualScoreEntity[] = [];
    for (const document of documents.values()) {
        rows.push(scoreEntityOf(document));
    }
    return rows.sort(byIdAscending);
}
