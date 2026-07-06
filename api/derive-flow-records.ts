import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, FlowRecordEntity } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The flow<->record join's own reshaping of the generic
// message-plane reduction (derive-documents.ts) — the
// deriveFlowWorkOrders structural mirror (api/derive-flow-work-
// orders.ts), re-nested one level deeper: one prefix scan per
// flow, at the join address the live PUT/DELETE flows/:id/
// records/:frid route (and the seed's own postFlowRecordDocument
// Op invocation, Phase 6 Task 5) both write. A join row carries
// no lifecycle trio of its own — a DELETE tombstones it outright
// (deriveDocumentsAt's own DELETE-head exclusion mirrors the old
// plane's physical splice; parity, not a new mechanism). Unlike
// deriveFlowWorkOrders, this join's own :frid address carries a
// LIVE GET route (flows/:id/records/:frid), so a by-id read
// (deriveFlowRecord) is needed alongside the collection read —
// deriveIdea/deriveFlow's own absent/DELETE-head -> Entity
// NotFoundError shape, applied to a join rather than a document
// family. LIVE: GET flows/:id/records and GET flows/:id/
// records/:frid are wired to deriveFlowRecords/deriveFlowRecord
// below (Phase 6 Task 7); tests/drift-records.test.ts proves
// equality against flow_records.getAllWhere('flow_id', ...) and
// flow_records.getById(...).

const FLOW_RECORDS_TABLE = 'flow_records';

function flowRecordsUriPrefix(
    organization: Id,
    flowId: Id,
): string {
    return canonicalUriPrefix(
        organization, '/flows/' + flowId + '/records/',
    );
}

// The derived entity: the head document's body's own three
// fields plus `id` from the uriId — a join row carries no
// organization_id of its own (flow_records is parent-scoped off
// the flow, never org-stamped directly), so unlike
// recordDocumentEntityOf there is nothing to stamp from the
// derivation's own organization parameter here.
function flowRecordEntityOf(
    document: DerivedDocument,
): FlowRecordEntity {
    const body = document.body;
    return {
        id: document.uriId,
        flow_id: pickString(body, 'flow_id'),
        record_id: pickString(body, 'record_id'),
        at: pickString(body, 'at'),
    };
}

async function fetchFlowRecordDocuments(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
): Promise<Map<string, DerivedDocument>> {
    const prefix = flowRecordsUriPrefix(organization, flowId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    return deriveDocumentsAt(requests, responses, prefix);
}

// id-lex ordered (the IndexedDB reference); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/records route (Phase 6 Task 7).
export async function deriveFlowRecords(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
): Promise<FlowRecordEntity[]> {
    const documents = await fetchFlowRecordDocuments(
        db, organization, flowId,
    );
    const rows: FlowRecordEntity[] = [];
    for (const document of documents.values()) {
        rows.push(flowRecordEntityOf(document));
    }
    return rows.sort(byIdAscending);
}

// Serves the live GET flows/:id/records/:frid route (Phase 6
// Task 7): the head document body + id; absent (never written
// under this flow/organization) or a DELETE head throws
// EntityNotFoundError('flow_records', id) — deriveDocumentsAt's
// own DELETE-head exclusion already collapses both cases into
// "no document at this uriId".
export async function deriveFlowRecord(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
    joinId: Id,
): Promise<FlowRecordEntity> {
    const documents = await fetchFlowRecordDocuments(
        db, organization, flowId,
    );
    const document = documents.get(joinId);
    if (document === undefined) {
        throw new EntityNotFoundError(
            FLOW_RECORDS_TABLE, joinId,
        );
    }
    return flowRecordEntityOf(document);
}
