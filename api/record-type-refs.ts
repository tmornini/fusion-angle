import type { DbAdapter } from './db.ts';
import {
    deriveDocumentsAt,
} from './derive-documents.ts';
import { deriveFlows } from './derive-flows.ts';
import { deriveFlowRecords } from './derive-flow-records.ts';

// Destroying a record type must not orphan its covenants:
// live instances under the type (Task 15) and live
// flows/:id/records joins that name the type. Cascading
// would rewrite history the ledger promised to keep — so
// destruction is RESTRICTED: a referenced type refuses to
// die (409) until its referrers are gone. This module counts
// the referrers inside the SAME transaction that would
// delete, so no writer can slip a new reference between the
// check and the tombstone. The instances leg is empty until
// Task 15; the predicate is real from birth.

export interface RecordTypeReferrers {
    readonly instanceIds: readonly string[];
    readonly flowIds: readonly string[];
}

function instancesUriPrefix(
    organization: string,
    recordTypeId: string,
): string {
    return '/organizations/' + organization
        + '/record-types/' + recordTypeId
        + '/instances/';
}

// Referrers for one record type. `view` is the open
// transaction view; every await is a row op on that view
// (AGENTS.md § Transaction bodies await only row ops —
// same posture as collectAttributeReferrers).
export async function collectRecordTypeReferrers(
    view: DbAdapter,
    organization: string,
    recordTypeId: string,
): Promise<RecordTypeReferrers> {
    const instancesPrefix = instancesUriPrefix(
        organization, recordTypeId,
    );
    const instancePairs = await view.pairs.getAllWhere(
        'uri_collection', instancesPrefix,
    );
    const instanceHeads = deriveDocumentsAt(
        instancePairs, instancesPrefix,
    );
    const instanceIds = [...instanceHeads.keys()].sort();

    // Live flows of the org, then per-flow join heads naming
    // this type. deriveFlows filters lifecycle-deleted flows;
    // deriveFlowRecords excludes DELETE-tombstoned joins.
    const flows = await deriveFlows(view, organization);
    const flowIds: string[] = [];
    for (const flow of flows) {
        const joins = await deriveFlowRecords(
            view, organization, flow.id,
        );
        if (joins.some(
            (join) => join.record_id === recordTypeId,
        )) {
            flowIds.push(flow.id);
        }
    }
    flowIds.sort();

    return { instanceIds, flowIds };
}

export function hasTypeReferrers(
    refs: RecordTypeReferrers,
): boolean {
    return refs.instanceIds.length > 0
        || refs.flowIds.length > 0;
}

// The 409 body: name what stands in the way so the caller
// can dissolve the covenants first. Voice matches
// describeReferrers (record-attribute-refs.ts).
export function describeTypeReferrers(
    recordTypeId: string,
    refs: RecordTypeReferrers,
): string {
    const parts: string[] = [];
    if (refs.instanceIds.length > 0) {
        parts.push(
            refs.instanceIds.length + ' instance(s)',
        );
    }
    if (refs.flowIds.length > 0) {
        parts.push(
            'flow(s) ' + refs.flowIds.join(', '),
        );
    }
    return 'record type ' + recordTypeId
        + ' is referenced by ' + parts.join('; ');
}
