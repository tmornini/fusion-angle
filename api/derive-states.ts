import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from './db.ts';
import type {
    Id, RequestEntity, ResponseEntity, StateEntity,
    WorkOrderEntity,
} from './types.ts';
import { MS_PER_SECOND } from './types.ts';
import {
    pickString, pickNumber, pickJsonObjectField,
    validateWorkOrderFlowGraphJson,
} from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    documentPairsAt,
    deriveDocumentsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    byIdAscending,
    type DocumentPair,
} from './derive-documents.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { deriveIdeaStateHistory } from './derive-ideas.ts';
import { deriveProjectStateHistory } from './derive-projects.ts';
import { deriveRecordStateHistory } from './derive-records.ts';
import { deriveFlowStateHistory } from './derive-flows.ts';
import { deriveObjectiveStateHistory } from
    './derive-objectives.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import { latestClaimEvent } from './work-order-claims.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// The states-log derivation, Phase 11 (the derive-identity-
// spine.ts precedent applied to the unified event log). FIVE
// sources feed the union deriveStates/deriveStatesFor assemble
// (Task 5, at the bottom of this file). The states/:id event-
// append address is RETIRED — nothing recognizes it; every
// lifecycle event rides one of these five sources:
//   (a) the FIVE trio families' OWN embedded lifecycle history —
//       deriveIdeaStateHistory/deriveProjectStateHistory/
//       deriveRecordStateHistory/deriveFlowStateHistory/
//       deriveObjectiveStateHistory, IMPORTED from their own
//       modules (gate 5b) via deriveTrioFamilyStates below,
//       never rebuilt here.
//   (b) deriveMemberStates — the members/:id document trio
//       (genesis at create + every later change; the
//       states-address retirement's replacement for the old
//       create-op genesis echo).
//   (c) deriveWorkOrderLifecycle — the work-order op-pair replay
//       (gate 5d) — see its own section header below for the
//       work-order-specific edges.
//   (d) deriveFlowGraphStates — flow-node/edge deleted/restored
//       sidecars (gate 5e).
//   (e) deriveInvitationStates — the invitation grant + its three
//       answering ops (gate 5f).
// Objectives joined the trio families at the states-address
// retirement: genesis is an explicit event minted at create,
// archive/reactivate ride PUT objectives/:id — the old
// absence-as-active covenant (R2) and the genesis dilemma are
// retired with the address that forced them.
//
// The PAIR-PLANE org fence (resolveOwningOrganization /
// fenceStatesByOwner, gate 4) is applied ONCE, by deriveStates
// alone — deriveStatesFor takes both the organization and the
// entity from the caller directly, so no visibility fence applies
// there.
//
// FLIPPED (Phase 14 Task 7): api/routes.ts's GET /states and
// GET /entity-states/:id/history dispatch to deriveStates/
// deriveStatesFor below — Task 1's row-plane fence
// (api/store-parent-scoped.ts) no longer serves either read.
// bare GET /states/:id and GET /entity-states/:id RETIRED
// (Phase 15 Task 7) — zero product callers. PUT /states/:id
// is retired with the states-address itself.
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

