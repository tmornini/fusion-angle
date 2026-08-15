import type { DbAdapter } from './db.ts';
import type { Id, ProjectFlowEntity } from './types.ts';
import { validateProjectFlowEntity } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The project<->flow join's own reshaping of the generic
// message-plane reduction (derive-documents.ts): one prefix
// scan per project, at the join address the live route and the
// Phase 4 Task 5 create/seed writes both share — verified by
// content against a stored :pfid pair (tests/api-flow-
// document.test.ts's joinPrefix): /organizations/{org}/
// projects/{projectId}/flows/. A join row carries no lifecycle
// trio of its own — a DELETE tombstones it outright
// (deriveDocumentsAt's own DELETE-head exclusion mirrors the
// old plane's physical splice; parity, not a new mechanism).
// Read-only and additive — no route reads this yet (Task 8
// wires it); tests/drift-flows.test.ts proves equality against
// project_flows.getAllWhere('project_id', ...).

function projectFlowsUriPrefix(
    organization: Id,
    projectId: Id,
): string {
    return canonicalUriCollection(
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
        id: document.uriId,
        ...validateProjectFlowEntity(withoutId(document.body)),
    };
}

// id-lex ordered (the IndexedDB reference); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). NOT routed yet (Task 8).
export async function deriveProjectFlows(
    db: DbAdapter,
    organization: Id,
    projectId: Id,
): Promise<ProjectFlowEntity[]> {
    const prefix = projectFlowsUriPrefix(organization, projectId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', prefix),
        db.responses.getAllWhere('uri_collection', prefix),
    ]);
    const documents = deriveDocumentsAt(
        requests, responses, prefix,
    );
    const rows: ProjectFlowEntity[] = [];
    for (const document of documents.values()) {
        rows.push(projectFlowEntityOf(document));
    }
    return rows.sort(byIdAscending);
}
