import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from './db.ts';
import type {
    Id, RequestEntity, ResponseEntity, StateEntity,
    TransitionFieldValueEntity,
    WorkOrderEntity,
    WorkOrderHistoryEventEntity,
} from './types.ts';
import { MS_PER_SECOND } from './types.ts';
import {
    pickString, pickNumber, asObject,
    asWorkOrderFlowGraph,
} from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import {
    documentPairsAt,
    deriveDocumentsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    byIdAscending,
    type DocumentPair,
} from './derive-documents.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    latestClaimEvent,
    addUtcSeconds,
} from './work-order-claims.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';

// Pair-plane lifecycle derives and ownership resolution
// (Phase 11
// onward; bulk lifecycle collection retired — states-URI
// elimination C3). Per-entity history rides GET
// <family>/:id/history; work-order and objective bulk history
// ride GET work-orders/history and GET objectives/history.
// Surviving derives in this module:
//   (a) trio families — per-id derive*StateHistory readers live
//       in their own family modules (ideas/projects/records/
//       flows/objectives); write paths use family
//       currentDocumentState / row-stamped trios.
//   (b) deriveMemberStates — members/:id document trio history.
//   (c) deriveWorkOrderLifecycle / workOrderLifecycleStatesFor /
//       workOrderHistoryFor / deriveWorkOrderHistories — the
//       work-order op-pair replay (gate 5d).
//   (d) flow-graph node/edge sidecars — live on the flow
//       document-pair body (graphDelta.deletions / revivals);
//       resolveFlowGraphOwner below resolves their owners.
//       No bulk derive remains (C3).
//   (e) deriveInvitationStates / invitationLifecycleStatesFor —
//       invitation grant + three answering ops (gate 5f).
// bare states/:id, the per-entity history alias, the bulk
// lifecycle collection, the five-source union (deriveStates),
// and nested field-values collection are RETIRED (C3/C4).
//
// THE GATE-15 PRECEDENT (Phase 10): an org fence can be
// reproduced from the MEMBERSHIP PAIR PLANE. This module's
// resolveOwningOrganization / resolveGlobalOwner /
// stateEventVisibilityFor / missedReadError apply that
// technique for ownership and event-id fences.
//
// IMMUNE TO THE DELETED FILTER: requests/responses are append-
// only, so a family's document pair still names its organization
// forever, regardless of the entity's later lifecycle state.

// ---- resolveOwningOrganization — the PAIR-PLANE fence (gate 4) -

// The org-owned, org-nested document families whose OWN id can
// appear as a states.entity_id — mirrors
// api/store-parent-scoped.ts's rawOrganizationOwnedProbes table
// exactly (ideas, projects, flows, records, objectives,
// work-orders); invitations is handled separately below (its
// address is flat, never organization-nested — message-pair.ts's
// canonicalUriCollection / family-registry.ts has no entry for it).
const ORGANIZATION_NESTED_ENTITY_FAMILIES = [
    'ideas', 'projects', 'flows',
    'work-orders', 'record-types', 'objectives',
] as const;

const INVITATIONS_PREFIX =
    canonicalUriCollection(undefined, '/invitations/');

// organizations is the tenant root (global plane, never itself
// organization-nested — derive-organizations.ts). An
// organizations document id resolves to itself (Phase 15 Task
// 1, Author gate 3 — the ONE new resolveOwningOrganization
// leg).
const ORGANIZATIONS_ADDRESS_PREFIX =
    canonicalUriCollection(undefined, '/organizations/');

// ALL-orgs, server-side ownership resolution — distinct from
// api/organization-requests.ts's enumerateMyOrganizations, which
// filters to the caller's own memberships. This walk NEVER
// filters by caller: it resolves which org OWNS an entity,
// independent of who is asking (Phase 12 Task 5: the row source
// flips to the pair-plane derivation; the ALL-orgs, uncaller-
// filtered shape is untouched).
async function organizationIds(
    db: DbAdapter,
): Promise<readonly Id[]> {
    const organizations = await deriveOrganizations(db);
    return organizations.map((organization) => organization.id);
}

