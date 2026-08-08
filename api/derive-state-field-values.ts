import type { DbAdapter } from './db.ts';
import type {
    Id, RequestEntity, ResponseEntity, StateFieldValueEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    byIdAscending, type DocumentPair,
} from './derive-documents.ts';
import {
    operationPairsAt,
    WORK_ORDER_TRANSITION_PATTERN,
    stateEventVisibilityFor,
} from './derive-states.ts';

// Phase 14 Task 6: state_field_values (SFV) truth, derived from
// the pair plane instead of read off its own table. Author gate
// 5's own census: the LIVE writer is postWorkOrderTransitionOp
// (api/routes.ts) — ONE transition OPERATION pair
// (work-orders/:id/transition) whose body carries the fold
// (fieldValues: [{id, fields}]) — no per-value pair of its
// own. The STANDALONE leaf address
// (states/:id/field-values/:fvid) retired with the states
// address; GET states/:id/field-values retired (states-URI
// elimination C4) — product reads fold field values on
// work-order history. This module keeps the single-source
// fold for RESTRICT (deriveStateFieldValueReferrers). Seed
// forms transition op pairs that carry the same fold.

function matchingPrefixes(
    requests: readonly RequestEntity[],
    pattern: RegExp,
): ReadonlySet<string> {
    const prefixes = new Set<string>();
    for (const request of requests) {
        if (pattern.test(request.uri_prefix)) {
            prefixes.add(request.uri_prefix);
        }
    }
    return prefixes;
}

interface TransitionFieldValue {
    readonly id: string;
    readonly fields: Record<string, unknown>;
}

// One transition pair's fieldValues fold, reshaped into the
// DocumentPair shape so head-reduction below shares latestByKey
// with every other derive. `id`/`at` are the TRANSITION pair's
// OWN envelope (every row it folds landed inside that ONE
// atomic write, so they share one order-key); `uriId` is the
// field-value row's OWN id. `method: 'PUT'` — a transition only
// ever CREATES a row (validateWorkOrderTransitionBody carries
// no delete arm), never tombstones one.
function transitionFieldValueCandidates(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
): DocumentPair[] {
    const candidates: DocumentPair[] = [];
    for (const prefix of matchingPrefixes(
        requests, WORK_ORDER_TRANSITION_PATTERN,
    )) {
        for (const transition of operationPairsAt(
            requests, responses, prefix,
        )) {
            // New-shape pairs (no fieldValues bag) contribute
            // nothing to the legacy SFV census (RESTRICT legs
            // untouched — history fold owns both shapes).
            const raw = transition.body['fieldValues'];
            if (raw === undefined) continue;
            const fieldValues = raw as
                readonly TransitionFieldValue[];
            for (const fieldValue of fieldValues) {
                candidates.push({
                    id: transition.id,
                    at: transition.at,
                    uriId: fieldValue.id,
                    method: 'PUT',
                    body: fieldValue.fields,
                    requesterIdentityId:
                        transition.requesterIdentityId,
                });
            }
        }
    }
    return candidates;
}

// The single-source fold (Author gate 5): transition-fold
// candidates, head-reduced by the field-value row's OWN id via
// latestByKey's default (at, id) order — the SAME reduction
// every other derive in this migration applies. A DELETE head
// excludes the row (defensive; transitions never tombstone).
// UNFENCED: callers narrow to their own organization
// (deriveStateFieldValueReferrers below; work-order history
// folds via fieldValuesByTransitionEvent on entity-scoped
// transition pairs), never before this fold runs.
export function stateFieldValuesFrom(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
): StateFieldValueEntity[] {
    const candidates = transitionFieldValueCandidates(
        requests, responses,
    );
    const heads = latestByKey(candidates, (pair) => pair.uriId);
    const rows: StateFieldValueEntity[] = [];
    for (const [uriId, head] of heads) {
        if (head.method === 'DELETE') continue;
        rows.push({
            id: uriId,
            state_event_id:
                pickString(head.body, 'state_event_id'),
            attribute_id: pickString(head.body, 'attribute_id'),
            value: pickString(head.body, 'value'),
        });
    }
    return rows.sort(byIdAscending);
}

