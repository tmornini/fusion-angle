import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from './db.ts';
import type {
    Id, MessagePairEntity, StateEntity,
} from '../shared/types.ts';
import {
    pickString,
    validateWorkOrderVersion,
} from './validators.ts';
import {
    canonicalPath,
    responseRecordOf,
} from './message-pair.ts';
import {
    bodyOf,
    documentMessagePairsAt,
    deriveDocumentsAt,
    byIdAscending,
    type DocumentMessagePair,
} from './derive-documents.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    membershipOf,
    membershipsOfIdentity,
} from './memberships.ts';
import type { WorkOrderVersion } from './work-order-version.ts';

// Message-plane lifecycle derives and ownership resolution
// (Phase 11
// onward; bulk lifecycle collection retired — states-URI
// elimination C3). Per-entity history rides GET
// <family>/:id/versions/. Surviving derives in this module:
//   (a) flows — the per-id derive*StateHistory reader lives
//       in its own family module; write paths use flows'
//       own currentDocumentState / row-stamped trio.
//   (b) deriveMemberStates RETIRED (C4) — leftover
//       /members/ document-trio history; nothing reads
//       that collection.
//   (c) flow-graph node/edge sidecars — live on the flow
//       document-pair body (graphDelta.deletions / revivals);
//       resolveFlowGraphOwner below resolves their owners.
//       No bulk derive remains (C3).
//   (d) deriveInvitationStates — the invitation
//       documents' own PUT history: the
//       grant's 'pending' and the later terminal PUT (spec
//       2026-09-15 § 2). The answering ops (acceptance /
//       decline / revocation) are the HTTP audit alone; no
//       derive reads them.
// bare states/:id, the per-entity history alias, the bulk
// lifecycle collection, the five-source union (deriveStates),
// and nested field-values collection are RETIRED (C3/C4).
//
// THE GATE-15 PRECEDENT (Phase 10): an org fence can be
// reproduced from the MEMBERSHIP MESSAGE PLANE. This module's
// resolveOwningOrganization / resolveGlobalOwner /
// missedReadError apply that technique for ownership and
// event-id fences.
//
// IMMUNE TO THE DELETED FILTER: pairs are append-
// only, so a family's document message pair still names its organization
// forever, regardless of the entity's later lifecycle state.

// ---- resolveOwningOrganization — the MESSAGE-PLANE fence (gate 4) -

// The org-owned, org-nested document families whose OWN id can
// appear as a states.entity_id — mirrors
// api/store-parent-scoped.ts's rawOrganizationOwnedProbes table
// exactly (ideas, projects, flows, records, objectives,
// work-orders); invitations is handled separately below (its
// path is flat, never organization-nested — message-pair.ts's
// canonicalPath / family-registry.ts has no entry for it).
const ORGANIZATION_NESTED_ENTITY_FAMILIES = [
    'ideas', 'projects', 'flows',
    'work-orders', 'record-types', 'objectives',
] as const;

const INVITATIONS_PREFIX =
    canonicalPath(undefined, '/invitations/');

// organizations is the tenant root (global plane, never itself
// organization-nested — derive-organizations.ts). An
// organizations document id resolves to itself (Phase 15 Task
// 1, Author gate 3 — the ONE new resolveOwningOrganization
// leg).
const ORGANIZATIONS_PATH_PREFIX =
    canonicalPath(undefined, '/organizations/');

// ALL-orgs, server-side ownership resolution — distinct from
// selectIdentityOrganizations, which filters to the path
// identity's live seats. This walk NEVER
// filters by caller: it resolves which org OWNS an entity,
// independent of who is asking (Phase 12 Task 5: the row source
// flips to the message-plane derivation; the ALL-orgs, uncaller-
// filtered shape is untouched).
async function organizationIds(
    db: DbAdapter,
): Promise<readonly Id[]> {
    const organizations = await deriveOrganizations(db);
    return organizations.map((organization) => organization.id);
}

