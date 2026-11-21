import type { Id, ProjectFlowEntity } from '../shared/types.ts';
import { validateProjectFlowEntity } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import { type DerivedDocument } from './derive-documents.ts';

// The project<->flow join document the live route and the
// Phase 4 Task 5 create/seed writes both share — verified by
// content against a stored :pfid pair (tests/api-flow-
// document.test.ts's joinPrefix): /organizations/{org}/
// projects/{projectId}/flows/. A join row carries no lifecycle
// of its own. GET projects/:id/flows/ serves the stored heads
// (spec §1 B).

export function projectFlowsUriPrefix(
    organization: Id,
    projectId: Id,
): string {
    return canonicalPath(
        organization, '/projects/' + projectId + '/flows/',
    );
}

// G6: GET derive is the stored PUT. id-first via
// validateProjectFlowEntity (withoutId first). A join
// row carries no organization_id of its own.
export function projectFlowEntityOf(
    document: DerivedDocument,
): ProjectFlowEntity {
    return {
        id: document.name,
        ...validateProjectFlowEntity(withoutId(document.body)),
    };
}
