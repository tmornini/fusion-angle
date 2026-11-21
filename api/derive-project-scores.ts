import type { Id } from '../shared/types.ts';
import { pickString, pickNumber } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import { type DerivedDocument } from './derive-documents.ts';

// Baseline and actual scores are the same five-field
// shape at two sibling documents:
// /projects/{id}/objective-baseline-scores/ and
// /projects/{id}/objective-actual-scores/. A live
// standalone PUT writes either leaf, and the
// idea-conversion bundle writes the per-baseline pairs
// (routes.ts's route('ideas/:id/conversion', ...)).
// Both collection GETs serve the stored heads through
// selectHeadsAtPath (api/head-reads.ts). routes.ts
// calls the prefix and entity-of helpers for the writes.
// Neither leaf carries a lifecycle, a DELETE, or a
// by-id GET (the leaf is PUT-only).

export function scoresUriPrefix(
    organization: Id,
    projectId: Id,
    segment: string,
): string {
    return canonicalPath(
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
        id: document.name,
        project_id: pickString(body, 'project_id'),
        objective_id: pickString(body, 'objective_id'),
        score: pickNumber(body, 'score'),
        member_id: pickString(body, 'member_id'),
        at: pickString(body, 'at'),
    };
}