// The invitation's own organization_id — carried in the STORED
// response, the wire (derive-invitations.ts's own precedent),
// never the path (the invitations path is flat, unlike every
// org-nested family above). Document read of this id at the
// invitations collection — the same head fold, reused rather
// than reimplemented.
async function resolveInvitationOwner(
    db: DbAdapter,
    entityId: Id,
): Promise<Id | null> {
    const messagePairs = await db.messagePairs.getDocumentHistory(
        INVITATIONS_PREFIX, entityId,
    );
    const document = deriveDocumentsAt(
        messagePairs, INVITATIONS_PREFIX,
    ).get(entityId);
    return document === undefined
        ? null
        : pickString(document.body, 'organization_id');
}

// flow_nodes/flow_edges carry NO document of their own
// (message-pair.ts: absent from
// MESSAGE_PAIR_WIRED_ROUTE_PATTERNS) — they ride folded inside the
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
        const prefix = canonicalPath(organization, '/flows/');
        const stored = await db.messagePairs.getCollectionPairs(prefix,
        );
        for (const messagePair of documentMessagePairsAt(
            stored, prefix,
        )) {
            if (graphDeltaHasMember(messagePair.body, entityId)) {
                return organization;
            }
        }
    }
    return null;
}

// The org-less member/identity fallback (an ai-member/human-member
// id, i.e. an identity id). An accepted membership owns. The
// bound organization is membershipOf; any other is the first
// other row from membershipsOfIdentity.
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
async function organizationHasMemberMessagePair(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<boolean> {
    const membership = await membershipOf(
        db, organization, identityId,
    );
    return membership !== null;
}

async function resolveViaMembershipPairPlane(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    if (
        await organizationHasMemberMessagePair(
            db, boundOrganization, entityId,
        )
    ) {
        return boundOrganization;
    }
    const memberships = await membershipsOfIdentity(
        db, entityId,
    );
    for (const membership of memberships) {
        if (
            membership.organization_id === boundOrganization
        ) {
            continue;
        }
        return membership.organization_id;
    }
    return null;
}

async function computeOwningOrganization(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    // (e) organizations self-as-owner: the document id IS
    // the owning organization. Document read of this id at
    // the organizations collection.
    const organizationRows =
        await db.messagePairs.getDocumentHistory(
            ORGANIZATIONS_PATH_PREFIX, entityId,
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
            const prefix = canonicalPath(
                organization, '/' + family + '/',
            );
            const rows =
                await db.messagePairs.getDocumentHistory(
                    prefix, entityId,
                );
            if (rows.length > 0) {
                return organization;
            }
        }
    }

    // (c) invitations: flat path, org lives in the body.
    const invitationOwner =
        await resolveInvitationOwner(db, entityId);
    if (invitationOwner !== null) return invitationOwner;

    // (d) flow-node/edge events: folded into the flow's own
    // document-pair prefix.
    const graphOwner = await resolveFlowGraphOwner(
        db, entityId, boundOrganization,
    );
    if (graphOwner !== null) return graphOwner;

    // (b) the membership message plane: org-less member/identity ids.
    return await resolveViaMembershipPairPlane(
        db, entityId, boundOrganization,
    );
}

// The MESSAGE-PLANE fence resolver (gate 4 + Phase 15 gate 3).
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
// fenceStatesByOwner's own concern: the membership-message-plane leg
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

// Document-scoped 403-vs-404 probe. Same id at two
// collections is two documents. Miss at THIS document is
// 404. The probe reads the bound organization's own
// collection, so a foreign id in an organization-nested
// family is a miss there: 404. Only the global plane
// (organizations, invitations, role grants) can 403.
const ROLE_GRANTS_URI_PREFIX =
    canonicalPath(undefined, '/role-grants/');

// Organization-nested path prefixes:
// /organizations/{id}/...
const ORGANIZATION_NESTED_URI_PREFIX =
    /^\/organizations\/([^/]+)\//;

// Table → family path segment for the document-scoped
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
        return ORGANIZATIONS_PATH_PREFIX;
    }
    if (table === 'invitations') {
        return INVITATIONS_PREFIX;
    }
    if (table === 'role_grants') {
        return ROLE_GRANTS_URI_PREFIX;
    }
    const family = OWNER_PROBE_FAMILY[table];
    if (family === undefined) return undefined;
    return canonicalPath(
        organization, '/' + family + '/',
    );
}