// The invitation's own organization_id — carried in the STORED
// REQUEST body (derive-invitations.ts's own precedent), never the
// uri_collection (the invitations address is flat, unlike every
// org-nested family above). Address read of this id at the
// invitations collection — the same head fold, reused rather
// than reimplemented.
async function resolveInvitationOwner(
    db: DbAdapter,
    entityId: Id,
): Promise<Id | null> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllAtAddress(
            INVITATIONS_PREFIX, entityId,
        ),
        db.responses.getAllAtAddress(
            INVITATIONS_PREFIX, entityId,
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
        const prefix = canonicalUriCollection(organization, '/flows/');
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_collection', prefix),
            db.responses.getAllWhere('uri_collection', prefix),
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
// id, i.e. an identity id): seats are organization-nested, so
// there is no single address to scan — THE GATE-15 PRECEDENT
// unions the same per-org derivation across every known
// organization instead.
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
    const seatPrefix = '/organizations/' + organization
        + '/members/';
    const [seatRequests, seatResponses] =
        await Promise.all([
            db.requests.getAllAtAddress(
                seatPrefix, identityId,
            ),
            db.responses.getAllAtAddress(
                seatPrefix, identityId,
            ),
        ]);
    return deriveDocumentsAt(
        seatRequests, seatResponses, seatPrefix,
    ).has(identityId);
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
    // (e) organizations self-as-owner: the document id IS
    // the owning organization. Address read of this id at
    // the organizations collection.
    const organizationRows =
        await db.responses.getAllAtAddress(
            ORGANIZATIONS_ADDRESS_PREFIX, entityId,
        );
    if (organizationRows.length > 0) {
        return entityId;
    }

    // (a) org-nested document families: probe each known
    // organization's family collection. Same id at two
    // collections is two documents; this walk still answers
    // "who owns this id anywhere" for visibility.
    const organizations = await organizationIds(db);
    const ordered = [
        boundOrganization,
        ...organizations.filter((o) => o !== boundOrganization),
    ];
    for (const organization of ordered) {
        for (
            const family of ORGANIZATION_NESTED_ENTITY_FAMILIES
        ) {
            const prefix = canonicalUriCollection(
                organization, '/' + family + '/',
            );
            const rows =
                await db.responses.getAllAtAddress(
                    prefix, entityId,
                );
            if (rows.length > 0) {
                return organization;
            }
        }
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

// The PAIR-PLANE fence resolver (gate 4 + Phase 15 gate 3).
// Resolves entityId's owning organization across the five
// sources above (org-nested, invitations, flow-graph,
// membership, organizations self-as-owner), or null for a
// genuine orphan (no pair anywhere names the entity).
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

// Address-scoped 403-vs-404 probe. Same id at two
// collections is two documents. Miss at THIS address is
// 404. 403 only when this address has a live PUT the
// caller may not have.
const ROLE_GRANTS_URI_PREFIX =
    canonicalUriCollection(undefined, '/role-grants/');

// Organization-nested document prefixes:
// /organizations/{id}/...
const ORGANIZATION_NESTED_URI_PREFIX =
    /^\/organizations\/([^/]+)\//;

// Table → family path segment for the address-scoped
// owner probe. Nested children (flow tags/records,
// attributes, instances) probe the parent family at
// this organization.
const OWNER_PROBE_FAMILY: Record<string, string> = {
    ideas: 'ideas',
    projects: 'projects',
    flows: 'flows',
    work_orders: 'work-orders',
    record_types: 'record-types',
    record_attributes: 'record-types',
    record_instances: 'record-types',
    objectives: 'objectives',
    memberships: 'memberships',
    flow_records: 'flows',
    flow_tags: 'flows',
};

function ownerProbeCollection(
    organization: Id,
    table: string,
): string | undefined {
    if (table === 'organizations') {
        return ORGANIZATIONS_ADDRESS_PREFIX;
    }
    if (table === 'invitations') {
        return INVITATIONS_PREFIX;
    }
    if (table === 'organization_members') {
        return '/organizations/' + organization
            + '/members/';
    }
    if (table === 'role_grants') {
        return ROLE_GRANTS_URI_PREFIX;
    }
    const family = OWNER_PROBE_FAMILY[table];
    if (family === undefined) return undefined;
    return canonicalUriCollection(
        organization, '/' + family + '/',
    );
}

function responseBodyOf(
    message: string,
): Record<string, unknown> {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

function ownerFromAddress(
    uriCollection: string,
    uriId: Id,
    message: string,
): Id | null {
    if (uriCollection === ORGANIZATIONS_ADDRESS_PREFIX) {
        return uriId;
    }
    const nested = ORGANIZATION_NESTED_URI_PREFIX.exec(
        uriCollection,
    );
    if (nested !== null) return nested[1]!;
    if (
        uriCollection === ROLE_GRANTS_URI_PREFIX
        || uriCollection === INVITATIONS_PREFIX
    ) {
        const body = responseBodyOf(message);
        const organizationId = body['organization_id'];
        if (typeof organizationId === 'string') {
            return organizationId;
        }
    }
    return null;
}

export async function resolveGlobalOwner(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
    table?: string,
): Promise<Id | null> {
    const collection = table === undefined
        ? undefined
        : ownerProbeCollection(boundOrganization, table);
    if (collection !== undefined) {
        const atAddress =
            await db.responses.getAllAtAddress(
                collection, entityId,
            );
        if (atAddress.length === 0) return null;
        for (const response of atAddress) {
            const owner = ownerFromAddress(
                response.uri_collection,
                entityId,
                response.message,
            );
            if (owner !== null) return owner;
        }
        return boundOrganization;
    }
    return resolveOwningOrganization(
        db, entityId, boundOrganization,
    );
}

// Miss-path 403-vs-404 helper for org-scoped reads. Probe
// THIS route's collection, not any row with this id.
// owner-null → EntityNotFoundError (404); foreign →
// ForeignOrganizationError (403). probeId defaults to id;
// pass a parent id when the miss is on a nested child
// (e.g. flow records probe the parent flow).
export async function missedReadError(
    db: DbAdapter,
    id: Id,
    organization: Id,
    table: string,
    probeId: Id = id,
): Promise<EntityNotFoundError | ForeignOrganizationError> {
    const owner = await resolveGlobalOwner(
        db, probeId, organization, table,
    );
    if (owner !== null && owner !== organization) {
        return new ForeignOrganizationError(table, id);
    }
    return new EntityNotFoundError(table, id);
}

// fenceStatesByOwner RETIRED with the bulk lifecycle
// collection (states-URI elimination C3). Per-entity and
// collection history routes fence via
// resolveOwningOrganization / missedReadError directly;
// stateEventVisibilityFor covers event-id reads.

// ---- stateEventVisibilityFor — the field-values fence --------
// ---- successor (Phase 15 Task 1, Author gate 2) --------------

// Three-way disposition matching the retired
// isVisibleStateEvent row-plane branches (now re-pointed
// onto this function, Phase 15 Task 3): (1) nowhere — a
// visible orphan; (2) own-org (or owner-null entity) —
// visible; (3) foreign — hidden. The return type is PART of
// the gate, not an implementation detail. Boolean isVisible
// folds as `visibility !== 'hidden'`.
export type StateEventVisibility =
    | 'orphan'
    | 'visible'
    | 'hidden';

// Does a request body name `eventId` as an op-born state
// event? Covers document-trio state_event_id, work-order
// create/claim/transition ids, invitation lifecycle ids,
// member genesis, and flow-graph deletion/revival sidecars.
function bodyNamesStateEvent(
    body: Record<string, unknown>,
    eventId: Id,
): boolean {
    if (body['state_event_id'] === eventId) return true;
    if (body['claimEventId'] === eventId) return true;
    if (body['expireEventId'] === eventId) return true;
    if (body['transitionEventId'] === eventId) return true;
    if (body['releaseEventId'] === eventId) return true;
    if (body['grantEventId'] === eventId) return true;
    if (body['acceptEventId'] === eventId) return true;
    if (body['declineEventId'] === eventId) return true;
    if (body['revokeEventId'] === eventId) return true;
    if (body['initialStateEventId'] === eventId) {
        return true;
    }
    const stateEventIds = body['stateEventIds'];
    if (
        Array.isArray(stateEventIds)
        && stateEventIds.includes(eventId)
    ) {
        return true;
    }
    const release = body['release'];
    if (
        typeof release === 'object'
        && release !== null
        && (release as Record<string, unknown>)['id']
            === eventId
    ) {
        return true;
    }
    const delta = body['graphDelta'];
    if (typeof delta === 'object' && delta !== null) {
        const deletions = (delta as Record<string, unknown>)[
            'deletions'
        ];
        if (Array.isArray(deletions)) {
            for (const entry of deletions) {
                if (
                    typeof entry === 'object'
                    && entry !== null
                    && (entry as Record<string, unknown>)[
                        'eventId'
                    ] === eventId
                ) {
                    return true;
                }
            }
        }
    }
    const revivals = body['revivals'];
    if (Array.isArray(revivals)) {
        for (const entry of revivals) {
            if (
                typeof entry === 'object'
                && entry !== null
                && (entry as Record<string, unknown>)[
                    'eventId'
                ] === eventId
            ) {
                return true;
            }
        }
    }
    return false;
}

// Tier (i)/(ii): does any of this organization's op-pair
// families name eventId? Indexed prefix reads only (the
// workOrderClaimSourcesFor shape) — never a whole-plane
// getAll of requests/responses.
async function organizationHasOpBornEvent(
    dbOrView: DbAdapter,
    organization: Id,
    eventId: Id,
): Promise<boolean> {
    for (
        const family of ORGANIZATION_NESTED_ENTITY_FAMILIES
    ) {
        const prefix = canonicalUriCollection(
            organization, '/' + family + '/',
        );
        const [requests, responses] = await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_collection', prefix,
            ),
            dbOrView.responses.getAllWhere(
                'uri_collection', prefix,
            ),
        ]);
        for (const pair of documentPairsAt(
            requests, responses, prefix,
        )) {
            if (bodyNamesStateEvent(pair.body, eventId)) {
                return true;
            }
        }
        for (const pair of operationPairsAt(
            requests, responses, prefix,
        )) {
            if (bodyNamesStateEvent(pair.body, eventId)) {
                return true;
            }
        }
    }

    // Claim/transition ride per-work-order sub-prefixes.
    // Discover work-order ids from the collection responses
    // already readable via the work-orders family scan above
    // — re-read that one prefix for the id set, then probe
    // each sub-resource with an indexed uri_collection read.
    const workOrdersPrefix = canonicalUriCollection(
        organization, '/work-orders/',
    );
    const workOrderResponses =
        await dbOrView.responses.getAllWhere(
            'uri_collection', workOrdersPrefix,
        );
    const workOrderIds = new Set<Id>(
        workOrderResponses.map((r) => r.uri_id),
    );
    for (const workOrderId of workOrderIds) {
        for (const sub of [
            'claim', 'transition', 'release',
        ] as const) {
            const prefix = canonicalUriCollection(
                organization,
                '/work-orders/' + workOrderId
                    + '/' + sub + '/',
            );
            const [requests, responses] = await Promise.all([
                dbOrView.requests.getAllWhere(
                    'uri_collection', prefix,
                ),
                dbOrView.responses.getAllWhere(
                    'uri_collection', prefix,
                ),
            ]);
            for (const pair of operationPairsAt(
                requests, responses, prefix,
            )) {
                if (
                    bodyNamesStateEvent(pair.body, eventId)
                ) {
                    return true;
                }
            }
        }
    }

    // Member genesis (global plane): initialStateEventId rides
    // the human/AI create-op body. Live create writes the
    // states row + op body but no states/:id pair and no
    // membership — disposition via resolveOwningOrganization
    // (null → visible to every asker; own/foreign as usual),
    // matching the row-plane owner-null isVisible rule. The
    // membership boolean alone would mis-orphan unowned
    // genesis events (create never mints a membership).
    for (const prefix of [
        canonicalUriCollection(undefined, '/ai-members/'),
        canonicalUriCollection(undefined, '/human-members/'),
    ]) {
        const [requests, responses] = await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_collection', prefix,
            ),
            dbOrView.responses.getAllWhere(
                'uri_collection', prefix,
            ),
        ]);
        for (const pair of operationPairsAt(
            requests, responses, prefix,
        )) {
            if (!bodyNamesStateEvent(pair.body, eventId)) {
                continue;
            }
            const owner = await resolveOwningOrganization(
                dbOrView, pair.uriId, organization,
            );
            if (
                owner === null
                || owner === organization
            ) {
                return true;
            }
        }
    }

    // Invitations (flat address): organization lives in the
    // grant body; answering ops nest under invitations/:id/.
    {
        const [requests, responses] = await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_collection', INVITATIONS_PREFIX,
            ),
            dbOrView.responses.getAllWhere(
                'uri_collection', INVITATIONS_PREFIX,
            ),
        ]);
        for (const pair of operationPairsAt(
            requests, responses, INVITATIONS_PREFIX,
        )) {
            if (
                bodyNamesStateEvent(pair.body, eventId)
                && pickString(pair.body, 'organization_id')
                    === organization
            ) {
                return true;
            }
        }
        const invitationIds = new Set<Id>(
            responses.map((r) => r.uri_id),
        );
        for (const invitationId of invitationIds) {
            for (const sub of [
                'acceptance', 'decline', 'revocation',
            ] as const) {
                const prefix = canonicalUriCollection(
                    undefined,
                    '/invitations/' + invitationId
                        + '/' + sub + '/',
                );
                const [opRequests, opResponses] =
                    await Promise.all([
                        dbOrView.requests.getAllWhere(
                            'uri_collection', prefix,
                        ),
                        dbOrView.responses.getAllWhere(
                            'uri_collection', prefix,
                        ),
                    ]);
                for (const pair of operationPairsAt(
                    opRequests, opResponses, prefix,
                )) {
                    if (!bodyNamesStateEvent(
                        pair.body, eventId,
                    )) {
                        continue;
                    }
                    // Answering ops carry no organization_id;
                    // ownership is the invitation's own.
                    const owner =
                        await resolveInvitationOwner(
                            dbOrView, invitationId,
                        );
                    if (owner === organization) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// Tiered pair-plane visibility disposition (successor of the
// retired isVisibleStateEvent row-plane fence; live callers
// re-pointed Phase 15 Task 3). Always view-accepting
// (dbOrView); opens no nested transaction. The states/:id
// event-append tier is RETIRED with the address itself —
// cheapest remaining first:
//   (i) own-org op-pair family scan — op-born claim /
//       transition / document-trio ids;
//   (ii) widen-on-miss cross-org scan — foreign vs nowhere,
//       only on the rare miss tail.
export async function stateEventVisibilityFor(
    dbOrView: DbAdapter,
    boundOrganization: Id,
    eventId: Id,
): Promise<StateEventVisibility> {
    // (i) own-org op-born scan.
    if (
        await organizationHasOpBornEvent(
            dbOrView, boundOrganization, eventId,
        )
    ) {
        return 'visible';
    }

    // (ii) widen-on-miss: distinguish foreign from nowhere.
    for (const organization of await organizationIds(
        dbOrView,
    )) {
        if (organization === boundOrganization) continue;
        if (
            await organizationHasOpBornEvent(
                dbOrView, organization, eventId,
            )
        ) {
            return 'hidden';
        }
    }
    return 'orphan';
}

// ---- deriveWorkOrderLifecycle — the op-pair reader (gate 5d) ---

// Source (c) of the states-log union — the only one that reads
// work-order CREATE/CLAIM/TRANSITION/RELEASE operation pairs.
// Seeded work orders (buildWorkOrders/buildLeadToCloseWorkload)
// form via a bare document PUT with ZERO operation pairs, so
// this function emits NOTHING for them; their births ride the
// work-order document trio (state_event_id on the document
// body) once the seed stage embeds them there. Output
// materializes ONLY for a work order created, claimed,
// transitioned, or released through the LIVE route
// (postWorkOrderCreationOp/postWorkOrderClaimOp/
// postWorkOrderTransitionOp/postWorkOrderReleaseOp).
//
// THE CREATE-PAIR RELAXATION (EDGE 1): a work order's create pair
// is a DOMAIN fact, not a defensive fallback — seeded work
// orders lack one (they were never created through this route),
// so its absence NEVER throws; it simply means this reader
// contributes no births for that id. Only a LIVE creation —
// and a caller's RETRY of one, each landing its OWN create pair
// at the same work-order id — contributes birth events, one
// three-slot array PER create pair found.
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

// The claim/transition/release sub-resource addresses: UNLIKE
// the collection prefix above, the work-order id rides the
// PREFIX itself here (routes.ts: 'work-orders/:id/claim' /
// 'work-orders/:id/transition' / retired
// 'work-orders/:id/release'), so each distinct match names
// ONE work order directly — captured, the organization
// segment is not (a work-order id is globally unique, so
// it is never needed to disambiguate).
const WORK_ORDER_CLAIM_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/([^/]+)\/claim\/$/;
// Exported (Phase 14 Task 6): api/derive-state-field-values.ts
// scans for this SAME prefix shape to find every transition's
// fieldValues fold, without re-deriving the address pattern.
export const WORK_ORDER_TRANSITION_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/([^/]+)\/transition\/$/;
const WORK_ORDER_RELEASE_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/([^/]+)\/release\/$/;

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
    const model = parseWire(message);
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

// Every successful (2xx) POST pair at `uriCollection`, (at, id)
// ascending. REUSED below by source (f)
// (deriveInvitationStates) — a flat, non-work-order
// collection's own 2xx POST pairs, the exact shape this
// function already reads generically. Source (c) once shared
// this scan (deriveMemberGenesis); the states-address
// retirement moved members onto the document-trio walk, so
// only invitations remain. Exported (Phase 14 Task 6):
// api/derive-state-field-values.ts's transition-fold reader
// reuses this SAME decode over the work-orders/:id/transition
// address, rather than re-implementing the POST-only,
// (at, id)-sorted read.
const POST_ONLY: ReadonlySet<string> = new Set(['POST']);
const POST_OR_PUT: ReadonlySet<string> = new Set([
    'POST', 'PUT',
]);

export function operationPairsAt(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
    uriCollection: string,
    methods: ReadonlySet<string> = POST_ONLY,
): OperationPair[] {
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const pairs: OperationPair[] = [];
    for (const response of responses) {
        if (response.uri_collection !== uriCollection) {
            continue;
        }
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        const decoded = decodeRequestOperation(request.message);
        if (!methods.has(decoded.method)) continue;
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

function documentDeletesAsOperations(
    pairs: readonly DocumentPair[],
): OperationPair[] {
    const out: OperationPair[] = [];
    for (const pair of pairs) {
        if (pair.method !== 'DELETE') continue;
        out.push({
            id: pair.id,
            at: pair.at,
            uriId: pair.uriId,
            body: pair.body,
            requesterIdentityId: pair.requesterIdentityId,
        });
    }
    return out;
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
    return asWorkOrderFlowGraph(
        head.body['flow_graph'],
        'work-order lifecycle document head flow_graph',
    ).lockTimeout;
}

// Every candidate event a claim pair's prior-claim decision may
// draw from: the replay's OWN emitted events so far (create
// births, prior claims/releases/transitions). Releases ride
// the release op pair now (postWorkOrderReleaseOp) — the
// retired standalone PUT states/:id path is no longer a
// candidate source. The `replayed` half is already bounded to
// "earlier" by the caller's own (at, id)-ordered processing;
// the strictly-before filter is kept so a future out-of-order
// merge cannot leak later events into the prior-claim decision.
function priorClaimCandidates(
    replayed: readonly StateEntity[],
    claim: OperationPair,
): StateEntity[] {
    return replayed
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
    claim: OperationPair,
    workOrderId: Id,
): void {
    const claimEventId = pickString(claim.body, 'claimEventId');
    const claimAt = pickString(claim.body, 'claimAt');
    const expireEventId = pickString(
        claim.body, 'expireEventId',
    );
    const expireAt = pickString(claim.body, 'expireAt');
    // Genesis claim document reuses the create pair's
    // claimed event id so GET/DELETE have a row; do not
    // emit a second claimed event.
    if (replayed.some((row) => row.id === claimEventId)) {
        return;
    }
    const lockTimeout = lockTimeoutAsOf(entityPairs, claim.at);
    const prior = latestClaimEvent(
        priorClaimCandidates(replayed, claim),
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

// Replays postWorkOrderReleaseOp's own decision from the pair
// body: a live unexpired claim as of releaseAt → the
// claim_released event; otherwise zero events (the gate's
// idempotent no-op — its pair still exists, and derives
// nothing). Deciding here, not at the gate, keeps gate and
// derive from ever disagreeing about liveness.
function applyReleasePair(
    replayed: StateEntity[],
    entityPairs: readonly DocumentPair[],
    release: OperationPair,
    workOrderId: Id,
): void {
    const legacy = Object.hasOwn(
        release.body, 'releaseEventId',
    );
    const releaseEventId = legacy
        ? pickString(release.body, 'releaseEventId')
        : release.id;
    const releaseAt = legacy
        ? pickString(release.body, 'releaseAt')
        : release.at;
    const prior = latestClaimEvent(
        priorClaimCandidates(replayed, release),
        workOrderId,
    );
    if (legacy) {
        const lockTimeout = lockTimeoutAsOf(
            entityPairs, release.at,
        );
        const priorLive = prior !== null
            && prior.state === 'claimed'
            && !isExpiredAsOf(
                releaseAt, prior.at, lockTimeout,
            );
        if (!priorLive) return;
    } else if (
        prior === null
        || prior.state !== 'claimed'
    ) {
        // DELETE head only forms after a PUT claim;
        // a stray delete with no claimed prior is a
        // no-op, matching the legacy empty derive.
        return;
    }
    replayed.push({
        id: releaseEventId,
        entity_id: workOrderId,
        state: 'claim_released',
        member_id: release.requesterIdentityId,
        at: releaseAt,
    });
}

type WorkOrderAction =
    | { readonly kind: 'claim'; readonly pair: OperationPair }
    | { readonly kind: 'release'; readonly pair: OperationPair }
    | { readonly kind: 'transition'; readonly pair: OperationPair };

// One work order's full replay: its births (EDGE 1 — zero or
// more three-slot arrays, one per create pair found), then its
// claim/release/transition actions applied in (at, id) order so
// each claim's prior-claim lookup only ever sees
// chronologically earlier events.
function replayWorkOrderOperations(
    createPairs: readonly OperationPair[],
    entityPairs: readonly DocumentPair[],
    claimPairs: readonly OperationPair[],
    releasePairs: readonly OperationPair[],
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
        ...releasePairs.map((pair) => (
            { kind: 'release' as const, pair }
        )),
        ...transitionPairs.map((pair) => (
            { kind: 'transition' as const, pair }
        )),
    ].sort((a, b) => atIdCompare(a.pair, b.pair));

    for (const action of actions) {
        if (action.kind === 'claim') {
            applyClaimPair(
                events, entityPairs, action.pair, workOrderId,
            );
        } else if (action.kind === 'release') {
            applyReleasePair(
                events, entityPairs, action.pair, workOrderId,
            );
        } else {
            applyTransitionPair(events, action.pair, workOrderId);
        }
    }

    return events;
}

// Prefix-filtered pure core of the op-pair reader (gate 5d).
// When `organization` is set, only that org's work-orders
// uri_collection family is considered (collection + claim/release/
// transition); when undefined, every org — the whole-plane
// scan deriveWorkOrderLifecycle needs. Returns ASC events and
// the transition pairs consumed so bulk history can fold
// field_values without a second plane pass.
interface WorkOrderLifecyclePlane {
    readonly events: readonly StateEntity[];
    readonly transitionPairs: readonly OperationPair[];
}

function workOrderLifecycleFromPlane(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
    organization: Id | undefined,
): WorkOrderLifecyclePlane {
    const collectionPrefixes = new Set<string>();
    if (organization !== undefined) {
        collectionPrefixes.add(
            canonicalUriCollection(organization, '/work-orders/'),
        );
    } else {
        for (const request of requests) {
            if (WORK_ORDERS_COLLECTION_PATTERN.test(
                request.uri_collection,
            )) {
                collectionPrefixes.add(request.uri_collection);
            }
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

    const organizationRoot = organization === undefined
        ? null
        : '/organizations/' + organization + '/work-orders/';

    const claimPrefixByWorkOrder = new Map<Id, string>();
    const releasePrefixByWorkOrder = new Map<Id, string>();
    const transitionPrefixByWorkOrder = new Map<Id, string>();
    for (const request of requests) {
        if (
            organizationRoot !== null
            && !request.uri_collection.startsWith(
                organizationRoot,
            )
        ) {
            continue;
        }
        const claimMatch = WORK_ORDER_CLAIM_PATTERN.exec(
            request.uri_collection,
        );
        if (claimMatch !== null) {
            claimPrefixByWorkOrder.set(
                claimMatch[1]!, request.uri_collection,
            );
        }
        const releaseMatch =
            WORK_ORDER_RELEASE_PATTERN.exec(
                request.uri_collection,
            );
        if (releaseMatch !== null) {
            releasePrefixByWorkOrder.set(
                releaseMatch[1]!, request.uri_collection,
            );
        }
        const transitionMatch =
            WORK_ORDER_TRANSITION_PATTERN.exec(
                request.uri_collection,
            );
        if (transitionMatch !== null) {
            transitionPrefixByWorkOrder.set(
                transitionMatch[1]!, request.uri_collection,
            );
        }
    }

    const workOrderIds = new Set<Id>([
        ...createPairsByWorkOrder.keys(),
        ...claimPrefixByWorkOrder.keys(),
        ...releasePrefixByWorkOrder.keys(),
        ...transitionPrefixByWorkOrder.keys(),
    ]);

    const events: StateEntity[] = [];
    const allTransitionPairs: OperationPair[] = [];
    for (const workOrderId of workOrderIds) {
        const claimPrefix =
            claimPrefixByWorkOrder.get(workOrderId);
        const releasePrefix =
            releasePrefixByWorkOrder.get(workOrderId);
        const transitionPrefix =
            transitionPrefixByWorkOrder.get(workOrderId);
        const claimPairs = claimPrefix === undefined
            ? []
            : operationPairsAt(
                requests, responses, claimPrefix,
                POST_OR_PUT,
            );
        const releasePosts = releasePrefix === undefined
            ? []
            : operationPairsAt(
                requests, responses, releasePrefix,
            );
        const releaseDeletes = claimPrefix === undefined
            ? []
            : documentDeletesAsOperations(
                documentPairsAt(
                    requests, responses, claimPrefix,
                ),
            );
        const releasePairs = [
            ...releasePosts, ...releaseDeletes,
        ];
        const transitionPairs =
            transitionPrefix === undefined
                ? []
                : operationPairsAt(
                    requests, responses, transitionPrefix,
                );
        allTransitionPairs.push(...transitionPairs);
        events.push(...replayWorkOrderOperations(
            createPairsByWorkOrder.get(workOrderId) ?? [],
            entityPairsByWorkOrder.get(workOrderId) ?? [],
            claimPairs,
            releasePairs,
            transitionPairs,
            workOrderId,
        ));
    }
    return {
        events: events.sort(atIdCompare),
        transitionPairs: allTransitionPairs,
    };
}

// The op-pair reader (gate 5d). ONE shared readonly tx over
// requests+responses (torn-read closure) — every grouping and
// replay step below is pure over the two fetched arrays, no
// further db reads. (at, id) ascending overall: these rows are
// SYNTHESIZED (no address of their own to read 1:1), so there
// is no raw-store scan order to reproduce — chronological
// (at, id) is the meaningful order, and filtering this total
// order by entity_id preserves it per work order.
export async function deriveWorkOrderLifecycle(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.readTransaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            return [
                ...workOrderLifecycleFromPlane(
                    requests, responses, undefined,
                ).events,
            ];
        },
    );
}

// GET work-orders/history (states-URI elimination A2): the
// org-prefix scoped bulk of workOrderHistoryFor — same
// WorkOrderHistoryEventEntity shape (field_values folded),
// (at, id) DESC overall so rows group by entity_id under a
// shared total order. Always returns an array (empty when the
// org has no live op-pair lifecycle).
export async function deriveWorkOrderHistories(
    db: DbAdapter,
    organization: Id,
): Promise<WorkOrderHistoryEventEntity[]> {
    return db.readTransaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            const plane = workOrderLifecycleFromPlane(
                requests, responses, organization,
            );
            return historyEventsWithFieldValues(
                plane.events, plane.transitionPairs,
            );
        },
    );
}

// ENTITY-SCOPED sibling of deriveWorkOrderLifecycle above (Phase
// 14 Task 1): reuses the SAME pure replay core
// (replayWorkOrderOperations) over INDEXED reads scoped to ONE
// known (organization, workOrderId) pair, rather than the
// whole-org scan the multi-work-order reader needs to discover
// EVERY id at once —
//   * create + document pairs: address read at the
//     work-orders prefix + this workOrderId (both
//     a create's response and its later document PUT/DELETE
//     share ONE uriId — drift-work-orders.test.ts case 8);
//   * claim/release/transition: uri_collection at each sub-
//     resource's own per-id address (WORK_ORDER_CLAIM_PATTERN/
//     WORK_ORDER_RELEASE_PATTERN/
//     WORK_ORDER_TRANSITION_PATTERN's own shape, constructed
//     directly since the id is already known).
// dbOrView-shaped and opens no nested transaction — callable from
// WITHIN an already-open write-gate transaction. Phase 14 Task 4
// wires the claim gate to workOrderClaimHistoryFor below; with
// the states/:id address retired both siblings return the SAME
// op-pair replay (releases ride the release op, not a standalone
// event-append).
interface WorkOrderClaimSources {
    readonly replayed: readonly StateEntity[];
}

// The reads + replay shared by workOrderLifecycleStatesFor and
// workOrderClaimHistoryFor below, factored out so neither
// duplicates the index reads or the replayWorkOrderOperations
// call.
async function workOrderClaimSourcesFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderClaimSources> {
    const collectionPrefix = canonicalUriCollection(
        organization, '/work-orders/',
    );
    const [collectionRequests, collectionResponses] =
        await Promise.all([
            dbOrView.requests.getAllAtAddress(
                collectionPrefix, workOrderId,
            ),
            dbOrView.responses.getAllAtAddress(
                collectionPrefix, workOrderId,
            ),
        ]);
    const createPairs = operationPairsAt(
        collectionRequests, collectionResponses, collectionPrefix,
    );
    const entityPairs = documentPairsAt(
        collectionRequests, collectionResponses, collectionPrefix,
    );

    const claimPrefix = canonicalUriCollection(
        organization,
        '/work-orders/' + workOrderId + '/claim/',
    );
    const [claimRequests, claimResponses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_collection', claimPrefix),
        dbOrView.responses.getAllWhere('uri_collection', claimPrefix),
    ]);
    const claimPairs = operationPairsAt(
        claimRequests, claimResponses, claimPrefix,
        POST_OR_PUT,
    );
    const releaseDeletes = documentDeletesAsOperations(
        documentPairsAt(
            claimRequests, claimResponses, claimPrefix,
        ),
    );

    const releasePrefix = canonicalUriCollection(
        organization,
        '/work-orders/' + workOrderId + '/release/',
    );
    const [releaseRequests, releaseResponses] =
        await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_collection', releasePrefix,
            ),
            dbOrView.responses.getAllWhere(
                'uri_collection', releasePrefix,
            ),
        ]);
    const releasePairs = [
        ...operationPairsAt(
            releaseRequests, releaseResponses,
            releasePrefix,
        ),
        ...releaseDeletes,
    ];

    const transitionPrefix = canonicalUriCollection(
        organization,
        '/work-orders/' + workOrderId + '/transition/',
    );
    const [
        transitionRequests, transitionResponses,
    ] = await Promise.all([
        dbOrView.requests.getAllWhere(
            'uri_collection', transitionPrefix,
        ),
        dbOrView.responses.getAllWhere(
            'uri_collection', transitionPrefix,
        ),
    ]);
    const transitionPairs = operationPairsAt(
        transitionRequests, transitionResponses, transitionPrefix,
    );

    return {
        replayed: replayWorkOrderOperations(
            createPairs, entityPairs,
            claimPairs, releasePairs, transitionPairs,
            workOrderId,
        ),
    };
}

export async function workOrderLifecycleStatesFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<StateEntity[]> {
    const { replayed } = await workOrderClaimSourcesFor(
        dbOrView, organization, workOrderId,
    );
    return [...replayed].sort(atIdCompare);
}

// Same fold as transitionFieldValueCandidates +
// stateFieldValuesFrom for LEGACY bags: candidates keyed by
// fv row id, latestByKey head reduction, DELETE heads dropped.
// New-shape pairs (no fieldValues key) render per-event from
// set/clear — shape-disjoint; they never enter latestByKey.
// Shared by workOrderHistoryFor (A1) and
// deriveWorkOrderHistories (A2).
function fieldValuesByTransitionEvent(
    transitionPairs: readonly OperationPair[],
): Map<Id, TransitionFieldValueEntity[]> {
    const candidates: DocumentPair[] = [];
    const newShapeRows =
        new Map<Id, TransitionFieldValueEntity[]>();
    for (const transition of transitionPairs) {
        const raw = transition.body['fieldValues'];
        if (raw !== undefined) {
            // Legacy shape: pool candidates for head-reduce.
            const fieldValues = raw as
                readonly {
                    readonly id: string;
                    readonly fields: Record<string, unknown>;
                }[];
            for (const fieldValue of fieldValues) {
                candidates.push({
                    id: transition.id,
                    at: transition.at,
                    uriId: fieldValue.id,
                    method: 'PUT',
                    body: fieldValue.fields,
                    requesterIdentityId:
                        transition.requesterIdentityId,
                    version: '',
                });
            }
            continue;
        }
        // New-shape: set/clear → rows for THIS event only.
        const eventId = pickString(
            transition.body, 'transitionEventId',
        );
        const rows: TransitionFieldValueEntity[] = [];
        const set = transition.body['set'];
        if (Array.isArray(set)) {
            for (const entry of set) {
                const row = entry as
                    Record<string, unknown>;
                const attributeId = pickString(
                    row, 'attribute_id',
                );
                rows.push({
                    id: attributeId,
                    attribute_id: attributeId,
                    value: pickString(row, 'value'),
                });
            }
        }
        const clear = transition.body['clear'];
        if (Array.isArray(clear)) {
            for (const attributeId of clear) {
                // No value key on the wire; cast covers the
                // type's required value used by legacy set rows.
                rows.push({
                    id: String(attributeId),
                    attribute_id: String(attributeId),
                    cleared: true,
                } as TransitionFieldValueEntity);
            }
        }
        if (rows.length > 0) {
            rows.sort(byIdAscending);
            newShapeRows.set(eventId, rows);
        }
    }
    const heads = latestByKey(
        candidates, (pair) => pair.uriId,
    );
    const byEvent = new Map<Id, TransitionFieldValueEntity[]>();
    for (const [uriId, head] of heads) {
        if (head.method === 'DELETE') continue;
        const stateEventId = pickString(
            head.body, 'state_event_id',
        );
        const list = byEvent.get(stateEventId) ?? [];
        list.push({
            id: uriId,
            attribute_id: pickString(
                head.body, 'attribute_id',
            ),
            value: pickString(head.body, 'value'),
        });
        byEvent.set(stateEventId, list);
    }
    for (const list of byEvent.values()) {
        list.sort(byIdAscending);
    }
    // Merge new-shape AFTER legacy reduction (disjoint event
    // ids by construction — a new-shape event never minted
    // legacy candidates).
    for (const [eventId, rows] of newShapeRows) {
        byEvent.set(eventId, rows);
    }
    return byEvent;
}

