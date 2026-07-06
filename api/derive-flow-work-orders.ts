import type { DbAdapter } from './db.ts';
import type { Id, FlowWorkOrderEntity } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The flow<->work-order join's own reshaping of the generic
// message-plane reduction (derive-documents.ts) — the
// deriveProjectFlows structural mirror (api/derive-project-
// flows.ts), re-nested one level deeper: one prefix scan per
// flow, at the join address the live PUT flows/:id/work-
// orders/:woid route, Phase 5 Task 3's create, and Phase 5 Task
// 4's seed all write — verified by content against a stored
// :woid pair (tests/api-shadow-ledger-work-orders.test.ts's own
// '/organizations/1/flows/flow-1/work-orders/' + 'fwo-join'
// address). A join row carries no lifecycle trio of its own — a
// DELETE tombstones it outright (deriveDocumentsAt's own
// DELETE-head exclusion mirrors the old plane's physical
// splice; parity, not a new mechanism — no DELETE route exists
// for this join today, so the exclusion is defense-in-depth,
// the deriveProjectFlows mechanics verbatim). LIVE: GET
// flows/:id/work-orders is wired to deriveFlowWorkOrders below
// (Phase 5 Task 7); tests/drift-work-orders.test.ts proves
// equality against flow_work_orders.getAllWhere('flow_id', ...).

function flowWorkOrdersUriPrefix(
    organization: Id,
    flowId: Id,
): string {
    return canonicalUriPrefix(
        organization, '/flows/' + flowId + '/work-orders/',
    );
}

// The derived entity: the head document's body's own three
// fields plus `id` from the uriId — a join row carries no
// organization_id of its own (flow_work_orders is parent-scoped
// off the flow, never org-stamped directly), so unlike
// workOrderDocumentEntityOf there is nothing to stamp from the
// derivation's own organization parameter here.
function flowWorkOrderEntityOf(
    document: DerivedDocument,
): FlowWorkOrderEntity {
    const body = document.body;
    return {
        id: document.uriId,
        flow_id: pickString(body, 'flow_id'),
        work_order_id: pickString(body, 'work_order_id'),
        at: pickString(body, 'at'),
    };
}

// id-lex ordered (the IndexedDB reference); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/work-orders route (Phase 5 Task 7).
export async function deriveFlowWorkOrders(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
): Promise<FlowWorkOrderEntity[]> {
    const prefix = flowWorkOrdersUriPrefix(organization, flowId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const documents = deriveDocumentsAt(
        requests, responses, prefix,
    );
    const rows: FlowWorkOrderEntity[] = [];
    for (const document of documents.values()) {
        rows.push(flowWorkOrderEntityOf(document));
    }
    return rows.sort(byIdAscending);
}
