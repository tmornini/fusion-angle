import type { DbAdapter } from './db.ts';
import { MESSAGE_TABLES } from './db.ts';
import {
    ValidationError,
    assertInvitationState,
    type Id,
    type InvitationState,
} from './types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
    HTTP_FORBIDDEN,
    HTTP_CONFLICT,
    HTTP_OK,
    HTTP_NO_CONTENT,
} from './http-errors.ts';
import {
    pickString,
    validateTimestampField,
    validateInvitationTransitionBody,
} from './validators.ts';
import {
    formWritePair,
    storedResponseFor,
    appendMessagePair,
} from './message-pair.ts';
import type { MessagePair } from './message-pair.ts';
import { formDocumentPairFor } from './routes.ts';
import { ORGANIZATION_MEMBER_DETAIL_PATTERN } from
    './family-registry.ts';
import {
    deriveInvitations,
    invitationOpStateFor,
} from './derive-invitations.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    deriveIdentityPiiRows,
} from './derive-identity-spine.ts';
import {
    deriveInvitationStates,
    invitationLifecycleStatesFor,
} from './derive-states.ts';
import { membershipExistsFor } from './derive-memberships.ts';
import {
    param,
    storedRevisionDocument,
    versionSnapshotsAt,
} from './document-family.ts';

// An invitation's current state: the latest lifecycle event on
// its id, derived from the pair plane.
//
// FLIPPED (Phase 14 Task 2): re-points onto
// invitationLifecycleStatesFor (api/derive-states.ts, Task 1) —
// wire-identical to the old adapter.states.getCurrentFor(id)
// dispatch it replaces. latestByKey applies the SAME (at, id)
// total order. Null when no lifecycle event has been recorded.
// Exported for tests/pin-invitation-write-path-parity.test.ts.
export async function currentInvitationState(
    adapter: DbAdapter,
    id: Id,
): Promise<InvitationState | null> {
    const rows = await invitationLifecycleStatesFor(adapter, id);
    const latest = latestByKey(rows, ev => ev.entity_id).get(id);
    return latest === undefined
        ? null
        : assertInvitationState(latest.state, 'invitation ' + id);
}

function requireAdmin(
    roles: readonly string[],
    message: string,
): void {
    if (!roles.includes('admin')) {
        throw new ApiError(message, HTTP_FORBIDDEN);
    }
}

function requireSelfOrAdmin(
    actor: Id,
    identityId: Id,
    roles: readonly string[],
    message: string,
): void {
    if (actor !== identityId && !roles.includes('admin')) {
        throw new ApiError(message, HTTP_FORBIDDEN);
    }
}

function requireWriteStamp(
    requestAt: string,
    operationId: string,
): void {
    if (requestAt === '' || operationId === '') {
        throw new Error(
            'invitation write missing requestAt'
            + ' or Operation-ID',
        );
    }
}

type InvitationRow = {
    id: Id;
    organization_id: Id;
    identity_id: Id;
    at: string;
    state: InvitationState;
};

async function identityViewJoins(
    db: DbAdapter,
): Promise<{
    organizationName: Map<Id, string>;
    personName: Map<Id, string>;
    eventsFor: Map<Id, readonly { state: string; member_id: Id }[]>;
}> {
    const organizationName = new Map(
        (await deriveOrganizations(db))
            .map(o => [o.id, o.name]));
    const personName = new Map(
        (await deriveIdentityPiiRows(db))
            .map(p => [p.id, p.name]));
    const events = await deriveInvitationStates(db);
    return {
        organizationName,
        personName,
        eventsFor: Map.groupBy(events, ev => ev.entity_id),
    };
}

function invitationIdentityView(
    inv: InvitationRow,
    joins: Awaited<ReturnType<typeof identityViewJoins>>,
): Record<string, unknown> {
    const grant = (joins.eventsFor.get(inv.id) ?? [])
        .find(ev => ev.state === 'pending');
    const name = joins.organizationName.get(
        inv.organization_id,
    );
    const inviter = grant === undefined
        ? undefined
        : joins.personName.get(grant.member_id);
    return {
        id: inv.id,
        organization_id: inv.organization_id,
        ...(name !== undefined
            ? { organization_name: name }
            : {}),
        identity_id: inv.identity_id,
        ...(inviter !== undefined
            ? { invited_by_name: inviter }
            : {}),
        at: inv.at,
        state: inv.state,
    };
}