// Attach folded field_values and reverse ASC lifecycle to
// (at, id) DESC (index 0 = current). Claim/birth/release rows
// carry field_values: [].
function historyEventsWithFieldValues(
    lifecycleAsc: readonly StateEntity[],
    transitionPairs: readonly OperationPair[],
): WorkOrderHistoryEventEntity[] {
    const byEvent = fieldValuesByTransitionEvent(
        transitionPairs,
    );
    return lifecycleAsc.map((event) => ({
        ...event,
        field_values: byEvent.get(event.id) ?? [],
    })).toReversed();
}

// GET work-orders/:id/history (states-URI elimination A1):
// workOrderLifecycleStatesFor (ASC) reborn with an inline
// field-values fold from this work order's OWN transition
// prefix pairs, returned (at, id) DESC so index 0 is current.
// Head-reduction per field-value row id matches
// stateFieldValuesFrom (api/derive-state-field-values.ts);
// claim/birth/release rows carry field_values: []. Empty
// lifecycle → missedReadError (404 miss at this address).
// Entity-scoped indexed reads only — no whole-plane getAll.
export async function workOrderHistoryFor(
    db: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderHistoryEventEntity[]> {
    const lifecycle = await workOrderLifecycleStatesFor(
        db, organization, workOrderId,
    );
    if (lifecycle.length === 0) {
        throw await missedReadError(
            db, workOrderId, organization, 'work_orders',
        );
    }

    const transitionPrefix = canonicalUriCollection(
        organization,
        '/work-orders/' + workOrderId + '/transition/',
    );
    const [transitionRequests, transitionResponses] =
        await Promise.all([
            db.requests.getAllWhere(
                'uri_collection', transitionPrefix,
            ),
            db.responses.getAllWhere(
                'uri_collection', transitionPrefix,
            ),
        ]);
    const transitionPairs = operationPairsAt(
        transitionRequests,
        transitionResponses,
        transitionPrefix,
    );

    return historyEventsWithFieldValues(
        lifecycle, transitionPairs,
    );
}

// THE CLAIM GATE'S OWN SOURCE (Phase 14 Task 4): the work-
// order op-pair replay, over INDEXED entity-scoped reads
// workOrderClaimSourcesFor already performs, rather than
// deriveStatesFor's own whole-plane getAll (forbidden inside
// a write-gate transaction — CLAUDE.md's tx-body gotcha:
// entity-scoped in-tx reads only, never a whole-plane getAll of
// requests/responses). With the states/:id address retired this
// is the sole claim-history source — create/claim/transition/
// release op pairs cover every live writer. postWorkOrderClaimOp
// (api/routes.ts) is its only live caller.
export async function workOrderClaimHistoryFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<StateEntity[]> {
    const { replayed } = await workOrderClaimSourcesFor(
        dbOrView, organization, workOrderId,
    );
    return [...replayed].sort(atIdCompare);
}

// The CURRENT bind: latest binding pair wins under
// (at, id). Reads PUT (locked verb). POST still
// accepted for pre-lock pairs.
// Entity-scoped indexed reads; in-tx safe (dbOrView).
export async function workOrderBindingFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<
    { instanceId: Id; recordTypeId: Id } | null
> {
    const prefix = canonicalUriCollection(
        organization,
        '/work-orders/' + workOrderId + '/binding/',
    );
    const [requests, responses] = await Promise.all([
        dbOrView.requests.getAllWhere(
            'uri_collection', prefix,
        ),
        dbOrView.responses.getAllWhere(
            'uri_collection', prefix,
        ),
    ]);
    const pairs = operationPairsAt(
        requests, responses, prefix, POST_OR_PUT,
    );
    const latest = pairs[pairs.length - 1];
    if (latest === undefined) {
        return null;
    }
    return {
        instanceId: pickString(
            latest.body, 'instance_id',
        ),
        recordTypeId: pickString(
            latest.body, 'record_type_id',
        ),
    };
}

// GET work-orders/:id/claim facts. 404 only when
// unclaimed: no row or DELETE head. An expired claim
// is still a row — "claimed now" is judged at read.
export interface WorkOrderClaimDocument {
    readonly memberId: Id;
    readonly expiresAt: string;
    readonly claimedAt: string;
}

export async function workOrderClaimDocumentFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderClaimDocument | null> {
    const prefix = canonicalUriCollection(
        organization,
        '/work-orders/' + workOrderId + '/claim/',
    );
    const [requests, responses] = await Promise.all([
        dbOrView.requests.getAllWhere(
            'uri_collection', prefix,
        ),
        dbOrView.responses.getAllWhere(
            'uri_collection', prefix,
        ),
    ]);
    const pairs = documentPairsAt(
        requests, responses, prefix,
    );
    const latest = pairs[pairs.length - 1];
    if (
        latest === undefined
        || latest.method === 'DELETE'
    ) {
        return null;
    }
    const claimedAt = pickString(
        latest.body, 'claimAt',
    );
    const stored = latest.body['expires_at'];
    let expiresAt: string;
    if (typeof stored === 'string' && stored !== '') {
        expiresAt = stored;
    } else {
        const wo = await workOrderDocumentHeadFor(
            dbOrView, organization, workOrderId,
        );
        const lockTimeout = wo === null
            ? 0
            : asWorkOrderFlowGraph(
                wo.flow_graph,
                'work-order claim document'
                    + ' flow_graph',
            ).lockTimeout;
        expiresAt = addUtcSeconds(
            claimedAt, lockTimeout,
        );
    }
    return {
        memberId: latest.requesterIdentityId,
        expiresAt,
        claimedAt,
    };
}

// ---- workOrderDocumentHeadFor — the claim-gate graph head -----
// ---- (Phase 15 Task 1, Author gate 4) --------------------------

// Derives the work order's CURRENT document head
// ({display_id, flow_graph, position, …}) from the entity's
// OWN document pairs — the pair-plane successor of
// view.workOrders.getById that postWorkOrderClaimOp still
// reads for flow_graph (Task 2 re-anchors the call site).
//
// REUSE TARGET: the entity-scoped entityPairs computation
// inside workOrderClaimSourcesFor (address read) — NOT
// derivedDocumentEntity / documentGetHandler, whose
// collection-wide prefix scan is the forbidden whole-plane
// shape inside a write gate.
//
// HEAD REDUCTION: documentPairsAt already sorts by (at, id)
// ascending and admits only PUT/DELETE, so the last pair IS
// the document head; a DELETE head (or no pairs) yields null
// so the claim gate can map absent to the same
// EntityNotFoundError bytes as workOrders.getById.
// dbOrView-shaped and opens no nested transaction — callable
// from WITHIN an already-open write-gate transaction.
export async function workOrderDocumentHeadFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderEntity | null> {
    const collectionPrefix = canonicalUriCollection(
        organization, '/work-orders/',
    );
    const [collectionRequests, collectionResponses] =
        await Promise.all([
            dbOrView.requests.getAllAtAddress(
                collectionPrefix, workOrderId,
            ),
            dbOrView.responses.getAllAtAddress(
                collectionPrefix, workOrderId,
            ),
        ]);
    const entityPairs = documentPairsAt(
        collectionRequests, collectionResponses,
        collectionPrefix,
    );
    if (entityPairs.length === 0) return null;
    const head = entityPairs[entityPairs.length - 1]!;
    if (head.method === 'DELETE') return null;
    return {
        id: workOrderId,
        organization_id: organization,
        display_id: pickString(head.body, 'display_id'),
        flow_graph: asObject(
            head.body['flow_graph'], 'flow_graph',
        ),
        position: pickNumber(head.body, 'position'),
    };
}

// ---- deriveMemberStates — the members document-trio reader -
// ---- (gate 5c) ---------------------------------------------

// Source (c) of the states-log union. The members-trio
// derivation (states-address retirement): REPLACES
// deriveMemberGenesis in the same global-plane union slot.
// Genesis and every later state change ride the members/:id
// document trio now — the create op folds initialState* into
// that document pair, so the op-body echo this replaced reader
// used to scan is no longer a derive source (it remains on the
// op body for the op-born visibility scan alone). Global-scoped
// like the reader it replaces — the per-org trioFamiliesFor
// machinery is NOT bent to fit (members are
// organizationNested: false).
const MEMBERS_DOCUMENT_PREFIX =
    canonicalUriCollection(undefined, '/members/');

export async function deriveMemberStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.readTransaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAllWhere(
                    'uri_collection', MEMBERS_DOCUMENT_PREFIX,
                ),
                view.responses.getAllWhere(
                    'uri_collection', MEMBERS_DOCUMENT_PREFIX,
                ),
            ]);
            const pairs = documentPairsAt(
                requests, responses, MEMBERS_DOCUMENT_PREFIX,
            );
            const byMember = Map.groupBy(
                pairs, (pair) => pair.uriId,
            );
            const rows: StateEntity[] = [];
            for (const [memberId, memberPairs] of byMember) {
                rows.push(...stateHistoryFrom(
                    documentLifecycleEvents(memberPairs),
                    memberId,
                ));
            }
            return rows.sort(byIdAscending);
        },
    );
}

