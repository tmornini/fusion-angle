import type { Id, ObjectiveRevisionEntity } from '../shared/types.ts';
import { validateObjectiveRevisionEntity } from
    './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import { type DerivedDocument } from './derive-documents.ts';

// Objective revisions nest at this prefix. GET
// objectives/:id/revisions/ serves the stored heads
// through selectHeadsAtPath (api/head-reads.ts).
// routes.ts calls the prefix and entity-of helpers for
// the writes. A revision carries no lifecycle of its
// own: no DELETE, and no by-id GET (the leaf is PUT-only).
// documentMessagePairsAt matches path by EQUALITY, so a
// revision pair at .../objectives/{id}/revisions/ can
// never leak into the objectives collection, or vice
// versa (research finding 10: param() throws on '').

export function objectiveRevisionsUriPrefix(
    organization: Id,
    objectiveId: Id,
): string {
    return canonicalPath(
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
        id: document.name,
        ...validateObjectiveRevisionEntity(
            withoutId(document.body),
        ),
    };
}