async function invitationOrganizationView(
    db: DbAdapter,
    inv: InvitationRow,
): Promise<Record<string, unknown>> {
    const email = new Map(
        (await deriveIdentityPiiRows(db))
            .map(p => [p.id, p.email]));
    const inviteeEmail = email.get(inv.identity_id);
    return {
        id: inv.id,
        organization_id: inv.organization_id,
        identity_id: inv.identity_id,
        ...(inviteeEmail !== undefined
            ? { invitee_email: inviteeEmail }
            : {}),
        at: inv.at,
        state: inv.state,
    };
}

// GET /identities/:id/invitations/ — that identity's
// invitations. Self or admin.
export async function getIdentityInvitations(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    const identityId = param(params, 0);
    requireSelfOrAdmin(
        actor, identityId, roles,
        'forbidden: invitation list is self or admin',
    );
    const mine = (await deriveInvitations(db))
        .filter(inv => inv.identity_id === identityId);
    if (mine.length === 0) return [];
    const joins = await identityViewJoins(db);
    return mine.map(inv => invitationIdentityView(inv, joins));
}

// GET /identities/:id/invitations/:id
export async function getInvitationOnIdentityNest(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    const identityId = param(params, 0);
    const id = param(params, 1);
    requireSelfOrAdmin(
        actor, identityId, roles,
        'forbidden: only the invitee or an admin'
        + ' may read this invitation',
    );
    const inv = await loadInvitation(db, id);
    if (inv === null || inv.identity_id !== identityId) {
        throw new ApiError(
            'Not found: /identities/' + identityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    const joins = await identityViewJoins(db);
    return invitationIdentityView(inv, joins);
}

// GET /organizations/:id/invitations/ — pending invites
// for that organization. Admin of the fenced org.
export async function getOrganizationInvitations(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    requireAdmin(
        roles,
        'forbidden: listing sent invitations requires'
        + ' an admin role',
    );
    const organization = param(params, 0);
    const rows = (await deriveInvitations(db))
        .filter(inv => inv.organization_id === organization
            && inv.state === 'pending');
    if (rows.length === 0) return [];
    const email = new Map(
        (await deriveIdentityPiiRows(db))
            .map(p => [p.id, p.email]));
    return rows.map(inv => {
        const inviteeEmail = email.get(inv.identity_id);
        return {
            id: inv.id,
            organization_id: inv.organization_id,
            identity_id: inv.identity_id,
            ...(inviteeEmail !== undefined
                ? { invitee_email: inviteeEmail }
                : {}),
            at: inv.at,
            state: inv.state,
        };
    });
}

// GET /organizations/:id/invitations/:id
export async function getInvitationOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    requireAdmin(
        roles,
        'forbidden: reading an organization invitation'
        + ' requires an admin role',
    );
    const organization = param(params, 0);
    const id = param(params, 1);
    const inv = await loadInvitation(db, id);
    if (
        inv === null
        || inv.organization_id !== organization
    ) {
        throw new ApiError(
            'Not found: /organizations/' + organization
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    return invitationOrganizationView(db, inv);
}

// POST /organizations/:id/invitations/ — grant pending.
// Path org is the invitation org. Answers 200 for fresh
// and duplicate. Pair formation stays inside the handler.
export async function postOrganizationInvitationGrant(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _pair: MessagePair | undefined,
    _organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
): Promise<unknown> {
    requireWriteStamp(requestAt, operationId);
    requireAdmin(
        roles,
        'forbidden: granting an invitation requires an'
        + ' admin role',
    );
    return grantInvitation(
        db, param(params, 0), payload, actor,
        requestAt, operationId,
    );
}

// PUT /identities/:id/invitations/:id — accepted or
// declined from pending.
export async function putInvitationOnIdentityNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _pair: MessagePair | undefined,
    _organization: Id | undefined,
    _roles: readonly string[],
    requestAt: string,
    operationId: string,
): Promise<unknown> {
    requireWriteStamp(requestAt, operationId);
    const identityId = param(params, 0);
    const id = param(params, 1);
    const transition = validateInvitationTransitionBody(
        payload,
    );
    if (
        transition.state !== 'accepted'
        && transition.state !== 'declined'
    ) {
        throw new ApiError(
            'forbidden: identity nest may set accepted'
            + ' or declined',
            HTTP_FORBIDDEN,
        );
    }
    if (transition.state === 'accepted') {
        return acceptInvitation(
            db, id, identityId, transition, actor,
            requestAt, operationId,
        );
    }
    return declineInvitation(
        db, id, identityId, transition, actor,
        requestAt, operationId,
    );
}

// PUT /organizations/:id/invitations/:id — revoked from
// pending.
export async function putInvitationOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _pair: MessagePair | undefined,
    _organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
): Promise<unknown> {
    requireWriteStamp(requestAt, operationId);
    requireAdmin(
        roles,
        'forbidden: revoking an invitation requires an'
        + ' admin role',
    );
    const organization = param(params, 0);
    const id = param(params, 1);
    const transition = validateInvitationTransitionBody(
        payload,
    );
    if (transition.state !== 'revoked') {
        throw new ApiError(
            'forbidden: organization nest may set'
            + ' revoked',
            HTTP_FORBIDDEN,
        );
    }
    return revokeInvitation(
        db, id, organization, transition, actor,
        requestAt, operationId,
    );
}

// Grant: an admin invites an EXISTING identity by email.
// The org is the path organization. Idempotent on an
// outstanding pending invite for the (org, identity) pair.
async function grantInvitation(
    db: DbAdapter,
    organization: Id,
    body: Record<string, unknown>,
    actor: Id,
    requestAt: string,
    operationId: string,
): Promise<unknown> {
    const email = typeof body.email === 'string'
        ? body.email : '';
    if (email === '') {
        throw new ApiError(
            'an "email" is required', HTTP_BAD_REQUEST);
    }
    let invitationId: string;
    let grantEventId: string;
    let grantAt: string;
    try {
        invitationId = pickString(body, 'invitationId');
        grantEventId = pickString(body, 'grantEventId');
        grantAt = validateTimestampField(
            body, 'grantAt', 'grant',
        );
    } catch (e) {
        if (e instanceof ValidationError) {
            throw new ApiError(e.message, HTTP_BAD_REQUEST);
        }
        throw e;
    }
    if (invitationId === '') {
        throw new ApiError(
            'invitationId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    if (grantEventId === '') {
        throw new ApiError(
            'grantEventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    // DEMO-TIER POSTURE: a missing email 404s and an
    // already-member 409s, so an org admin can tell whether
    // an email maps to an existing identity.
    const match = (await deriveIdentityPiiRows(db))
        .find(p => p.email === email);
    if (match === undefined) {
        throw new ApiError(
            'no identity with that email', HTTP_NOT_FOUND);
    }
    const identityId = match.id;
    const storedBody: Record<string, unknown> = { ...body };
    delete storedBody.email;
    storedBody.identity_id = identityId;
    const preOutcome = await grantOutcomeFor(
        db, organization, identityId);
    if (preOutcome.kind === 'member') {
        throw new ApiError(
            'that identity is already a member of this'
            + ' organization', HTTP_CONFLICT);
    }
    const responseBody = preOutcome.kind === 'existing'
        ? {
            id: preOutcome.id, organization_id: organization,
            identity_id: identityId, at: preOutcome.at,
            state: 'pending',
        }
        : {
            id: invitationId, organization_id: organization,
            identity_id: identityId,
            at: grantAt, state: 'pending',
        };
    const pair = await formWritePair({
        method: 'POST', pathname: '/invitations',
        routePattern: 'invitations',
        routeSegments: ['invitations'],
        pathSegments: ['invitations'],
        headerFields: [],
        body: storedBody, requesterIdentityId: actor,
        requestAt, organization: undefined,
        responseStatus: HTTP_OK, responseBody,
        operationId,
    });
    const replay = await storedResponseFor(
        db, pair.requestHash);
    if (replay !== undefined) {
        return responseBody;
    }
    const documentBody = {
        organization_id: organization,
        identity_id: identityId,
        at: grantAt,
    };
    const document = preOutcome.kind === 'fresh'
        ? await formWritePair({
            method: 'PUT',
            pathname: '/invitations/' + invitationId,
            routePattern: 'invitations/:id',
            routeSegments: ['invitations', ':id'],
            pathSegments: ['invitations', invitationId],
            headerFields: [],
            body: documentBody,
            requesterIdentityId: actor,
            requestAt,
            organization: undefined,
            responseStatus: HTTP_OK,
            responseBody: { id: invitationId, ...documentBody },
            operationId,
        })
        : undefined;
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            const outcome = await grantOutcomeFor(
                view, organization, identityId);
            const agrees = outcome.kind === preOutcome.kind
                && (outcome.kind !== 'existing'
                    || (preOutcome.kind === 'existing'
                        && outcome.id === preOutcome.id));
            if (!agrees) {
                throw new Error(
                    'grantInvitation: the duplicate-grant'
                    + ' check raced between its pre-tx read'
                    + ' and its transaction — retry the'
                    + ' request',
                );
            }
            await appendMessagePair(view, pair);
            if (document !== undefined) {
                await appendMessagePair(view, document);
            }
        },
    );
    if (preOutcome.kind === 'fresh') {
        db.postNotification({
            kind: 'scoped',
            organizationIds: [organization],
            identityIds: [identityId],
        });
    }
    return responseBody;
}

type GrantOutcome =
    | { kind: 'member' }
    | { kind: 'existing'; id: Id; at: string }
    | { kind: 'fresh' };

async function grantOutcomeFor(
    adapter: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<GrantOutcome> {
    const member = await membershipExistsFor(
        adapter, organization, identityId);
    if (member) return { kind: 'member' };
    const existing = await pendingInvitationFor(
        adapter, organization, identityId);
    return existing === null
        ? { kind: 'fresh' }
        : { kind: 'existing', id: existing.id, at: existing.at };
}

// The org's outstanding pending invitation for an identity,
// or null. Exported for write-path parity pins.
export async function pendingInvitationFor(
    adapter: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<{ id: Id; at: string } | null> {
    const candidates = (await deriveInvitations(adapter))
        .filter(inv => inv.organization_id === organization
            && inv.identity_id === identityId);
    for (const inv of candidates) {
        const state = await invitationOpStateFor(adapter, inv.id);
        if (state === undefined) {
            return { id: inv.id, at: inv.at };
        }
    }
    return null;
}

async function formInvitationOpPair(
    actor: Id,
    requestAt: string,
    operationId: string,
    body: Record<string, unknown>,
    invitationId: Id,
    op: string,
): Promise<MessagePair> {
    return formWritePair({
        method: 'POST',
        pathname: '/invitations/' + invitationId + '/' + op,
        routePattern: 'invitations/:id/' + op,
        routeSegments: ['invitations', ':id', op],
        pathSegments: ['invitations', invitationId, op],
        headerFields: [],
        body, requesterIdentityId: actor,
        requestAt, organization: undefined,
        responseStatus: HTTP_NO_CONTENT,
        responseBody: undefined,
        operationId,
    });
}

async function acceptInvitation(
    db: DbAdapter,
    id: Id,
    pathIdentityId: Id,
    transition: {
        readonly membershipId?: string;
        readonly eventId: string;
        readonly at: string;
    },
    actor: Id,
    requestAt: string,
    operationId: string,
): Promise<undefined> {
    const inv = await loadInvitation(db, id);
    if (inv === null || inv.identity_id !== pathIdentityId) {
        throw new ApiError(
            'Not found: /identities/' + pathIdentityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    if (inv.identity_id !== actor) {
        throw new ApiError(
            'forbidden: only the invitee may accept',
            HTTP_FORBIDDEN);
    }
    const membershipId = transition.membershipId ?? '';
    if (membershipId === '') {
        throw new ApiError(
            'membershipId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    if (transition.eventId === '') {
        throw new ApiError(
            'eventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    const storedBody = {
        membershipId,
        acceptEventId: transition.eventId,
        acceptAt: transition.at,
    };
    const pair = await formInvitationOpPair(
        actor, requestAt, operationId,
        storedBody, id, 'acceptance');
    const replay = await storedResponseFor(
        db, pair.requestHash);
    if (replay !== undefined) {
        return undefined;
    }
    const seatDocumentBody = {
        type: 'member',
        at: transition.at,
    };
    const seatDocument = await formDocumentPairFor(
        db, {
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            params: [
                inv.organization_id, actor,
            ],
            body: seatDocumentBody,
            requesterIdentityId: actor,
            requestAt,
            organization: inv.organization_id,
            operationId,
        },
    );
    let conflict = false;
    let committed = false;
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            const state = await currentInvitationState(view, id);
            // Already accepted: no-op. Declined/revoked: 409.
            if (state === 'accepted') {
                return;
            }
            if (state !== 'pending') {
                conflict = true;
                return;
            }
            const already = await membershipExistsFor(
                view, inv.organization_id, actor);
            if (!already) {
                await appendMessagePair(view, seatDocument);
            }
            await appendMessagePair(view, pair);
            committed = true;
        },
    );
    if (conflict) {
        throw new ApiError(
            'invitation is not pending', HTTP_CONFLICT);
    }
    if (!committed) {
        return undefined;
    }
    db.postNotification({
        kind: 'scoped',
        organizationIds: [inv.organization_id],
        identityIds: [inv.identity_id],
    });
    return undefined;
}

async function declineInvitation(
    db: DbAdapter,
    id: Id,
    pathIdentityId: Id,
    transition: {
        readonly eventId: string;
        readonly at: string;
    },
    actor: Id,
    requestAt: string,
    operationId: string,
): Promise<undefined> {
    const inv = await loadInvitation(db, id);
    if (inv === null || inv.identity_id !== pathIdentityId) {
        throw new ApiError(
            'Not found: /identities/' + pathIdentityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    if (inv.identity_id !== actor) {
        throw new ApiError(
            'forbidden: only the invitee may decline',
            HTTP_FORBIDDEN);
    }
    if (transition.eventId === '') {
        throw new ApiError(
            'eventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    const storedBody = {
        declineEventId: transition.eventId,
        declineAt: transition.at,
    };
    const pair = await formInvitationOpPair(
        actor, requestAt, operationId,
        storedBody, id, 'decline');
    const replay = await storedResponseFor(
        db, pair.requestHash);
    if (replay !== undefined) {
        return undefined;
    }
    let conflict = false;
    let committed = false;
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            const state = await currentInvitationState(view, id);
            // Already declined: no-op. Accepted/revoked: 409.
            if (state === 'declined') {
                return;
            }
            if (state !== 'pending') {
                conflict = true;
                return;
            }
            await appendMessagePair(view, pair);
            committed = true;
        },
    );
    if (conflict) {
        throw new ApiError(
            'invitation is not pending', HTTP_CONFLICT);
    }
    if (!committed) {
        return undefined;
    }
    db.postNotification({
        kind: 'scoped',
        organizationIds: [inv.organization_id],
        identityIds: [inv.identity_id],
    });
    return undefined;
}

async function revokeInvitation(
    db: DbAdapter,
    id: Id,
    pathOrganization: Id,
    transition: {
        readonly eventId: string;
        readonly at: string;
    },
    actor: Id,
    requestAt: string,
    operationId: string,
): Promise<undefined> {
    const inv = await loadInvitation(db, id);
    if (
        inv === null
        || inv.organization_id !== pathOrganization
    ) {
        throw new ApiError(
            'Not found: /organizations/' + pathOrganization
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    if (transition.eventId === '') {
        throw new ApiError(
            'eventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    const storedBody = {
        revokeEventId: transition.eventId,
        revokeAt: transition.at,
    };
    const pair = await formInvitationOpPair(
        actor, requestAt, operationId,
        storedBody, id, 'revocation');
    const replay = await storedResponseFor(
        db, pair.requestHash);
    if (replay !== undefined) {
        return undefined;
    }
    let conflict = false;
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            const state = await currentInvitationState(view, id);
            if (state !== 'pending') {
                conflict = true;
                return;
            }
            await appendMessagePair(view, pair);
        },
    );
    if (conflict) {
        throw new ApiError(
            'invitation is not pending', HTTP_CONFLICT);
    }
    db.postNotification({
        kind: 'scoped',
        organizationIds: [inv.organization_id],
        identityIds: [inv.identity_id],
    });
    return undefined;
}

async function loadInvitation(
    adapter: DbAdapter,
    id: Id,
): Promise<InvitationRow | null> {
    const found = (await deriveInvitations(adapter))
        .find(inv => inv.id === id);
    return found === undefined ? null : found;
}

const INVITATIONS_STORAGE_PREFIX =
    '/invitations/';

function invitationDocumentEntity(
    document: { uriId: Id; body: Record<string, unknown> },
): Record<string, unknown> {
    return {
        id: document.uriId,
        ...document.body,
    };
}

async function invitationVersionSnapshots(
    db: DbAdapter,
    id: Id,
): Promise<unknown[]> {
    return versionSnapshotsAt(
        db, INVITATIONS_STORAGE_PREFIX, id,
        invitationDocumentEntity,
    );
}

async function invitationVersionSnapshot(
    db: DbAdapter,
    id: Id,
    etag: string,
): Promise<Record<string, unknown> | undefined> {
    const document = await storedRevisionDocument(
        db, INVITATIONS_STORAGE_PREFIX, id, etag,
    );
    if (document === undefined) return undefined;
    return invitationDocumentEntity(document);
}

// GET /identities/:id/invitations/:id/versions/
export async function getInvitationVersionsOnIdentityNest(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    const identityId = param(params, 0);
    const id = param(params, 1);
    requireSelfOrAdmin(
        actor, identityId, roles,
        'forbidden: only the invitee or an admin'
        + ' may read this invitation',
    );
    const inv = await loadInvitation(db, id);
    if (inv === null || inv.identity_id !== identityId) {
        throw new ApiError(
            'Not found: /identities/' + identityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    return invitationVersionSnapshots(db, id);
}

// GET /identities/:id/invitations/:id/versions/:etag
export async function getInvitationVersionOnIdentityNest(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    const identityId = param(params, 0);
    const id = param(params, 1);
    const etag = param(params, params.length - 1);
    requireSelfOrAdmin(
        actor, identityId, roles,
        'forbidden: only the invitee or an admin'
        + ' may read this invitation',
    );
    const inv = await loadInvitation(db, id);
    if (inv === null || inv.identity_id !== identityId) {
        throw new ApiError(
            'Not found: /identities/' + identityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    const snapshot = await invitationVersionSnapshot(
        db, id, etag,
    );
    if (snapshot === undefined) {
        throw new ApiError(
            'Not found: /identities/' + identityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    return snapshot;
}

// GET /organizations/:id/invitations/:id/versions/
export async function getInvitationVersionsOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    requireAdmin(
        roles,
        'forbidden: reading an organization invitation'
        + ' requires an admin role',
    );
    const organization = param(params, 0);
    const id = param(params, 1);
    const inv = await loadInvitation(db, id);
    if (
        inv === null
        || inv.organization_id !== organization
    ) {
        throw new ApiError(
            'Not found: /organizations/' + organization
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    return invitationVersionSnapshots(db, id);
}

// GET /organizations/:id/invitations/:id/versions/:etag
export async function getInvitationVersionOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<unknown> {
    requireAdmin(
        roles,
        'forbidden: reading an organization invitation'
        + ' requires an admin role',
    );
    const organization = param(params, 0);
    const id = param(params, 1);
    const etag = param(params, params.length - 1);
    const inv = await loadInvitation(db, id);
    if (
        inv === null
        || inv.organization_id !== organization
    ) {
        throw new ApiError(
            'Not found: /organizations/' + organization
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    const snapshot = await invitationVersionSnapshot(
        db, id, etag,
    );
    if (snapshot === undefined) {
        throw new ApiError(
            'Not found: /organizations/' + organization
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    return snapshot;
}
