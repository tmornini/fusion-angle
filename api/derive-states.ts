import type { DbAdapter } from './db.ts';
import type {
    Id, RequestEntity, ResponseEntity, StateEntity,
} from './types.ts';
import { MS_PER_SECOND } from './types.ts';
import {
    pickString, validateWorkOrderFlowGraphJson,
} from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    documentPairsAt,
    deriveDocumentsAt,
    byIdAscending,
    type DocumentPair,
} from './derive-documents.ts';
import { deriveIdeaStateHistory } from './derive-ideas.ts';
import { deriveProjectStateHistory } from './derive-projects.ts';
import { deriveRecordStateHistory } from './derive-records.ts';
import { deriveFlowStateHistory } from './derive-flows.ts';
import { latestClaimEvent } from './work-order-claims.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// The states-log derivation, Phase 11 (the derive-identity-
// spine.ts precedent applied to the unified event log). SIX
// sources feed the union deriveStates/deriveStatesFor assemble
// (Task 5, at the bottom of this file):
//   (a) deriveEventPairStates — the states/:id event-pair reader
//       (gate 5a).
//   (b) the four trio families' OWN embedded lifecycle history —
//       deriveIdeaStateHistory/deriveProjectStateHistory/
//       deriveRecordStateHistory/deriveFlowStateHistory, IMPORTED
//       from their own modules (gate 5b) via deriveTrioFamilyStates
//       below, never rebuilt here.
//   (c) deriveMemberGenesis — the human/AI member create-op
//       genesis trio (gate 5c).
//   (d) deriveWorkOrderLifecycle — the work-order op-pair replay
//       (gate 5d) — see its own section header below for the
//       work-order-specific edges.
//   (e) deriveFlowGraphStates — flow-node/edge deleted/restored
//       sidecars (gate 5e).
//   (f) deriveInvitationStates — the invitation grant + its three
//       answering ops (gate 5f).
// Objectives need no seventh source: their archive/reactivate ride
// states/:id pairs like any other entity's (source (a) already
// covers them), and a fresh objective has no genesis event at all
// — absence IS active (api/routes.ts's postObjectiveCreationOp
// comment) — so there is no genesis row to derive anywhere.
//
// The PAIR-PLANE org fence (resolveOwningOrganization /
// fenceStatesByOwner, gate 4) is applied ONCE, by deriveStates
// alone — deriveStatesFor takes both the organization and the
// entity from the caller directly, so no visibility fence applies
// there.
//
// FLIPPED (Task 7): api/routes.ts's GET /states and GET
// /entity-states/:id/history dispatch to deriveStates/
// deriveStatesFor below — Task 1's row-plane fence
// (api/store-parent-scoped.ts) no longer serves either read.
// GET /states/:id and GET /entity-states/:id stay on the row
// plane — zero product callers, deferred to Phase Final.
//
// THE GATE-15 PRECEDENT (Phase 10, tests/drift-identities.test.ts
// + api/routes.ts's module-private membershipsAcrossAllOrganiza
// tions/ownerOrganizationViaMembershipPairPlane): an org fence can
// be reproduced from the MEMBERSHIP PAIR PLANE instead of row
// probes. This module reproduces that same technique for the
// states log's own fence — resolveViaMembershipPairPlane below is
// re-derived here (not imported) because routes.ts's helpers are
// module-private.
//
// IMMUNE TO THE DELETED FILTER: requests/responses are append-
// only, so a family's document pair still names its organization
// (via the stored uri_prefix, or — for invitations — the stored
// body) forever, regardless of whether the ENTITY it addresses
// has since transitioned to a 'deleted' lifecycle state. Task 1's
// row-plane fence had to bypass EntityStore's deleted filter with
// a raw row read to get this same guarantee
// (rawOrganizationOwnedProbes); the pair plane needs no such
// bypass — it never consults the states log's deleted-filter at
// all.
//
// THE isVisible RULE REPRODUCED (api/store-parent-scoped.ts): a
// row is visible to `boundOrganization` iff its resolved owner IS
// `boundOrganization`, or the owner is null (a genuine orphan — no
// pair anywhere names the entity). fenceStatesByOwner below is the
// exact same three-way rule, applied over resolveOwningOrganization
// instead of a row-plane probe.

// ---- deriveEventPairStates — the event-pair reader (gate 5a) ---

// states/:id is an EVENT-APPEND address (message-pair.ts): each
// event id is client-minted fresh per write, and the states table
// is ledger-immutable (StateStore.put throws
// LedgerImmutabilityError on a differing re-put of the same id),
// so a given uriId is visited by AT MOST one distinct 2xx pair —
// documentPairsAt's full pair list IS the event list; no head
// reduction is needed or appropriate.
//
// SEGMENT-BOUNDARY CORRECTNESS (the derive-identity-spine.ts E13
// precedent): 'states' is organization-nested
// (message-pair.ts's ORGANIZATION_NESTED_FIRST_SEGMENTS), so a
// live write's stored uri_prefix is
// '/organizations/<org>/states/' — there is no single flat prefix
// to scan. The optional org-segment group below matches that
// shape without ever confusing it with an unrelated sibling
// address sharing the '/organizations/<org>/' root.
const STATES_ADDRESS_PATTERN =
    /^(?:\/organizations\/([^/]+))?\/states\/$/;

// The pure states/:id pair-decode — factored out of
// deriveEventPairStates so deriveWorkOrderLifecycle's own claim
// replay (below) can consult the SAME rows, over requests/
// responses it has ALREADY fetched inside its own torn-read
// transaction, rather than re-implementing the address match or
// opening a second, independently-snapshotted transaction.
function eventPairStatesFrom(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
): StateEntity[] {
    const prefixes = new Set<string>();
    for (const request of requests) {
        if (STATES_ADDRESS_PATTERN.test(request.uri_prefix)) {
            prefixes.add(request.uri_prefix);
        }
    }
    const rows: StateEntity[] = [];
    for (const prefix of prefixes) {
        for (const pair of documentPairsAt(
            requests, responses, prefix,
        )) {
            rows.push({
                id: pair.uriId,
                entity_id: pickString(pair.body, 'entity_id'),
                state: pickString(pair.body, 'state'),
                // The stored member_id: the pair's own
                // requester — stamped from the verified
                // actor at write time (routes.ts's PUT
                // /states/:id handler), never a body
                // field (validateStateBody admits no
                // member_id key at all). No response-body
                // decode needed here, unlike the identity
                // spine's gate-16 role-grants deviation.
                member_id: pair.requesterIdentityId,
                at: pickString(pair.body, 'at'),
            });
        }
    }
    return rows;
}

