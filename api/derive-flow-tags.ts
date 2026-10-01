import type { DbAdapter } from './db.ts';
import type { Id, FlowTagEntity } from '../shared/types.ts';
import { validateFlowTagEntity } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    type DerivedDocument,
} from './derive-documents.ts';
import { missedReadError } from './derive-states.ts';

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

const FLOW_TAGS_TABLE = 'flow_tags';

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

// The head document body (the pinned response id) plus the
// tag's own name/flow_id; absent or a DELETE head throws
// EntityNotFoundError(FLOW_TAGS_TABLE, name) — deriveDocumentsAt's
// own DELETE-head exclusion already collapses both cases into
// "no document at this name", exactly like every sibling nested
// family (deriveFlowRecord, deriveIdentityPii).
export async function deriveFlowTag(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
    name: Id,
): Promise<FlowTagEntity> {
    const prefix = flowTagsUriPrefix(organization, flowId);
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    const document = deriveDocumentsAt(
        messagePairs, prefix,
    ).get(name);
    if (document === undefined) {
        // Probe the parent flow: a foreign flow's tag 403s;
        // a genuine miss on an own/absent flow stays 404.
        throw await missedReadError(
            db, name, organization, FLOW_TAGS_TABLE, flowId,
        );
    }
    // The stored response is the tag's wire; the path owns
    // its flow_id.
    const { flow_id: _flow, ...body } = document.body;
    return flowTagEntityOf(flowId, { ...document, body });
}
