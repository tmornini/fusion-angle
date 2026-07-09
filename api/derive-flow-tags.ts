import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, FlowTagEntity } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    type DerivedDocument,
} from './derive-documents.ts';

// Flow tags: the codebase's FIRST pair-plane-ONLY document
// family (Phase 14 Task 9) — no backing table, derived entirely
// from message pairs at /flows/:id/tags/:name. Structurally
// mirrors deriveFlowRecord (derive-flow-records.ts), re-nested
// one level deeper under a SPECIFIC tag name rather than a
// generated join id: the address's own uriId IS the tag's
// user-authored name (validateFlowTagName, api/validators.ts).
// No collection GET exists (no route, no derivation) — Step 0
// scoped this task to the single PUT/GET/DELETE leaf only
// (Unbidden Helper Code: no speculative tag-listing surface).

const FLOW_TAGS_TABLE = 'flow_tags';

function flowTagsUriPrefix(
    organization: Id,
    flowId: Id,
): string {
    return canonicalUriPrefix(
        organization, '/flows/' + flowId + '/tags/',
    );
}

function flowTagEntityOf(
    flowId: Id,
    document: DerivedDocument,
): FlowTagEntity {
    return {
        id: document.uriId,
        flow_id: flowId,
        flow_response_id: pickString(
            document.body, 'flow_response_id',
        ),
    };
}

// Serves the live GET flows/:id/tags/:name route: the head
// document body (the pinned response id) plus the tag's own
// name/flow_id; absent or a DELETE head throws
// EntityNotFoundError(FLOW_TAGS_TABLE, name) — deriveDocumentsAt's
// own DELETE-head exclusion already collapses both cases into
// "no document at this uriId", exactly like every sibling nested
// family (deriveFlowRecord, deriveIdentityPii).
export async function deriveFlowTag(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
    name: Id,
): Promise<FlowTagEntity> {
    const prefix = flowTagsUriPrefix(organization, flowId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, prefix,
    ).get(name);
    if (document === undefined) {
        throw new EntityNotFoundError(FLOW_TAGS_TABLE, name);
    }
    return flowTagEntityOf(flowId, document);
}