// Every LIVE event posted through the dedicated PUT /states/:id
// address, across every organization — an entity family's OWN
// embedded lifecycle trio (ideas/projects/flows/work-orders) is a
// DIFFERENT union source, read by a later task, never this one.
// ONE shared readonly tx over requests+responses (the derive-
// identity-spine.ts torn-read closure): both reads observe the
// SAME committed snapshot, so a write landing between two
// independent reads can never split a pair across them.
export async function deriveEventPairStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            return eventPairStatesFrom(requests, responses)
                .sort(byIdAscending);
        },
    );
}

// ---- resolveOwningOrganization — the PAIR-PLANE fence (gate 4) -

// The org-owned, org-nested document families whose OWN id can
// appear as a states.entity_id — mirrors
// api/store-parent-scoped.ts's rawOrganizationOwnedProbes table
// exactly (ideas, projects, flows, records, objectives,
// work-orders); invitations is handled separately below (its
// address is flat, never organization-nested — message-pair.ts's
// canonicalUriPrefix / family-registry.ts has no entry for it).
const ORGANIZATION_NESTED_ENTITY_FAMILIES = [
    'ideas', 'projects', 'flows',
    'work-orders', 'records', 'objectives',
] as const;

const ORGANIZATION_NESTED_FAMILY_ADDRESS_PATTERN = new RegExp(
    '^/organizations/([^/]+)/('
    + ORGANIZATION_NESTED_ENTITY_FAMILIES.join('|')
    + ')/$',
);

const INVITATIONS_PREFIX =
    canonicalUriPrefix(undefined, '/invitations/');

async function organizationIds(
    db: DbAdapter,
): Promise<readonly Id[]> {
    const organizations = await db.organizations.getAll();
    return organizations.map((organization) => organization.id);
}

// The invitation's own organization_id — carried in the STORED
// REQUEST body (derive-invitations.ts's own precedent), never the
// uri_prefix (the invitations address is flat, unlike every
// org-nested family above). A full scan of the (small) invitations
// family, mirroring derive-invitations.ts exactly — reused rather
// than reimplemented.
async function resolveInvitationOwner(
    db: DbAdapter,
    entityId: Id,
): Promise<Id | null> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', INVITATIONS_PREFIX),
        db.responses.getAllWhere(
            'uri_prefix', INVITATIONS_PREFIX,
        ),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, INVITATIONS_PREFIX,
    ).get(entityId);
    return document === undefined
        ? null
        : pickString(document.body, 'organization_id');
}

// flow_nodes/flow_edges carry NO address of their own
// (message-pair.ts: absent from both PAIR_WIRED_ROUTE_PATTERNS and
// DOCUMENT_CLASS_ROUTE_PATTERNS) — they ride folded inside the
// flow's own document body, as graphDelta.nodes/.edges upserts
// (api/routes.ts's writeFlowGraphDelta). A node/edge that is later
// removed from the client's CURRENT graph snapshot still keeps its
// row forever (writeFlowGraphDelta only ever PUTs flow_nodes/
// flow_edges; a 'deleted' entity is a states-log event ALONGSIDE
// the row, never a splice of it) — so scanning graphDelta across a
// flow's FULL pair history, not merely its head document, finds
// every node/edge that ever existed, including ones later deleted.
function graphDeltaHasMember(
    body: Record<string, unknown>,
    entityId: Id,
): boolean {
    const delta = body['graphDelta'];
    if (typeof delta !== 'object' || delta === null) return false;
    const { nodes, edges } = delta as Record<string, unknown>;
    return idsInclude(nodes, entityId) || idsInclude(edges, entityId);
}

function idsInclude(value: unknown, entityId: Id): boolean {
    if (!Array.isArray(value)) return false;
    return value.some((item) =>
        typeof item === 'object' && item !== null
        && (item as Record<string, unknown>)['id'] === entityId);
}

async function resolveFlowGraphOwner(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    // Check the asking org's own flows first (the common case),
    // then every other known organization — order never changes
    // correctness (a flow has exactly one true owner), only which
    // organization's prefix is read first.
    const organizations = await organizationIds(db);
    const ordered = [
        boundOrganization,
        ...organizations.filter((o) => o !== boundOrganization),
    ];
    for (const organization of ordered) {
        const prefix = canonicalUriPrefix(organization, '/flows/');
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_prefix', prefix),
            db.responses.getAllWhere('uri_prefix', prefix),
        ]);
        for (const pair of documentPairsAt(
            requests, responses, prefix,
        )) {
            if (graphDeltaHasMember(pair.body, entityId)) {
                return organization;
            }
        }
    }
    return null;
}

