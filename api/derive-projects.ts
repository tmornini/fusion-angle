import type { Id, ProjectEntity } from './types.ts';
import { pickString, pickNumber } from './validators.ts';
import type { DerivedDocument } from './derive-documents.ts';

// Projects' own reshaping of the generic message-plane
// reduction (derive-documents.ts): the entity shape only this
// family has. The collection/entity reads and the lifecycle-
// trio walk retired with Task 11; Task 6 wired the route atop
// the generic document-family handlers instead.

// The derived entity: the head document's body plus
// organization_id stamped from the derivation's OWN
// organization parameter — never the body's own value. A
// create body omits organization_id, and the prefix scanned
// here already IS that organization, so the stamp is
// unconditional.
export function projectEntityOf(
    document: DerivedDocument,
    organization: Id,
): ProjectEntity {
    const body = document.body;
    return {
        id: document.name,
        organization_id: organization,
        title: pickString(body, 'title'),
        description: pickString(body, 'description'),
        progress: pickNumber(body, 'progress'),
        start_date: pickString(body, 'start_date'),
        target_end_date:
            pickString(body, 'target_end_date'),
        estimated_cost: pickNumber(body, 'estimated_cost'),
        actual_cost: pickNumber(body, 'actual_cost'),
        position: pickNumber(body, 'position'),
        state: pickString(body, 'state'),
    };
}