// organizations is the tenant root (global plane, never itself
// organization-nested — derive-organizations.ts). An
// organizations document id resolves to itself (Phase 15 Task
// 1, Author gate 3 — the ONE new resolveOwningOrganization
// leg).
const ORGANIZATIONS_ADDRESS_PREFIX =
    canonicalUriPrefix(undefined, '/organizations/');

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
    // (a) org-nested document families + (e) organizations
    // self-as-owner: a targeted uri_id index read (mirrors
    // message-pair.ts's own headPairIdAt) rather than a full-
    // ledger scan — an entity id is globally unique
    // (generateCryptoSafeBase62), so at most one distinct
    // document prefix can ever match.
    const responseHits =
        await db.responses.getAllWhere('uri_id', entityId);
    for (const response of responseHits) {
        if (
            response.uri_prefix
                === ORGANIZATIONS_ADDRESS_PREFIX
        ) {
            // (e) organizations self-as-owner: the document
            // id IS the owning organization.
            return entityId;
        }
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

// Global-existence probe for the 403-vs-404 ownership
// covenant. Unfiltered uri_id index hit across every org +
// resolveOwningOrganization fallback (boundOrganization is a
// cheap-path hint, not a filter). Covers three families the
// narrower resolveOwningOrganization allowlist omits:
// memberships, record-attributes, role-grants. Future 403-vs-
// 404 decisions route through this, not the narrower resolver
// alone.
//
// Prefers a direct uri_id hit (covers memberships + record-
// attributes, which resolveOwningOrganization's states.entity_id
// alphabet does not list, and role-grants' flat prefix whose org
// lives in the response body). Falls back to
// resolveOwningOrganization for the nested document families
// already in that alphabet (ideas/projects/flows/...).
const ROLE_GRANTS_URI_PREFIX =
    canonicalUriPrefix(undefined, '/role-grants/');

// Organization-nested document prefixes:
// /organizations/{id}/...
const ORGANIZATION_NESTED_URI_PREFIX =
    /^\/organizations\/([^/]+)\//;

function responseBodyOf(
    message: string,
): Record<string, unknown> {
    const model = parseJson(message, defaultBodyRegistry());
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

export async function resolveGlobalOwner(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    const hits = await db.responses.getAllWhere(
        'uri_id', entityId,
    );
    for (const response of hits) {
        const nested = ORGANIZATION_NESTED_URI_PREFIX.exec(
            response.uri_prefix,
        );
        if (nested !== null) return nested[1]!;
        if (response.uri_prefix === ROLE_GRANTS_URI_PREFIX) {
            const body = responseBodyOf(response.message);
            const organizationId = body['organization_id'];
            if (typeof organizationId === 'string') {
                return organizationId;
            }
        }
    }
    return resolveOwningOrganization(
        db, entityId, boundOrganization,
    );
}

// Miss-path 403-vs-404 helper for org-scoped reads. Probe runs
// ONLY on the org-scoped miss/deny path (never the happy path).
// owner-null → EntityNotFoundError (404); foreign →
// ForeignOrganizationError (403). probeId defaults to id; pass
// a parent id when the miss is on a nested child (e.g. flow
// records probe the parent flow).
export async function missedReadError(
    db: DbAdapter,
    id: Id,
    organization: Id,
    table: string,
    probeId: Id = id,
): Promise<EntityNotFoundError | ForeignOrganizationError> {
    const owner = await resolveGlobalOwner(
        db, probeId, organization,
    );
    if (owner !== null && owner !== organization) {
        return new ForeignOrganizationError(table, id);
    }
    return new EntityNotFoundError(table, id);
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
        const prefix = canonicalUriPrefix(
            organization, '/' + family + '/',
        );
        const [requests, responses] = await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_prefix', prefix,
            ),
            dbOrView.responses.getAllWhere(
                'uri_prefix', prefix,
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
    // each sub-resource with an indexed uri_prefix read.
    const workOrdersPrefix = canonicalUriPrefix(
        organization, '/work-orders/',
    );
    const workOrderResponses =
        await dbOrView.responses.getAllWhere(
            'uri_prefix', workOrdersPrefix,
        );
    const workOrderIds = new Set<Id>(
        workOrderResponses.map((r) => r.uri_id),
    );
    for (const workOrderId of workOrderIds) {
        for (const sub of [
            'claim', 'transition', 'release',
        ] as const) {
            const prefix = canonicalUriPrefix(
                organization,
                '/work-orders/' + workOrderId
                    + '/' + sub + '/',
            );
            const [requests, responses] = await Promise.all([
                dbOrView.requests.getAllWhere(
                    'uri_prefix', prefix,
                ),
                dbOrView.responses.getAllWhere(
                    'uri_prefix', prefix,
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
        canonicalUriPrefix(undefined, '/ai-members/'),
        canonicalUriPrefix(undefined, '/human-members/'),
    ]) {
        const [requests, responses] = await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_prefix', prefix,
            ),
            dbOrView.responses.getAllWhere(
                'uri_prefix', prefix,
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
                'uri_prefix', INVITATIONS_PREFIX,
            ),
            dbOrView.responses.getAllWhere(
                'uri_prefix', INVITATIONS_PREFIX,
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
                const prefix = canonicalUriPrefix(
                    undefined,
                    '/invitations/' + invitationId
                        + '/' + sub + '/',
                );
                const [opRequests, opResponses] =
                    await Promise.all([
                        dbOrView.requests.getAllWhere(
                            'uri_prefix', prefix,
                        ),
                        dbOrView.responses.getAllWhere(
                            'uri_prefix', prefix,
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
// 'work-orders/:id/transition' / 'work-orders/:id/release'), so
// each distinct match names ONE work order directly —
// captured, the organization segment is not (a work-order id
// is globally unique, so it is never needed to disambiguate).
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
export function operationPairsAt(
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
    const releaseEventId = pickString(
        release.body, 'releaseEventId',
    );
    const releaseAt = pickString(release.body, 'releaseAt');
    const lockTimeout = lockTimeoutAsOf(
        entityPairs, release.at,
    );
    const prior = latestClaimEvent(
        priorClaimCandidates(replayed, release),
        workOrderId,
    );
    const priorLive = prior !== null
        && prior.state === 'claimed'
        && !isExpiredAsOf(releaseAt, prior.at, lockTimeout);
    if (!priorLive) return;
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

            const claimPrefixByWorkOrder = new Map<Id, string>();
            const releasePrefixByWorkOrder =
                new Map<Id, string>();
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
                const releaseMatch =
                    WORK_ORDER_RELEASE_PATTERN.exec(
                        request.uri_prefix,
                    );
                if (releaseMatch !== null) {
                    releasePrefixByWorkOrder.set(
                        releaseMatch[1]!, request.uri_prefix,
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
                ...releasePrefixByWorkOrder.keys(),
                ...transitionPrefixByWorkOrder.keys(),
            ]);

            const events: StateEntity[] = [];
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
                    );
                const releasePairs = releasePrefix === undefined
                    ? []
                    : operationPairsAt(
                        requests, responses, releasePrefix,
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
                    claimPairs,
                    releasePairs,
                    transitionPairs,
                    workOrderId,
                ));
            }
            return events.sort(atIdCompare);
        },
    );
}

// ENTITY-SCOPED sibling of deriveWorkOrderLifecycle above (Phase
// 14 Task 1): reuses the SAME pure replay core
// (replayWorkOrderOperations) over INDEXED reads scoped to ONE
// known (organization, workOrderId) pair, rather than the
// whole-org scan the multi-work-order reader needs to discover
// EVERY id at once —
//   * create + document pairs: uri_id (both a create's response
//     and its later document PUT/DELETE share ONE uriId at the
//     work-orders collection address — the SAME finding
//     drift-work-orders.test.ts case 8 pins), filtered to the
//     collection prefix;
//   * claim/release/transition: uri_prefix at each sub-
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
    const collectionPrefix = canonicalUriPrefix(
        organization, '/work-orders/',
    );
    const [byIdRequests, byIdResponses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_id', workOrderId),
        dbOrView.responses.getAllWhere('uri_id', workOrderId),
    ]);
    const collectionRequests = byIdRequests.filter(
        (r) => r.uri_prefix === collectionPrefix,
    );
    const collectionResponses = byIdResponses.filter(
        (r) => r.uri_prefix === collectionPrefix,
    );
    const createPairs = operationPairsAt(
        collectionRequests, collectionResponses, collectionPrefix,
    );
    const entityPairs = documentPairsAt(
        collectionRequests, collectionResponses, collectionPrefix,
    );

    const claimPrefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/claim/',
    );
    const [claimRequests, claimResponses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_prefix', claimPrefix),
        dbOrView.responses.getAllWhere('uri_prefix', claimPrefix),
    ]);
    const claimPairs = operationPairsAt(
        claimRequests, claimResponses, claimPrefix,
    );

    const releasePrefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/release/',
    );
    const [releaseRequests, releaseResponses] =
        await Promise.all([
            dbOrView.requests.getAllWhere(
                'uri_prefix', releasePrefix,
            ),
            dbOrView.responses.getAllWhere(
                'uri_prefix', releasePrefix,
            ),
        ]);
    const releasePairs = operationPairsAt(
        releaseRequests, releaseResponses, releasePrefix,
    );

    const transitionPrefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/transition/',
    );
    const [
        transitionRequests, transitionResponses,
    ] = await Promise.all([
        dbOrView.requests.getAllWhere(
            'uri_prefix', transitionPrefix,
        ),
        dbOrView.responses.getAllWhere(
            'uri_prefix', transitionPrefix,
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

// ---- workOrderDocumentHeadFor — the claim-gate graph head -----
// ---- (Phase 15 Task 1, Author gate 4) --------------------------

// Derives the work order's CURRENT document head
// ({display_id, flow_graph, position, …}) from the entity's
// OWN document pairs — the pair-plane successor of
// view.workOrders.getById that postWorkOrderClaimOp still
// reads for flow_graph (Task 2 re-anchors the call site).
//
// REUSE TARGET: the entity-scoped entityPairs computation
// inside workOrderClaimSourcesFor (uri_id-indexed +
// collection-prefix filter) — NOT derivedDocumentEntity /
// documentGetHandler, whose collection-wide prefix scan is
// the forbidden whole-plane shape inside a write gate.
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
    const collectionPrefix = canonicalUriPrefix(
        organization, '/work-orders/',
    );
    const [byIdRequests, byIdResponses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_id', workOrderId),
        dbOrView.responses.getAllWhere('uri_id', workOrderId),
    ]);
    const collectionRequests = byIdRequests.filter(
        (r) => r.uri_prefix === collectionPrefix,
    );
    const collectionResponses = byIdResponses.filter(
        (r) => r.uri_prefix === collectionPrefix,
    );
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
        flow_graph: pickJsonObjectField(
            head.body, 'flow_graph',
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
    canonicalUriPrefix(undefined, '/members/');

export async function deriveMemberStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAllWhere(
                    'uri_prefix', MEMBERS_DOCUMENT_PREFIX,
                ),
                view.responses.getAllWhere(
                    'uri_prefix', MEMBERS_DOCUMENT_PREFIX,
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

// ENTITY-SCOPED sibling of deriveInvitationStates above (Phase
// 14 Task 1): the SAME grant + op-address reduction, restricted
// to ONE known invitation id via INDEXED reads — uri_id for the
// grant/document pair (both share ONE uriId: the operation
// pair's own createdEntityUriId resolution and the document
// PUT's own path segment, api/invitations-domain.ts's
// grantInvitation) and uri_prefix for each of the three op
// addresses — rather than the whole-collection scan
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

    const [byIdRequests, byIdResponses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_id', id),
        dbOrView.responses.getAllWhere('uri_id', id),
    ]);
    const collectionRequests = byIdRequests.filter(
        (r) => r.uri_prefix === INVITATIONS_PREFIX,
    );
    const collectionResponses = byIdResponses.filter(
        (r) => r.uri_prefix === INVITATIONS_PREFIX,
    );
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
        const prefix = canonicalUriPrefix(
            undefined, '/invitations/' + id + '/' + op + '/',
        );
        const [opRequests, opResponses] = await Promise.all([
            dbOrView.requests.getAllWhere('uri_prefix', prefix),
            dbOrView.responses.getAllWhere('uri_prefix', prefix),
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

// ---- deriveTrioFamilyStates — the trio families' state history --
// ---- wiring (gate 5b) --------------------------------------------

// Source (b) of the states-log union. Each trio family's own
// per-id state-history reader is IMPORTED, never rebuilt — the
// entity/lifecycle knowledge lives in its OWN module (derive-
// ideas.ts/derive-projects.ts/derive-records.ts/derive-flows.ts/
// derive-objectives.ts), each already drift-tested against the
// real states table. This function's own job is narrower:
// discover EVERY id that ever had a document pair at the
// family's own prefix — via documentPairsAt, the shared
// family-agnostic reduction (derive-documents.ts), NEVER the
// family's own document derivation — so an id whose CURRENT
// head is a tombstone pair (document DELETE; post-Final every
// document family is soft-delete on the pair plane; the sole
// physical hard-delete is PII erasure) is still walked: its
// earlier trio-embedded transitions belong on the real states
// log forever (append-only), even after the document itself is
// gone.
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
        {
            prefix: canonicalUriPrefix(
                organization, '/objectives/',
            ),
            stateHistory: deriveObjectiveStateHistory,
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

// ---- deriveStates / deriveStatesFor — the FIVE-source union -----
// ---- (Task 5) ------------------------------------------------------

// THE FIVE-SOURCE UNION: source (a) carries the five trio
// families (ideas/projects/records/flows/objectives); the other
// four sources stand alone. The states/:id event-append source
// is retired with the address itself.
//
// The union invariant every id in the merged set is checked
// against: IDENTICAL content across sources is a harmless (never
// expected in practice, since every source above reads a DISJOINT
// address family) double-derivation; DIFFERING content at the SAME
// id is a bug in one of the five sources and must crash loud —
// never a silent last-writer-wins pick (Commandment I:
// Reliability; the Sin of Swallowed Failures).
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

// The full union (gate 5, all five sources), fenced to
// boundOrganization and returned in the states table's own
// id-lex order (byIdAscending) — the order Task 7's route flip
// will serve.
export async function deriveStates(
    db: DbAdapter,
    boundOrganization: Id,
): Promise<StateEntity[]> {
    const sources = await Promise.all([
        deriveTrioFamilyStates(db, boundOrganization),
        deriveMemberStates(db),
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
// ORGANIZATION, never which of the five sources an id belongs
// to), so every source is queried and the result filtered by
// entity_id. An id ordinarily lives in ONE source's address
// family; unionById keeps same-content echoes once and throws
// on a true collision — the same covenant deriveStates already
// holds. organization is REQUIRED — the five trio derives are
// org-prefixed and cannot resolve their own address without
// it. Never a visibility fence here, unlike deriveStates'
// own fenceStatesByOwner call — the caller already names
// both the org AND the entity.
//
// PRECONDITION: callers must already have established
// entityId's visibility to `organization` before calling —
// the route's own gate (api/api.ts's
// entity-states/:id/history guard, resolveOwningOrganization)
// IS the fence. A caller that trusts an unverified
// (organization, entityId) pairing reads another
// organization's rows.
export async function deriveStatesFor(
    db: DbAdapter,
    organization: Id,
    entityId: Id,
): Promise<StateEntity[]> {
    const [
        ideaRows, projectRows, recordRows, flowRows,
        objectiveRows,
        memberStateRows, workOrderRows,
        flowGraphRows, invitationRows,
    ] = await Promise.all([
        deriveIdeaStateHistory(db, organization, entityId),
        deriveProjectStateHistory(db, organization, entityId),
        deriveRecordStateHistory(db, organization, entityId),
        deriveFlowStateHistory(db, organization, entityId),
        deriveObjectiveStateHistory(db, organization, entityId),
        deriveMemberStates(db),
        deriveWorkOrderLifecycle(db),
        deriveFlowGraphStates(db),
        deriveInvitationStates(db),
    ]);
    const rows = [
        ...ideaRows, ...projectRows, ...recordRows, ...flowRows,
        ...objectiveRows,
        ...memberStateRows, ...workOrderRows,
        ...flowGraphRows, ...invitationRows,
    ].filter((row) => row.entity_id === entityId);
    return unionById([rows]).sort(atIdCompare);
}

// ---- documentStateHeadFor — the member_id-echo head helper -----
// ---- (Phase 14 Task 5) --------------------------------------------

// THE FOUR WRITE-PATH DECISION READS THIS SERVES (api/routes.ts:
// postIdeaDocumentOp, postProjectDocumentOp, postRecordDocumentOp,
// postRecordWriteOp's edit arm): each compares an incoming write's
// trio (state_event_id, state, state_at) against the STORED head
// to decide an ECHO (keep the head's member_id) from a fresh
// transition (author as actor) — Decision 7's MEMBER_ID CAVEAT.
// Re-anchored off the row-plane view.states.getCurrentForIn onto
// this entity's OWN document-address trio history
// (documentLifecycleEvents/stateHistoryFrom over
// documentPairsAt), reduced to the (at, id) CURRENT row exactly
// as StateStore.getCurrentForIn's own latestByKey reduction does.
// The states/:id event-append arm is RETIRED with the address.
//
// ENTITY-SCOPED, NO ORGANIZATION ARGUMENT NEEDED: the document
// half resolves its own organization via the `uri_id` index (an
// id is globally unique — computeOwningOrganization's own
// technique above), reading it straight off the MATCHED document
// pair's own stored uri_prefix rather than a caller-supplied
// value. Deliberate, not an oversight: PutHandler (api/routes.ts)
// carries no organization argument at all (only PostHandler
// does), so a caller-supplied organization would force every
// 'trio' family's DocumentFamilyWiring to grow one — widening
// eleven registrations to serve four callers. A genuinely fresh
// id carries no document pair yet (the genesis case), so this
// returns null before an organization is ever needed, mirroring
// getCurrentForIn's own null-for-absent contract.
export async function documentStateHeadFor(
    dbOrView: DbAdapter,
    id: Id,
): Promise<StateEntity | null> {
    const [byIdRequests, byIdResponses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_id', id),
        dbOrView.responses.getAllWhere('uri_id', id),
    ]);
    const documentResponse = byIdResponses.find((response) =>
        ORGANIZATION_NESTED_FAMILY_ADDRESS_PATTERN.test(
            response.uri_prefix,
        ));
    if (documentResponse === undefined) return null;
    const prefix = documentResponse.uri_prefix;
    const documentRequests = byIdRequests.filter(
        (r) => r.uri_prefix === prefix,
    );
    const documentResponses = byIdResponses.filter(
        (r) => r.uri_prefix === prefix,
    );
    const documentHistory = stateHistoryFrom(
        documentLifecycleEvents(
            documentPairsAt(
                documentRequests, documentResponses, prefix,
            ),
        ),
        id,
    );

    return documentHistory.length === 0
        ? null
        : latestByKey(
            documentHistory, () => 'current',
        ).get('current')!;
}
