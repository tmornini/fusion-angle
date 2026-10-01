import type { DbAdapter } from './db.ts';
import type {
    Id,
    IdeaEntity,
    IdeaSubmissionEntity,
} from '../shared/types.ts';
import {
    pickString, pickNumber,
    validateIdeaSubmissionEntity,
} from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// Ideas' own reshaping of the generic message-plane reduction
// (derive-documents.ts) for idea submissions — a bespoke
// derivation, not a DocumentFamilyWiring family (a nested
// document carries no lifecycle state of its own). GET
// ideas/:id/submissions/ serves the stored heads at this
// prefix (spec §1 B).

export function submissionsUriPrefix(
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