// The org-less member/identity fallback (an ai-member/human-member
// id, i.e. an identity id): memberships is organization-nested
// (family-registry.ts), so there is no single address to scan —
// THE GATE-15 PRECEDENT unions the same per-org derivation across
// every known organization instead.
//
// ASKER-RELATIVE BY NECESSITY: an identity can hold memberships in
// MULTIPLE organizations at once. api/store-parent-scoped.ts's own
// viaMembership resolver is (necessarily) closed over the ASKING
// org for exactly this reason — a co-member of the asking org must
// read as visible even when the SAME identity also belongs
// elsewhere. boundOrganization is checked first (co-membership is
// the common, cheap case); only when that misses does this widen
// to every other organization, purely to distinguish "belongs
// elsewhere" (hidden) from "belongs nowhere" (a genuine orphan,
// visible) — which OTHER org it resolves to in that case is never
// observed by fenceStatesByOwner's isVisible check, so no further
// tie-break is needed.
async function organizationHasMemberPair(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<boolean> {
    const prefix = canonicalUriPrefix(
        organization, '/memberships/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    // HEAD-REDUCED (deriveDocumentsAt), not raw pairs, unlike
    // every other leg in this module: a membership REMOVAL is a
    // genuine hard row-DELETE — no states-log soft-delete event
    // exists for memberships — so a DELETE head must exclude the
    // row here to reproduce old-plane parity. Do not swap this
    // for documentPairsAt for "consistency" with the other legs.
    const documents = deriveDocumentsAt(
        requests, responses, prefix,
    );
    for (const document of documents.values()) {
        if (
            pickString(document.body, 'identity_id') === identityId
        ) {
            return true;
        }
    }
    return false;
}

async function resolveViaMembershipPairPlane(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    if (
        await organizationHasMemberPair(
            db, boundOrganization, entityId,
        )
    ) {
        return boundOrganization;
    }
    for (const organization of await organizationIds(db)) {
        if (organization === boundOrganization) continue;
        if (
            await organizationHasMemberPair(
                db, organization, entityId,
            )
        ) {
            return organization;
        }
    }
    return null;
}

async function computeOwningOrganization(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    // (a) org-nested document families: a targeted uri_id index
    // read (mirrors message-pair.ts's own headPairIdAt) rather
    // than a full-ledger scan — an entity id is globally unique
    // (generateCryptoSafeBase62), so at most one distinct
    // org-nested prefix can ever match.
    const responseHits =
        await db.responses.getAllWhere('uri_id', entityId);
    for (const response of responseHits) {
        const match = ORGANIZATION_NESTED_FAMILY_ADDRESS_PATTERN
            .exec(response.uri_prefix);
        if (match !== null) return match[1]!;
    }

    // (c) invitations: flat address, org lives in the body.
    const invitationOwner =
        await resolveInvitationOwner(db, entityId);
    if (invitationOwner !== null) return invitationOwner;

    // (d) flow-node/edge events: folded into the flow's own
    // document-pair prefix.
    const graphOwner = await resolveFlowGraphOwner(
        db, entityId, boundOrganization,
    );
    if (graphOwner !== null) return graphOwner;

    // (b) the membership pair plane: org-less member/identity ids.
    return await resolveViaMembershipPairPlane(
        db, entityId, boundOrganization,
    );
}

// The PAIR-PLANE fence resolver (gate 4). Resolves entityId's
// owning organization across all four sources above, or null for
// a genuine orphan (no pair anywhere names the entity).
//
// MEMOIZATION SCOPE: memoized per distinct entityId WITHIN one
// derivation pass — `memo` is a Map created per call chain (a
// fresh one per fenceStatesByOwner call below), NEVER a
// module-global cache (module-global memoization is the Cache
// abomination: cross-request staleness across writes). A caller
// invoking this standalone (as several tests below do) gets a
// fresh, one-shot memo by default — still correct, merely
// unmemoized across calls.
//
// boundOrganization is a required argument, not merely
// fenceStatesByOwner's own concern: the membership-pair-plane leg
// is intrinsically asker-relative (see
// resolveViaMembershipPairPlane's own header), exactly like
// api/store-parent-scoped.ts's ownerOrganizationOfEntity already
// threads boundOrganization through to its own viaMembership call.
export async function resolveOwningOrganization(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
    memo: Map<Id, Id | null> = new Map(),
): Promise<Id | null> {
    const cached = memo.get(entityId);
    if (cached !== undefined) return cached;
    const owner = await computeOwningOrganization(
        db, entityId, boundOrganization,
    );
    memo.set(entityId, owner);
    return owner;
}

// Keep rows whose resolved owner is boundOrganization or null —
// the isVisible rule (api/store-parent-scoped.ts) reproduced over
// the pair plane. ONE memo per call, shared across every row, so
// resolving the SAME entity_id twice within one fence pass costs
// one read-through, not two.
export async function fenceStatesByOwner(
    db: DbAdapter,
    rows: readonly StateEntity[],
    boundOrganization: Id,
): Promise<StateEntity[]> {
    const memo = new Map<Id, Id | null>();
    const owners = await Promise.all(
        rows.map((row) =>
            resolveOwningOrganization(
                db, row.entity_id, boundOrganization, memo,
            )),
    );
    return rows.filter((_, index) =>
        owners[index] === null
        || owners[index] === boundOrganization);
}

// ---- deriveWorkOrderLifecycle — the op-pair reader (gate 5d) ---

// Source (d) of the states-log union — the LAST source, and the
// only one that reads work-order CREATE/CLAIM/TRANSITION
// operation pairs rather than the states/:id address
// deriveEventPairStates (source a) already covers. Every SEEDED
// work order (buildWorkOrders/buildLeadToCloseWorkload) was
// formed via a bare document PUT — zero operation pairs — so its
// births and claims ride source (a) alone; this function emits
// NOTHING for it. Its output materializes ONLY for a work order
// created, claimed, or transitioned through the LIVE route
// (postWorkOrderCreationOp/postWorkOrderClaimOp/
// postWorkOrderTransitionOp), so a HYBRID work order (a seeded
// document plus a live claim) draws its births from source (a)
// and its claim from here — the two addresses are DISJOINT, so no
// row is ever double-counted across the two readers.
//
// THE CREATE-PAIR RELAXATION (EDGE 1): a work order's create pair
// is a DOMAIN fact, not a defensive fallback — 100% of seeded work
// orders lack one (they were never created through this route), so
// its absence NEVER throws; it simply means this reader
// contributes no births for that id (its births already exist via
// source (a)'s own read of the seed's states/:id trace). Only a
// LIVE creation — and a caller's RETRY of one, each landing its
// OWN create pair at the same work-order id — contributes birth
// events, one three-slot array PER create pair found.
//
// THE REFERENCE-CLOCK RESIDUAL (EDGE 2 — a SERVER-TIER TODO): the
// live claim route (postWorkOrderClaimOp) decides expiry against
// REAL Date.now() at the moment the NEXT claim happens to be
// processed — an instant NEVER stored in any pair body. This
// replay instead compares the claim pair's own body `claimAt`
// against the prior claim's `at`, with the route's exact `>=`
// boundary (isExpiredAsOf below) — a PURE, Date.now-free
// comparator, deliberately never isClaimEventExpired (api/
// work-order-claims.ts), which IS Date.now-coupled. Byte-exact
// replay holds ONLY under this demo's zero-latency, single-process
// architecture, where the claim body's claimAt and the route's
// real decision instant are, for all practical purposes, the same
// moment; the eventual server tier must record the ACTUAL expiry
// decision as its own event rather than lean on this replay trick.

// The work-orders COLLECTION address: POST 'work-orders' (create)
// and PUT/DELETE 'work-orders/:id' (document) share this ONE
// prefix per organization (family-registry.ts: work-orders is
// organizationNested), partitioned apart by METHOD alone
// (tests/drift-work-orders.test.ts case 8) — the create's uriId is
// the body's OWN minted id, the SAME id a later PUT's uriId names.
const WORK_ORDERS_COLLECTION_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/$/;

// The claim/transition sub-resource addresses: UNLIKE the
// collection prefix above, the work-order id rides the PREFIX
// itself here (routes.ts: 'work-orders/:id/claim' /
// 'work-orders/:id/transition'), so each distinct match names ONE
// work order directly — captured, the organization segment is not
// (a work-order id is globally unique, so it is never needed to
// disambiguate).
const WORK_ORDER_CLAIM_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/([^/]+)\/claim\/$/;
const WORK_ORDER_TRANSITION_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/([^/]+)\/transition\/$/;

// One decoded 2xx POST pair — an OPERATION address (create/claim/
// transition are POST-only), the documentPairsAt (derive-
// documents.ts) twin restricted to the OTHER method: that reader
// deliberately EXCLUDES POST (the DOCUMENT head is PUT/DELETE
// only); this one deliberately admits POST ALONE, since a work
// order's operations are never PUT/DELETE. Production
// genericization of tests/drift-work-orders.test.ts case 9's
// AnyPair/allPairsAt, narrowed to exactly what a work-order
// replay ever consumes — never a configurable multi-method reader
// nobody asked for.
interface OperationPair {
    readonly id: Id;
    readonly at: string;
    readonly uriId: Id;
    readonly body: Record<string, unknown>;
    readonly requesterIdentityId: Id;
}

// requestMethodOf/requestBodyOf's own twin (api/derive-
// documents.ts), needed here ONLY because operationPairsAt reads
// POST — mirrors derive-identity-spine.ts's own responseBodyOf,
// which duplicates the same decode plumbing for its OWN reason
// (the response side, there; the POST method, here) rather than
// exporting derive-documents.ts's private helpers across a module
// boundary they were never meant to cross.
function decodeRequestOperation(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseJson(message, defaultBodyRegistry());
    if (model.startLine.kind !== 'request') {
        throw new Error(
            'stored request message carries no request line',
        );
    }
    const body = HttpMessage.fromModel(model).body();
    return {
        method: model.startLine.method,
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// (at, id) ascending — the total order every replay step below
// orders its actions by, and the order the final derivation
// returns rows in (deriveWorkOrderLifecycle's own header).
function atIdCompare(
    a: { readonly at: string; readonly id: string },
    b: { readonly at: string; readonly id: string },
): number {
    return a.at < b.at ? -1
        : a.at > b.at ? 1
            : a.id < b.id ? -1
                : a.id > b.id ? 1
                    : 0;
}

// Every successful (2xx) POST pair at `uriPrefix`, (at, id)
// ascending. REUSED below by source (c) (deriveMemberGenesis) and
// source (f) (deriveInvitationStates) — both read a flat, non-
// work-order collection's own 2xx POST pairs, the exact shape
// this function already reads generically (Task 4's own report
// flagged this as the anticipated reuse; Generality: the better
// way rises to replace every similar site rather than resting
// beside them).
function operationPairsAt(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
    uriPrefix: string,
): OperationPair[] {
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const pairs: OperationPair[] = [];
    for (const response of responses) {
        if (
            response.uri_prefix !== uriPrefix
            || response.status < 200 || response.status > 299
        ) continue;
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        const decoded = decodeRequestOperation(request.message);
        if (decoded.method !== 'POST') continue;
        pairs.push({
            id: response.id,
            at: response.at,
            uriId: response.uri_id,
            body: decoded.body,
            requesterIdentityId: request.requester_identity_id,
        });
    }
    return pairs.sort(atIdCompare);
}

// A pure Date-parse subtraction — never Date.now() (EDGE 2).
function msBetween(laterIso: string, earlierIso: string): number {
    return Date.parse(laterIso) - Date.parse(earlierIso);
}

// The route's EXACT `>=` boundary (postWorkOrderClaimOp's own
// `isClaimEventExpired` call), reproduced as a pure comparator
// over two body timestamps instead of one body timestamp and
// Date.now().
function isExpiredAsOf(
    claimAt: string,
    priorAt: string,
    lockTimeoutSeconds: number,
): boolean {
    return msBetween(claimAt, priorAt)
        >= lockTimeoutSeconds * MS_PER_SECOND;
}

// LOCKTIMEOUT SOURCING: the work order's DOCUMENT HEAD as of
// `momentAt` — the (at, id) winner among PUT/DELETE pairs whose
// response `at` strictly precedes it. `entityPairs` is ascending
// by (at, id) already (documentPairsAt's own contract), so the
// last entry passing the filter IS that winner.
function documentHeadBefore(
    entityPairs: readonly DocumentPair[],
    momentAt: string,
): DocumentPair | undefined {
    const before = entityPairs.filter((p) => p.at < momentAt);
    return before[before.length - 1];
}

// lock_timeout is a MOVING TARGET — an entity PUT can change it
// mid-history — so every claim sources it FRESH from the document
// head as of that claim's OWN response.at, never a single graph
// read cached across the whole replay.
function lockTimeoutAsOf(
    entityPairs: readonly DocumentPair[],
    momentAt: string,
): number {
    const head = documentHeadBefore(entityPairs, momentAt);
    if (head === undefined) {
        // A genuine invariant violation, not a defensive
        // fallback: postWorkOrderClaimOp requires the work order
        // to already exist (view.workOrders.getById), and every
        // path that can create one also writes a document pair
        // beside it — so a claim/transition pair can never
        // legitimately precede every document pair at this id.
        throw new Error(
            'no document head before ' + momentAt,
        );
    }
    return validateWorkOrderFlowGraphJson(
        pickString(head.body, 'flow_graph'),
        'work-order lifecycle document head flow_graph',
    ).lockTimeout;
}

// Every candidate event a claim pair's prior-claim decision may
// draw from: the replay's OWN emitted events so far, MERGED with
// the states/:id event-append rows for this SAME work-order
// entity (gate 5a's own rows — releasing a claim through the
// standalone PUT states/:id address, e.g. deleteWorkOrderClaim's
// 'claim_released', is a REAL product path this replay never
// otherwise sees, since it lands as an EVENT-APPEND pair, not a
// claim/transition OP pair). This reproduces the SAME full-log
// view postWorkOrderClaimOp's own in-tx `view.states.getAllFor
// (workOrderId)` sees live (routes.ts), as a pure merge over two
// already-fetched arrays rather than a live table read.
//
// The `replayed` half is already bounded to "earlier" by the
// caller's own (at, id)-ordered processing; the states/:id half
// is NOT — it is the entity's FULL direct-address history, which
// can include events chronologically AFTER this claim (a later
// release, a later unrelated event) — so filtering both halves to
// strictly-before `claim` is load-bearing here, not a redundant
// re-check.
function priorClaimCandidates(
    replayed: readonly StateEntity[],
    statesAddressEvents: readonly StateEntity[],
    claim: OperationPair,
): StateEntity[] {
    return [...replayed, ...statesAddressEvents]
        .filter((row) => atIdCompare(row, claim) < 0)
        .sort(atIdCompare);
}

// Each claim pair re-runs the route's own 0/1/2-event decision
// with the pair BODY's claimAt as the reference clock (EDGE 2).
// PRIOR state reduces from priorClaimCandidates above (never
// old-plane rows) via latestClaimEvent's own CLAIM_STATES filter +
// (at, id) max.
function applyClaimPair(
    replayed: StateEntity[],
    entityPairs: readonly DocumentPair[],
    statesAddressEvents: readonly StateEntity[],
    claim: OperationPair,
    workOrderId: Id,
): void {
    const claimEventId = pickString(claim.body, 'claimEventId');
    const claimAt = pickString(claim.body, 'claimAt');
    const expireEventId = pickString(
        claim.body, 'expireEventId',
    );
    const expireAt = pickString(claim.body, 'expireAt');
    const lockTimeout = lockTimeoutAsOf(entityPairs, claim.at);
    const prior = latestClaimEvent(
        priorClaimCandidates(replayed, statesAddressEvents, claim),
        workOrderId,
    );
    const priorLive = prior !== null
        && prior.state === 'claimed'
        && !isExpiredAsOf(claimAt, prior.at, lockTimeout);

    if (priorLive) {
        // Idempotent re-claim by the same actor — zero events,
        // matching postWorkOrderClaimOp's own early return (a
        // foreign live claim 409s before any pair ever forms, so
        // it never reaches a replay at all).
        return;
    }
    if (prior !== null && prior.state === 'claimed') {
        replayed.push({
            id: expireEventId,
            entity_id: workOrderId,
            state: 'claim_expired',
            // Recovered from the PRIOR claim's OWN replayed
            // author, never the current pair's.
            member_id: prior.member_id,
            at: expireAt,
        });
    }
    replayed.push({
        id: claimEventId,
        entity_id: workOrderId,
        state: 'claimed',
        member_id: claim.requesterIdentityId,
        at: claimAt,
    });
}

// A transition pair's own target-state event, plus its OPTIONAL
// release event — field values ride a SEPARATE table
// (state_field_values), outside this states-log derivation's own
// contract (StateEntity rows only).
function applyTransitionPair(
    replayed: StateEntity[],
    transition: OperationPair,
    workOrderId: Id,
): void {
    replayed.push({
        id: pickString(transition.body, 'transitionEventId'),
        entity_id: workOrderId,
        state: pickString(transition.body, 'targetState'),
        member_id: transition.requesterIdentityId,
        at: pickString(transition.body, 'transitionAt'),
    });

    const release = transition.body['release'];
    if (release !== null) {
        const releaseFields = release as {
            readonly id: string;
            readonly state: string;
            readonly at: string;
        };
        replayed.push({
            id: releaseFields.id,
            entity_id: workOrderId,
            // VERBATIM from the pair body — the gate does not
            // constrain release.state to 'claim_released'.
            state: releaseFields.state,
            member_id: transition.requesterIdentityId,
            at: releaseFields.at,
        });
    }
}

type WorkOrderAction =
    | { readonly kind: 'claim'; readonly pair: OperationPair }
    | { readonly kind: 'transition'; readonly pair: OperationPair };

// One work order's full replay: its births (EDGE 1 — zero or
// more three-slot arrays, one per create pair found), then its
// claim/transition actions applied in (at, id) order so each
// claim's prior-claim lookup only ever sees chronologically
// earlier events. `statesAddressEvents` is this SAME work
// order's own states/:id rows (gate 5a) — threaded through so
// applyClaimPair's prior-claim decision can see a standalone
// release, exactly as the live route's own full-log read does.
function replayWorkOrderOperations(
    createPairs: readonly OperationPair[],
    entityPairs: readonly DocumentPair[],
    statesAddressEvents: readonly StateEntity[],
    claimPairs: readonly OperationPair[],
    transitionPairs: readonly OperationPair[],
    workOrderId: Id,
): StateEntity[] {
    const events: StateEntity[] = [];
    for (const createPair of createPairs) {
        const ids = createPair.body['stateEventIds'] as
            readonly string[];
        const ats = createPair.body['stateEventAts'] as
            readonly string[];
        const states = createPair.body['states'] as
            readonly string[];
        for (let i = 0; i < ids.length; i++) {
            events.push({
                id: ids[i]!,
                entity_id: workOrderId,
                state: states[i]!,
                member_id: createPair.requesterIdentityId,
                at: ats[i]!,
            });
        }
    }

    const actions: WorkOrderAction[] = [
        ...claimPairs.map((pair) => (
            { kind: 'claim' as const, pair }
        )),
        ...transitionPairs.map((pair) => (
            { kind: 'transition' as const, pair }
        )),
    ].sort((a, b) => atIdCompare(a.pair, b.pair));

    for (const action of actions) {
        if (action.kind === 'claim') {
            applyClaimPair(
                events, entityPairs, statesAddressEvents,
                action.pair, workOrderId,
            );
        } else {
            applyTransitionPair(events, action.pair, workOrderId);
        }
    }

    return events;
}

// The op-pair reader (gate 5d). ONE shared readonly tx over
// requests+responses (the deriveEventPairStates torn-read
// closure) — every grouping and replay step below is pure over
// the two fetched arrays, no further db reads. (at, id) ascending
// overall: these rows are SYNTHESIZED (no address of their own to
// read 1:1, unlike deriveEventPairStates' states/:id rows), so
// there is no raw-store scan order to reproduce — chronological
// (at, id) is the meaningful order, and filtering this total order
// by entity_id preserves it per work order, matching
// db.states.getAllFor's own (at, id) contract exactly.
export async function deriveWorkOrderLifecycle(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);

            const collectionPrefixes = new Set<string>();
            for (const request of requests) {
                if (WORK_ORDERS_COLLECTION_PATTERN.test(
                    request.uri_prefix,
                )) {
                    collectionPrefixes.add(request.uri_prefix);
                }
            }
            const createPairs: OperationPair[] = [];
            const entityPairs: DocumentPair[] = [];
            for (const prefix of collectionPrefixes) {
                createPairs.push(...operationPairsAt(
                    requests, responses, prefix,
                ));
                entityPairs.push(...documentPairsAt(
                    requests, responses, prefix,
                ));
            }
            const createPairsByWorkOrder = Map.groupBy(
                createPairs, (pair) => pair.uriId,
            );
            const entityPairsByWorkOrder = Map.groupBy(
                entityPairs, (pair) => pair.uriId,
            );

            // Gate 5a's own rows, reused (not re-read) here: a
            // claim released through the standalone PUT
            // states/:id address (deleteWorkOrderClaim) is
            // invisible to this reader's own claim/transition op
            // pairs, yet the live route's prior-claim decision
            // DOES see it (its in-tx getAllFor reads every
            // address). Grouped by entity_id so each work order's
            // replay merges only its OWN rows (priorClaimCandidates
            // above).
            const statesAddressByWorkOrder = Map.groupBy(
                eventPairStatesFrom(requests, responses),
                (row) => row.entity_id,
            );

            const claimPrefixByWorkOrder = new Map<Id, string>();
            const transitionPrefixByWorkOrder =
                new Map<Id, string>();
            for (const request of requests) {
                const claimMatch = WORK_ORDER_CLAIM_PATTERN.exec(
                    request.uri_prefix,
                );
                if (claimMatch !== null) {
                    claimPrefixByWorkOrder.set(
                        claimMatch[1]!, request.uri_prefix,
                    );
                }
                const transitionMatch =
                    WORK_ORDER_TRANSITION_PATTERN.exec(
                        request.uri_prefix,
                    );
                if (transitionMatch !== null) {
                    transitionPrefixByWorkOrder.set(
                        transitionMatch[1]!, request.uri_prefix,
                    );
                }
            }

            const workOrderIds = new Set<Id>([
                ...createPairsByWorkOrder.keys(),
                ...claimPrefixByWorkOrder.keys(),
                ...transitionPrefixByWorkOrder.keys(),
            ]);

            const events: StateEntity[] = [];
            for (const workOrderId of workOrderIds) {
                const claimPrefix =
                    claimPrefixByWorkOrder.get(workOrderId);
                const transitionPrefix =
                    transitionPrefixByWorkOrder.get(workOrderId);
                const claimPairs = claimPrefix === undefined
                    ? []
                    : operationPairsAt(
                        requests, responses, claimPrefix,
                    );
                const transitionPairs =
                    transitionPrefix === undefined
                        ? []
                        : operationPairsAt(
                            requests, responses, transitionPrefix,
                        );
                events.push(...replayWorkOrderOperations(
                    createPairsByWorkOrder.get(workOrderId) ?? [],
                    entityPairsByWorkOrder.get(workOrderId) ?? [],
                    statesAddressByWorkOrder.get(workOrderId) ?? [],
                    claimPairs,
                    transitionPairs,
                    workOrderId,
                ));
            }
            return events.sort(atIdCompare);
        },
    );
}

// ---- deriveMemberGenesis — the member create-op reader (gate 5c)

// Source (c) of the states-log union. A human/AI member's OWN
// genesis event never rides the states/:id address (source a) nor
// the member's own document address (members/:id or {ai,human}-
// members/:id carry no trio — api/routes.ts's
// memberDocumentEntityOf and the {ai,human}MemberDetailBodyOf
// sidecars never mention state). It rides the CREATE-OP pair BODY
// instead — POST /ai-members or POST /human-members, validated by
// AI_MEMBER_CREATE_KEYS/HUMAN_MEMBER_CREATE_KEYS (api/
// validators.ts): {id, detail, initialState, initialStateEventId,
// initialStateAt}. Authorship (member_id) is the pair's OWN
// requester — "stamped from the verified caller in the route,
// never the body" (validateHumanMemberCreateBody's own header) —
// mirroring deriveEventPairStates' identical member_id sourcing
// above, never a body field. Both families are GLOBAL plane
// (family-registry.ts: organizationNested: false for both), so
// their prefixes are flat, like INVITATIONS_PREFIX below. A
// member's LATER archive/reactivate rides PUT states/:id instead
// (source a) — this reader covers ONLY the one-time genesis.
const AI_MEMBERS_PREFIX =
    canonicalUriPrefix(undefined, '/ai-members/');
const HUMAN_MEMBERS_PREFIX =
    canonicalUriPrefix(undefined, '/human-members/');

export async function deriveMemberGenesis(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            const rows: StateEntity[] = [];
            for (const prefix of [
                AI_MEMBERS_PREFIX, HUMAN_MEMBERS_PREFIX,
            ]) {
                for (const pair of operationPairsAt(
                    requests, responses, prefix,
                )) {
                    rows.push({
                        id: pickString(
                            pair.body, 'initialStateEventId',
                        ),
                        entity_id: pickString(pair.body, 'id'),
                        state: pickString(
                            pair.body, 'initialState',
                        ),
                        member_id: pair.requesterIdentityId,
                        at: pickString(
                            pair.body, 'initialStateAt',
                        ),
                    });
                }
            }
            return rows.sort(byIdAscending);
        },
    );
}