function ownerFromPath(
    path: string,
    name: Id,
    message: string,
): Id | null {
    if (path === ORGANIZATIONS_PATH_PREFIX) {
        return name;
    }
    const nested = ORGANIZATION_NESTED_URI_PREFIX.exec(
        path,
    );
    if (nested !== null) return nested[1]!;
    if (
        path === ROLE_GRANTS_URI_PREFIX
        || path === INVITATIONS_PREFIX
    ) {
        const body = bodyOf(message);
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
        const pairsAt =
            await db.messagePairs.getDocumentHistory(
                collection, entityId,
            );
        if (pairsAt.length === 0) return null;
        for (const messagePair of pairsAt) {
            const owner = ownerFromPath(
                messagePair.path,
                entityId,
                messagePair.response,
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
// ForeignOrganizationError (403). The probe collection is
// the bound organization's own (resolveGlobalOwner →
// ownerProbeCollection), so an organization-nested
// family's foreign id is owner-null: 404. Only the global
// plane (organizations, invitations, role grants) can
// reach 403. probeId defaults to id;
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
// resolveOwningOrganization / missedReadError directly.

// ---- the work-order head (§5) -------------------------------------

// The work order's head version, from its stored response
// (§5). Null when it was never written or is gone.
export async function workOrderHeadFor(
    db: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<{
    readonly version: WorkOrderVersion,
    readonly pair: MessagePairEntity,
} | null> {
    const pair = await db.messagePairs.getHeadPair(
        canonicalPath(organization, '/work-orders/'),
        workOrderId,
    );
    if (pair === null || pair.method !== 'PUT') {
        return null;
    }
    return { version: versionOf(pair), pair };
}

function versionOf(pair: MessagePairEntity): WorkOrderVersion {
    const body = responseRecordOf(pair.response);
    if (body === undefined) {
        throw new Error(
            'a work-order version carries no state: ' + pair.id,
        );
    }
    return validateWorkOrderVersion(body);
}

// deriveMemberStates / MEMBERS_DOCUMENT_PREFIX RETIRED
// (C4) — leftover /members/ document-trio history.

// deriveFlowGraphStates RETIRED with the bulk lifecycle
// collection (states-URI elimination C3). Graph node/edge
// deleted/restored sidecars still live on the flow
// document-pair body (graphDelta.deletions / revivals —
// SIDECAR-KEEP); resolveFlowGraphOwner above still resolves
// their owners for fences.

// The invitation lifecycle, from the invitation document's
// own history (api/derive-invitations.ts owns the head
// read): every PUT at /invitations/<id> is one lifecycle
// row — one row per PUT, the grant's 'pending' and the
// terminal — id-lex ordered (a caller wanting chronological
// order sorts by (at, id) itself). `id` and `at` are the
// pair's own; `member_id` is the pair's requester (the
// granting admin, the answering invitee, the revoking
// admin). A duplicate grant writes no document and a no-op
// resend appends no PUT, so neither has a row.
function invitationLifecycleRowsOf(
    messagePairs: readonly DocumentMessagePair[],
): StateEntity[] {
    const rows: StateEntity[] = [];
    for (const messagePair of messagePairs) {
        rows.push({
            id: messagePair.id,
            entity_id: messagePair.name,
            state: pickString(messagePair.body, 'state'),
            member_id: messagePair.requesterIdentityId,
            at: messagePair.at,
        });
    }
    return rows.sort(byIdAscending);
}

// Every invitation's lifecycle: ONE collection read of
// /invitations/ — every pair of every document there.
export async function deriveInvitationStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    const stored = await db.messagePairs.getCollectionPairs(
        INVITATIONS_PREFIX,
    );
    return invitationLifecycleRowsOf(
        documentMessagePairsAt(stored, INVITATIONS_PREFIX),
    );
}

// deriveTrioFamilyStates / deriveStates / fenceStatesByOwner /
// unionById / sameStateEntity RETIRED with the bulk lifecycle
// collection (states-URI elimination C3). documentStateHeadFor
// RETIRED with C5 (write paths use family currentDocumentState).
// Per-entity history lives on GET <family>/:id/versions/ and
// family-scoped derives (derive*StateHistory, invitation
// sources).
