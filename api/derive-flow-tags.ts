import type { Id, FlowTagEntity } from '../shared/types.ts';
import { validateFlowTagEntity } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import { type DerivedDocument } from './derive-documents.ts';

// Flow tags: the codebase's FIRST message-plane-ONLY document
// family (Phase 14 Task 9) — no backing table, derived entirely
// from message pairs at /flows/:id/tags/:name. Structurally
// mirrors deriveFlowRecord (derive-flow-records.ts), re-nested
// one level deeper under a SPECIFIC tag name rather than a
// generated join id: the document's own name IS the tag's
// user-authored name (validateFlowTagName, api/validators.ts).
// No collection GET exists (no route, no derivation) — Step 0
// scoped this task to the single PUT/GET/DELETE leaf only
// (Unbidden Helper Code: no speculative tag-listing surface).
// GET flows/:id/tags/:name serves the stored head.

export function flowTagsUriPrefix(
    organization: Id,
    flowId: Id,
): string {
    return canonicalPath(
        organization, '/flows/' + flowId + '/tags/',
    );
}

// G6: GET derive is the stored PUT. id-first; flow_id
// from the document (never a client body key).
export function flowTagEntityOf(
    flowId: Id,
    document: DerivedDocument,
): FlowTagEntity {
    return {
        id: document.name,
        flow_id: flowId,
        ...validateFlowTagEntity(withoutId(document.body)),
    };
}
