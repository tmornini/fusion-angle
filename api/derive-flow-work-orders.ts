import type { DbAdapter } from './db.ts';
import type { Id, FlowWorkOrderEntity } from './types.ts';
import { validateFlowWorkOrderEntity } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import { withoutId } from './document-family.ts';
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
    return canonicalUriCollection(
        organization, '/flows/' + flowId + '/work-orders/',
    );
}

// G6: GET derive is the stored PUT. id-first via
// validateFlowWorkOrderEntity (withoutId first). A join
// row carries no organization_id of its own.
export function flowWorkOrderEntityOf(
    document: DerivedDocument,
): FlowWorkOrderEntity {
    return {
        id: document.uriId,
        ...validateFlowWorkOrderEntity(
            withoutId(document.body),
        ),
    };
}

// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/work-orders route (Phase 5 Task 7).
export async function deriveFlowWorkOrders(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
): Promise<FlowWorkOrderEntity[]> {
    const prefix = flowWorkOrdersUriPrefix(organization, flowId);
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    const documents = deriveDocumentsAt(pairs, prefix);
    const rows: FlowWorkOrderEntity[] = [];
    for (const document of documents.values()) {
        rows.push(flowWorkOrderEntityOf(document));
    }
    return rows.sort(byIdAscending);
}
