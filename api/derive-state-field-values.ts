import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type {
    Id, RequestEntity, ResponseEntity, StateFieldValueEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    documentPairsAt, byIdAscending, type DocumentPair,
} from './derive-documents.ts';
import {
    operationPairsAt, WORK_ORDER_TRANSITION_PATTERN,
} from './derive-states.ts';

// Phase 14 Task 6: state_field_values (SFV) truth, derived from
// the pair plane instead of read off its own table. Author gate
// 5's own census, re-run at Step 0 and unchanged: the row plane
// has exactly ONE writer, postWorkOrderTransitionOp (api/
// routes.ts) — it folds every field-value row for a transition
// into that SAME transaction's state_field_values.put calls,
// alongside ONE transition OPERATION pair (work-orders/:id/
// transition) whose body carries the fold (fieldValues: [{id,
// fields}]) — no per-value pair of its own. The STANDALONE leaf
// address (states/:id/field-values/:fvid) is BOTH PAIR_WIRED and
// DOCUMENT_CLASS (message-pair.ts), so a direct leaf PUT/DELETE —
// live OR seeded (api/mock-data/seed-message-pairs.ts pair-wires
// every mock row the same way) — DOES pair-wire itself.
//
// ELECTED (a) TWO-SOURCE UNION (spec B2) over (b) close-the-gap:
// zero ledger growth. The union is EXACT, not approximate — the
// row plane's own writers are exhaustively these two addresses
// (nothing else ever calls state_field_values.put), so every row
// the table could ever hold has a pair on one of these two
// addresses.
//
// DELETION REPRODUCED, NOT RESURRECTED: the leaf address is
// DOCUMENT_CLASS, so its own DELETE pair IS the tombstone signal
// — head-reduced away below exactly as deriveDocumentsAt (derive-
// documents.ts) excludes a DELETE head. A row born from a
// transition and LATER revised or deleted through the standalone
// leaf address is head-reduced by the SAME (at, id) order across
// BOTH sources (latestByKey below), so the leaf write — which can
// only ever land strictly after its own originating transition —
// wins, exactly as the row plane's own re-PUT/DELETE already
// works. No second pair gap.
const FIELD_VALUES_LEAF_ADDRESS_PATTERN =
    /^(?:\/organizations\/([^/]+))?\/states\/[^/]+\/field-values\/$/;

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

// One transition pair's fieldValues fold, reshaped into the SAME
// DocumentPair shape documentPairsAt already returns for the leaf
// address — so the union below head-reduces both sources through
// ONE latestByKey call rather than two merge strategies.
// `id`/`at` are the TRANSITION pair's OWN envelope (every row it
// folds landed inside that ONE atomic write, so they share one
// order-key); `uriId` is the field-value row's OWN id — the SAME
// id a later leaf PUT/DELETE at states/:id/field-values/:fvid
// would revisit. `method: 'PUT'` — a transition only ever CREATES
// a row (validateWorkOrderTransitionBody carries no delete arm),
// never tombstones one.
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
            const fieldValues = transition.body['fieldValues'] as
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

// The leaf address's own document pairs, across every state
// event's field-values sub-collection — UNFENCED (a caller
// narrows to its own organization; see isVisibleStateEvent
// below), matching deriveEventPairStates' own unfenced read at
// gate 5a (derive-states.ts).
function leafFieldValueCandidates(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
): DocumentPair[] {
    const candidates: DocumentPair[] = [];
    for (const prefix of matchingPrefixes(
        requests, FIELD_VALUES_LEAF_ADDRESS_PATTERN,
    )) {
        candidates.push(
            ...documentPairsAt(requests, responses, prefix),
        );
    }
    return candidates;
}