// ---- deriveFlowGraphStates — the flow-graph sidecar reader ------
// ---- (gate 5e) ---------------------------------------------------

// Source (e) of the states-log union. flow_nodes/flow_edges carry
// no address of their own (see graphDeltaHasMember's own header
// above) — their 'deleted'/'restored' lifecycle rides, as
// SIDECARS, on the FLOW's own document-pair body:
// writeFlowGraphDelta's deletions array posts 'deleted'
// unconditionally for every entry, on every PUT (api/routes.ts);
// postFlowDocumentOp's own revivals loop posts 'restored' the same
// way, right after — both authored by the pair's OWN requester
// (the route's stamped `actor`, the same identity as
// pair.requesterIdentityId). Scanning EVERY document pair (never
// merely the head) finds every such event ever recorded, across
// every PUT to every flow — a create pair's own deletions/revivals
// are always empty ("a fresh flow tombstones nothing",
// postFlowCreationOp's own comment), so this source contributes
// nothing for a never-edited flow. The dedicated 'flows/:id/undo'
// route (and redo, which reuses the same route) synthesizes its
// OWN document pair at the SAME 'flows/:id' address (routes.ts:
// formDocumentPairFor defaults method to PUT), so its own
// deletions/revivals ride the same scan with no special case.
//
// UNLIKE the invitation ops (source f, below), a flow PUT carries
// no idempotent-resend covenant of its own beyond the gate's
// byte-identical requestHash fast path (which never reaches this
// body a second time) — so no cross-referencing is needed here:
// every deletions/revivals entry documentPairsAt surfaces
// genuinely posted its own states event.
//
// entity_id here is a flow-NODE or flow-EDGE id, never the flow's
// own id — resolveFlowGraphOwner (gate 4, above) already resolves
// its owner by finding that SAME id among the flow's OWN
// graphDelta.nodes/.edges upserts, which always precede (or
// coincide with) the deletion/revival that names it: a node/edge
// must exist before it can be deleted or restored.
function graphSidecarRows(
    entries: unknown,
    state: string,
    memberId: Id,
): StateEntity[] {
    if (!Array.isArray(entries)) return [];
    const rows: StateEntity[] = [];
    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null) continue;
        const fields = entry as Record<string, unknown>;
        rows.push({
            id: pickString(fields, 'eventId'),
            entity_id: pickString(fields, 'entityId'),
            state,
            member_id: memberId,
            at: pickString(fields, 'at'),
        });
    }
    return rows;
}