// deriveFlowGraphStates RETIRED with the bulk lifecycle
// collection (states-URI elimination C3). Graph node/edge
// deleted/restored sidecars still live on the flow
// document-pair body (graphDelta.deletions / revivals —
// SIDECAR-KEEP); resolveFlowGraphOwner above still resolves
// their owners for fences. Visibility of named sidecar
// event ids rides stateEventVisibilityFor.

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
    return db.readTransaction(
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
                    request.uri_collection,
                )) {
                    opPrefixes.add(request.uri_collection);
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

// ENTITY-SCOPED sibling of deriveInvitationStates above (Phase
// 14 Task 1): the SAME grant + op-address reduction, restricted
// to ONE known invitation id via INDEXED reads —
// address read at the invitations prefix + this id
// (grant + document share ONE uriId) and
// uri_collection for each of the three op addresses —
// rather than the whole-collection scan
// (documentIds discovery) and the whole-ledger requests.getAll()
// (op-prefix discovery) the multi-invitation reader above needs
// to find EVERY id at once. dbOrView-shaped and opens no nested
// transaction — callable from WITHIN an already-open write-gate
// transaction (currentInvitationState's own accept/decline/
// revoke in-tx reads, api/invitations-domain.ts — a LATER task
// wires the call site; this task lands the core alone).
//
// THE PHANTOM-ECHO EXCLUSION carries over unchanged (deriveInvit-
// ationStates' own header): the documentIds cross-reference,
// applied here to the id-scoped read alone, still excludes a
// duplicate grant's own operation pair when no document was ever
// written at this id.
export async function invitationLifecycleStatesFor(
    dbOrView: DbAdapter,
    id: Id,
): Promise<StateEntity[]> {
    const rows: StateEntity[] = [];

    const [collectionRequests, collectionResponses] =
        await Promise.all([
            dbOrView.requests.getAllAtAddress(
                INVITATIONS_PREFIX, id,
            ),
            dbOrView.responses.getAllAtAddress(
                INVITATIONS_PREFIX, id,
            ),
        ]);
    const hasDocument = documentPairsAt(
        collectionRequests, collectionResponses,
        INVITATIONS_PREFIX,
    ).some((pair) => pair.uriId === id);
    if (hasDocument) {
        for (const pair of operationPairsAt(
            collectionRequests, collectionResponses,
            INVITATIONS_PREFIX,
        )) {
            rows.push({
                id: pickString(pair.body, 'grantEventId'),
                entity_id: pair.uriId,
                state: 'pending',
                member_id: pair.requesterIdentityId,
                at: pickString(pair.body, 'grantAt'),
            });
        }
    }

    for (const op of [
        'acceptance', 'decline', 'revocation',
    ] as const) {
        const prefix = canonicalUriCollection(
            undefined, '/invitations/' + id + '/' + op + '/',
        );
        const [opRequests, opResponses] = await Promise.all([
            dbOrView.requests.getAllWhere('uri_collection', prefix),
            dbOrView.responses.getAllWhere('uri_collection', prefix),
        ]);
        const fields = INVITATION_OP_FIELDS[op]!;
        const earliest = operationPairsAt(
            opRequests, opResponses, prefix,
        )[0];
        if (earliest === undefined) continue;
        rows.push({
            id: pickString(earliest.body, fields.eventIdField),
            entity_id: id,
            state: fields.state,
            member_id: earliest.requesterIdentityId,
            at: pickString(earliest.body, fields.atField),
        });
    }

    return rows.sort(byIdAscending);
}

// deriveTrioFamilyStates / deriveStates / fenceStatesByOwner /
// unionById / sameStateEntity RETIRED with the bulk lifecycle
// collection (states-URI elimination C3). documentStateHeadFor
// RETIRED with C5 (write paths use family currentDocumentState).
// Per-entity history lives on GET <family>/:id/history and
// family-scoped derives (derive*StateHistory,
// workOrderLifecycleStatesFor, deriveMemberStates filter,
// invitation sources). Bulk work-order and objective history:
// GET work-orders/history and GET objectives/history.