// Pair-plane fence successor (Phase 15 Task 3): a field-value
// row is visible iff its PARENT STATE EVENT is. Re-anchored
// from the row-plane rawHasRow + fenced getById three-way onto
// stateEventVisibilityFor (api/derive-states.ts, Phase 15
// Task 1 gate 2) — same disposition, pair-plane sourced:
//   orphan  → visible (no event anywhere)
//   visible → own-org (or owner-null entity)
//   hidden  → foreign organization
// Boolean fold: visibility !== 'hidden'. Used by RESTRICT
// referrers only (GET field-values retired C4).
// boundOrganization is the verified token claim, never a
// path segment.
async function isVisibleStateEvent(
    view: DbAdapter,
    boundOrganization: Id,
    stateEventId: Id,
): Promise<boolean> {
    const visibility = await stateEventVisibilityFor(
        view, boundOrganization, stateEventId,
    );
    return visibility !== 'hidden';
}

// The RESTRICT-facing reader (api/record-attribute-refs.ts's
// collectAttributeReferrers): every LIVE field-value row whose
// attribute_id is among `attributeIds`, visible to
// `boundOrganization`, keyed by attribute_id — ONE derive pass
// serves every id the caller's own loop asks about, rather than
// rescanning the plane per id (the pair plane has no
// attribute_id index the way the retired table's getAllWhere
// did). `view` is the ALREADY-OPEN write-gate transaction
// (ATTRIBUTE_RESTRICT_TABLES: requests, responses, and states
// are all in its ring) — no nested transaction opens here,
// matching workOrderClaimSourcesFor's own in-tx contract
// (derive-states.ts). Visibility reuses stateEventVisibilityFor
// (pair plane), not the row-plane rawHasRow fence.
//
// NAMED DEVIATION — Author gate 1(d) (fix wave, Critical 2):
// this SFV RESTRICT leg still reads the WHOLE requests/
// responses plane inside a write-gate transaction, which gate
// 1(d) disfavors in favor of entity-scoped indexed reads (the
// workOrderClaimSourcesFor precedent this header cites). The
// deviation PERSISTS BY DESIGN at the browser tier — it is not
// a Phase Final residual for the SFV count. The transition
// family (work-orders/:id/transition/) WOULD be servable via N
// indexed requests/responses.getAllWhere ('uri_prefix', ...)
// reads (api/db.ts's TABLE_INDEXES: both tables index
// uri_prefix — an EXACT-match index, one value per entity, not
// a family-wide constant), one per known work-order id, EXCEPT
// enumerating those ids WITHOUT the EntityStore deleted-filter
// would drop a since-deleted work order's field-value history
// from the RESTRICT count — a genuine wire delta vs the old
// table-plane read (a field-value row survives its work order's
// own deletion). Rejected for that reason. Contrast: Phase 15
// Task 4 re-anchored the three GRAPH legs of
// collectAttributeReferrers onto organization-scoped pair
// prefixes (WO document heads) and graphDelta replay
// (flowGraphBindingsFromPairs) — those legs are no longer a
// whole-plane scan. This SFV comment's scope is the field-value
// count alone.
export async function deriveStateFieldValueReferrers(
    view: DbAdapter,
    boundOrganization: Id,
    attributeIds: readonly Id[],
): Promise<Map<Id, readonly StateFieldValueEntity[]>> {
    const [requests, responses] = await Promise.all([
        view.requests.getAll(),
        view.responses.getAll(),
    ]);
    const wanted = new Set(attributeIds);
    const candidates = stateFieldValuesFrom(requests, responses)
        .filter((row) => wanted.has(row.attribute_id));

    // IMPORTANT 3 (fix wave): resolve visibility ONCE per
    // DISTINCT parent state event, not once per candidate row —
    // a hot attribute referenced by many rows under the SAME
    // event previously repeated the same visibility probe once
    // per row.
    const distinctEventIds = [...new Set(
        candidates.map((row) => row.state_event_id),
    )];
    const visibilityFlags = await Promise.all(
        distinctEventIds.map(
            (stateEventId) =>
                isVisibleStateEvent(
                    view, boundOrganization, stateEventId,
                ),
        ),
    );
    const visibility = new Map(
        distinctEventIds.map(
            (stateEventId, i) =>
                [stateEventId, visibilityFlags[i]!] as const,
        ),
    );

    const byAttribute = new Map<Id, StateFieldValueEntity[]>();
    for (const row of candidates) {
        if (visibility.get(row.state_event_id) !== true) {
            continue;
        }
        const list = byAttribute.get(row.attribute_id) ?? [];
        list.push(row);
        byAttribute.set(row.attribute_id, list);
    }
    return byAttribute;
}