const FLOWS_ADDRESS_PATTERN =
    /^\/organizations\/[^/]+\/flows\/$/;

export async function deriveFlowGraphStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            const prefixes = new Set<string>();
            for (const request of requests) {
                if (
                    FLOWS_ADDRESS_PATTERN.test(request.uri_prefix)
                ) {
                    prefixes.add(request.uri_prefix);
                }
            }
            const rows: StateEntity[] = [];
            for (const prefix of prefixes) {
                for (const pair of documentPairsAt(
                    requests, responses, prefix,
                )) {
                    const delta = pair.body['graphDelta'];
                    const deletions =
                        typeof delta === 'object' && delta !== null
                            ? (delta as
                                Record<string, unknown>)[
                                    'deletions'
                                ]
                            : undefined;
                    rows.push(...graphSidecarRows(
                        deletions, 'deleted',
                        pair.requesterIdentityId,
                    ));
                    rows.push(...graphSidecarRows(
                        pair.body['revivals'], 'restored',
                        pair.requesterIdentityId,
                    ));
                }
            }
            return rows.sort(byIdAscending);
        },
    );
}

// ---- deriveInvitationStates — the invitation lifecycle reader ---
// ---- (gate 5f) ---------------------------------------------------

// Source (f) of the states-log union. An invitation's own states
// never ride the states/:id address (source a) — the invitations
// side channel forms its own operation pairs at the flat
// '/invitations/' collection (the grant) and at
// 'invitations/:id/<op>/' (the three answering ops), api/
// invitations-domain.ts's own formWritePair/formInvitationOpPair
// calls. Deliberately NOT built atop deriveInvitations/
// invitationOpStates (api/derive-invitations.ts) — both resolve
// only a RESOLVED CURRENT STATE and DISCARD the event id and
// member_id a StateEntity row needs (the brief's own NOTE) — this
// is a fresh, StateEntity-emitting extraction over the SAME two
// address families, never a retrofit of either.
//
// THE GRANT'S OWN DUPLICATE-ECHO (grantInvitation, api/invitations-
// domain.ts): an ALREADY-pending (org, identity) pair still forms
// its OWN operation pair at whatever invitationId the SECOND
// caller submitted (the 'existing' outcome branch) — but writes
// NEITHER a states event NOR a document there. Cross-referencing
// against the invitation's DOCUMENT plane (formed ONLY on the
// 'fresh' outcome, at the SAME invitationId) excludes that phantom
// pair: a document exists at an id iff its grant operation pair
// genuinely posted 'pending'.
//
// THE ANSWERING OPS' OWN NO-OP RESENDS (accept/decline/revoke):
// each is idempotent on its OWN already-reached terminal state (a
// re-accept/re-decline/re-revoke still forms an operation pair but
// posts NO event) — mutual exclusivity across the three op KINDS
// is the domain gate's own covenant (derive-invitations.ts's
// header), so at most one op kind ever succeeds per invitation,
// but THAT kind can still accumulate repeat pairs. Since
// appendMessagePair mints each pair's response `at` synchronously
// inside its own (serialized) transaction, the group's
// chronologically EARLIEST (at, id) pair is always the one that
// found the invitation still 'pending' and genuinely posted the
// event — operationPairsAt already returns each group (at, id)
// ascending, so its first entry is that pair.
const INVITATION_OP_ADDRESS_PATTERN =
    /^\/invitations\/([^/]+)\/(acceptance|decline|revocation)\/$/;