// The two-source union (Author gate 5, election (a)): transition-
// fold candidates ∪ leaf document pairs, head-reduced by the
// field-value row's OWN id via latestByKey's default (at, id)
// order — the SAME reduction every other derive in this migration
// applies. A DELETE head excludes the row (this module's own
// header). UNFENCED: callers narrow to their own organization
// (deriveStateFieldValueReferrers / stateFieldValuesForStateEvent
// below), never before this union runs.
export function stateFieldValuesFrom(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
): StateFieldValueEntity[] {
    const candidates = [
        ...transitionFieldValueCandidates(requests, responses),
        ...leafFieldValueCandidates(requests, responses),
    ];
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

// The row-plane fence, delegated rather than re-derived: a
// field-value row is visible iff its PARENT STATE EVENT is.
// `view.states` is ALREADY org-scoped (db-organization-scoped.ts's
// ParentScopedStateStore) for any caller-supplied view this
// module's own exports receive, so this is the SAME resolution
// the RETIRING state_field_values parentScope resolver performed
// (base.states.getById(row.state_event_id), then
// ownerOrganizationOfEntity on a hit) — reused via the store that
// already carries it, never rebuilt over the pair plane a second
// time.
//
// THE THREE-WAY RULE, restored verbatim (fix wave, Critical 1):
// the retiring resolver's own three branches are (1) no row for
// state_event_id AT ALL — a visible orphan (its own try/catch:
// EntityNotFoundError on the RAW base.states.getById returns
// null, and isVisible(null, org) is true); (2) a row exists and
// its entity resolves to this organization, OR to no owner at
// all (a visible orphan again) — both fold through
// ParentScopedStateStore's OWN getById succeeding; (3) a row
// exists and its entity resolves to a DIFFERENT, existing
// organization — hidden. view.states.getById ALONE cannot tell
// (1) apart from (3): both throw EntityNotFoundError identically
// (case 1 from the unfenced inner getById; case 3 from
// ParentScopedStateStore's own re-throw after a foreign-owner
// resolution). rawHasRow (api/db.ts's StateStore interface, the
// fence-mechanics addition this fix wave adds) settles (1) first
// — a raw presence check delegated to the SAME wrapped inner
// store the retired resolver closed over, never a second
// top-level transaction (db-backed.ts's ambientRunner reuses
// whatever tx `view` is already bound to).
async function isVisibleStateEvent(
    view: DbAdapter,
    stateEventId: Id,
): Promise<boolean> {
    if (!(await view.states.rawHasRow(stateEventId))) {
        // Case (1): no row anywhere — a visible orphan.
        return true;
    }
    try {
        // Case (2): the row exists and is visible (same org, or
        // an orphan entity) — ParentScopedStateStore's own
        // getById already applies exactly this rule.
        await view.states.getById(stateEventId);
        return true;
    } catch (e) {
        if (e instanceof EntityNotFoundError) {
            // Case (3): the row exists but resolves to a
            // different, existing organization — hidden.
            return false;
        }
        throw e;
    }
}

// The RESTRICT-facing reader (api/record-attribute-refs.ts's
// collectAttributeReferrers): every LIVE field-value row whose
// attribute_id is among `attributeIds`, visible to `view`'s bound
// organization, keyed by attribute_id — ONE derive pass serves
// every id the caller's own loop asks about, rather than
// rescanning the plane per id (the pair plane has no attribute_id
// index the way the retired table's getAllWhere did). `view` is
// the ALREADY-OPEN write-gate transaction (ATTRIBUTE_RESTRICT_
// TABLES: requests, responses, and states are all in its ring) —
// no nested transaction opens here, matching workOrderClaim
// SourcesFor's own in-tx contract (derive-states.ts).
//
// NAMED DEVIATION — Author gate 1(d) (fix wave, Critical 2): this
// reads the WHOLE requests/responses plane inside a write-gate
// transaction, which gate 1(d) disfavors in favor of entity-
// scoped indexed reads (the workOrderClaimSourcesFor precedent
// this header cites). TWO family-scoped alternatives were
// investigated and REJECTED before falling back here, not
// skipped:
//   - Leaf family (states/:id/field-values/): no cheaper
//     entity-id source exists. A leaf pair's own uri_prefix is
//     keyed by state_event_id (api/message-address.ts), and
//     nothing enumerates "every state event that might carry a
//     field value" more cheaply than reading the plane that
//     would answer it.
//   - Transition family (work-orders/:id/transition/): WOULD be
//     servable via N indexed requests/responses.getAllWhere
//     ('uri_prefix', ...) reads (api/db.ts's TABLE_INDEXES: both
//     tables index uri_prefix — an EXACT-match index, one value
//     per entity, not a family-wide constant), one per known
//     work-order id, EXCEPT the only cheap work-order id source
//     — view.workOrders.getAll() — is an EntityStore read, which
//     applies its OWN deleted-filter (getDeletedIdsIn,
//     store-entity.ts) and silently excludes a since-deleted
//     work order. The OLD table-plane state_field_values read
//     never filtered by work-order lifecycle at all (a field-
//     value row survives its work order's own deletion), so
//     scoping by view.workOrders.getAll() would introduce a
//     genuine wire delta — dropping a since-deleted work order's
//     field-value history from the RESTRICT count — not merely
//     miss an optimization. Rejected for that reason; no
//     DbAdapter-level primitive enumerates work-order ids
//     WITHOUT the deleted filter today.
// Task 11 measures this; closing the transition half would need
// a raw, undeleted-filtered work-order id enumeration this task
// does not introduce on its own authority.
export async function deriveStateFieldValueReferrers(
    view: DbAdapter,
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
    // event previously repeated the same rawHasRow/getById pair
    // once per row.
    const distinctEventIds = [...new Set(
        candidates.map((row) => row.state_event_id),
    )];
    const visibilityFlags = await Promise.all(
        distinctEventIds.map(
            (stateEventId) =>
                isVisibleStateEvent(view, stateEventId),
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

// The GET-facing reader (states/:id/field-values, flipped by
// DEFAULT — Task 6, Author gate 5). The visibility check runs
// FIRST, against `db` directly (already org-scoped): an absent OR
// foreign event returns [] without ever deriving anything — byte-
// identical to the retired table read's own empty-array outcome
// for both cases (db.stateFieldValues.getAllWhere trivially found
// no rows for an absent event, and the SFV parentScope resolver
// fenced a foreign event's rows to invisible — this route never
// 404s). Once visible, ONE shared readonly tx over requests+
// responses (the deriveEventPairStates torn-read closure, derive-
// states.ts) derives the WHOLE plane: the GET path may scan wider
// than the RESTRICT write gate (Author gate 5's own hard
// constraint), and the transition fold has no address of its own
// keyed by state_event_id, so a narrower read is not available
// regardless — see this module's header.
export async function stateFieldValuesForStateEvent(
    db: DbAdapter,
    stateEventId: Id,
): Promise<StateFieldValueEntity[]> {
    if (!(await isVisibleStateEvent(db, stateEventId))) return [];
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            return stateFieldValuesFrom(requests, responses)
                .filter(
                    (row) => row.state_event_id === stateEventId,
                );
        },
    );
}