interface InvitationOpFields {
    readonly state: string;
    readonly eventIdField: string;
    readonly atField: string;
}

const INVITATION_OP_FIELDS: Readonly<
    Record<string, InvitationOpFields>
> = {
    acceptance: {
        state: 'accepted',
        eventIdField: 'acceptEventId',
        atField: 'acceptAt',
    },
    decline: {
        state: 'declined',
        eventIdField: 'declineEventId',
        atField: 'declineAt',
    },
    revocation: {
        state: 'revoked',
        eventIdField: 'revokeEventId',
        atField: 'revokeAt',
    },
};

export async function deriveInvitationStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            const rows: StateEntity[] = [];

            const documentIds = new Set(
                documentPairsAt(
                    requests, responses, INVITATIONS_PREFIX,
                ).map((pair) => pair.uriId),
            );
            for (const pair of operationPairsAt(
                requests, responses, INVITATIONS_PREFIX,
            )) {
                if (!documentIds.has(pair.uriId)) continue;
                rows.push({
                    id: pickString(pair.body, 'grantEventId'),
                    entity_id: pair.uriId,
                    state: 'pending',
                    member_id: pair.requesterIdentityId,
                    at: pickString(pair.body, 'grantAt'),
                });
            }

            const opPrefixes = new Set<string>();
            for (const request of requests) {
                if (INVITATION_OP_ADDRESS_PATTERN.test(
                    request.uri_prefix,
                )) {
                    opPrefixes.add(request.uri_prefix);
                }
            }
            for (const prefix of opPrefixes) {
                const match =
                    INVITATION_OP_ADDRESS_PATTERN.exec(prefix)!;
                const fields = INVITATION_OP_FIELDS[match[2]!];
                if (fields === undefined) continue;
                const earliest = operationPairsAt(
                    requests, responses, prefix,
                )[0];
                if (earliest === undefined) continue;
                rows.push({
                    id: pickString(
                        earliest.body, fields.eventIdField,
                    ),
                    entity_id: match[1]!,
                    state: fields.state,
                    member_id: earliest.requesterIdentityId,
                    at: pickString(earliest.body, fields.atField),
                });
            }

            return rows.sort(byIdAscending);
        },
    );
}

// ---- deriveTrioFamilyStates — the trio families' state history --
// ---- wiring (gate 5b) --------------------------------------------

// Source (b) of the states-log union. Each trio family's own
// per-id state-history reader is IMPORTED, never rebuilt — the
// entity/lifecycle knowledge lives in its OWN module (derive-
// ideas.ts/derive-projects.ts/derive-records.ts/derive-flows.ts),
// each already drift-tested against the real states table. This
// function's own job is narrower: discover EVERY id that ever had
// a document pair at the family's own prefix — via documentPairsAt,
// the shared family-agnostic reduction (derive-documents.ts),
// NEVER the family's own document derivation — so an id whose
// CURRENT head is a hard DELETE (records only, Author gate 9) is
// still walked: its earlier trio-embedded transitions belong on
// the real states log forever (append-only), even after the
// document itself is gone.
interface TrioFamily {
    readonly prefix: string;
    readonly stateHistory: (
        db: DbAdapter, organization: Id, id: Id,
    ) => Promise<StateEntity[]>;
}

function trioFamiliesFor(organization: Id): readonly TrioFamily[] {
    return [
        {
            prefix: canonicalUriPrefix(organization, '/ideas/'),
            stateHistory: deriveIdeaStateHistory,
        },
        {
            prefix: canonicalUriPrefix(organization, '/projects/'),
            stateHistory: deriveProjectStateHistory,
        },
        {
            prefix: canonicalUriPrefix(organization, '/records/'),
            stateHistory: deriveRecordStateHistory,
        },
        {
            prefix: canonicalUriPrefix(organization, '/flows/'),
            stateHistory: deriveFlowStateHistory,
        },
    ];
}

async function deriveTrioFamilyStates(
    db: DbAdapter,
    organization: Id,
): Promise<StateEntity[]> {
    const perFamily = await Promise.all(
        trioFamiliesFor(organization).map(async (family) => {
            const [requests, responses] = await Promise.all([
                db.requests.getAllWhere(
                    'uri_prefix', family.prefix,
                ),
                db.responses.getAllWhere(
                    'uri_prefix', family.prefix,
                ),
            ]);
            const ids = new Set(
                documentPairsAt(
                    requests, responses, family.prefix,
                ).map((pair) => pair.uriId),
            );
            const perId = await Promise.all(
                [...ids].map((id) =>
                    family.stateHistory(db, organization, id)),
            );
            return perId.flat();
        }),
    );
    return perFamily.flat();
}

// ---- deriveStates / deriveStatesFor — the SIX-source union ------
// ---- (Task 5) ------------------------------------------------------

// WHY SIX, NOT SEVEN: objectives need no source of their own — an
// objective's archive/reactivate are states/:id pairs like any
// other entity's (source (a) already carries them), and a fresh
// objective has NO genesis event at all (absence IS active), so
// there is no genesis row for a seventh source to derive.
//
// The union invariant every id in the merged set is checked
// against: IDENTICAL content across sources is a harmless (never
// expected in practice, since every source above reads a DISJOINT
// address family) double-derivation; DIFFERING content at the SAME
// id is a bug in one of the six sources and must crash loud — never
// a silent last-writer-wins pick (Commandment I: Reliability; the
// Sin of Swallowed Failures).
function sameStateEntity(a: StateEntity, b: StateEntity): boolean {
    return a.id === b.id
        && a.entity_id === b.entity_id
        && a.state === b.state
        && a.member_id === b.member_id
        && a.at === b.at;
}

function unionById(
    sources: readonly (readonly StateEntity[])[],
): StateEntity[] {
    const byId = new Map<Id, StateEntity>();
    for (const rows of sources) {
        for (const row of rows) {
            const existing = byId.get(row.id);
            if (existing === undefined) {
                byId.set(row.id, row);
                continue;
            }
            if (!sameStateEntity(existing, row)) {
                throw new Error(
                    'deriveStates: colliding states rows found'
                    + ' for id ' + row.id,
                );
            }
        }
    }
    return [...byId.values()];
}

// The full union (gate 5, all six sources), fenced to
// boundOrganization and returned in the states table's own
// id-lex order (byIdAscending) — the order Task 7's route flip
// will serve.
export async function deriveStates(
    db: DbAdapter,
    boundOrganization: Id,
): Promise<StateEntity[]> {
    const sources = await Promise.all([
        deriveEventPairStates(db),
        deriveTrioFamilyStates(db, boundOrganization),
        deriveMemberGenesis(db),
        deriveWorkOrderLifecycle(db),
        deriveFlowGraphStates(db),
        deriveInvitationStates(db),
    ]);
    const merged = unionById(sources);
    const fenced = await fenceStatesByOwner(
        db, merged, boundOrganization,
    );
    return fenced.sort(byIdAscending);
}

// The entity's OWN subset — no family-classification shortcut
// exists (resolveOwningOrganization resolves an OWNING
// ORGANIZATION, never which of the six sources an id belongs to),
// so every source is queried and the result filtered by entity_id:
// an id only ever appears in ONE source's own address family, so
// the filter alone disambiguates — no dedup-assert is needed here
// (unlike deriveStates above), since no genuine cross-source
// collision is possible once filtered to one entity. organization
// is REQUIRED — the four trio derives are org-prefixed and cannot
// resolve their own address without it. Never a visibility fence
// here, unlike deriveStates' own fenceStatesByOwner call — the
// caller already names both the org AND the entity.
//
// PRECONDITION: callers must already have established
// entityId's visibility to `organization` before calling — the
// route's own gate (api/api.ts's entity-states/:id[/history]
// guard, ownerOrganizationOfEntity) IS the fence. A caller that
// trusts an unverified (organization, entityId) pairing reads
// another organization's rows.
export async function deriveStatesFor(
    db: DbAdapter,
    organization: Id,
    entityId: Id,
): Promise<StateEntity[]> {
    const [
        eventPairRows,
        ideaRows, projectRows, recordRows, flowRows,
        memberGenesisRows, workOrderRows,
        flowGraphRows, invitationRows,
    ] = await Promise.all([
        deriveEventPairStates(db),
        deriveIdeaStateHistory(db, organization, entityId),
        deriveProjectStateHistory(db, organization, entityId),
        deriveRecordStateHistory(db, organization, entityId),
        deriveFlowStateHistory(db, organization, entityId),
        deriveMemberGenesis(db),
        deriveWorkOrderLifecycle(db),
        deriveFlowGraphStates(db),
        deriveInvitationStates(db),
    ]);
    const rows = [
        ...eventPairRows,
        ...ideaRows, ...projectRows, ...recordRows, ...flowRows,
        ...memberGenesisRows, ...workOrderRows,
        ...flowGraphRows, ...invitationRows,
    ].filter((row) => row.entity_id === entityId);
    return rows.sort(atIdCompare);
}
