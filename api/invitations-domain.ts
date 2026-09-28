import type { DbAdapter } from './db.ts';
import {
    ValidationError,
    assertInvitationState,
    type Id,
    type InvitationState,
    type MessagePairEntity,
} from '../shared/types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
    HTTP_FORBIDDEN,
    HTTP_CONFLICT,
    HTTP_PRECONDITION_FAILED,
    HTTP_PRECONDITION_REQUIRED,
} from '../shared/http-errors.ts';
import {
    pickString,
    validateTimestampField,
    validateInvitationTransitionBody,
} from './validators.ts';
import {
    attachEtag,
    canonicalPath,
    entityTagsOf,
    formWriteMessagePair,
    latchesOf,
    runStateWrite,
    unprojected,
} from './message-pair.ts';
import type {
    MessagePair, ReceivedRequest, StateSibling,
} from './message-pair.ts';
import { messageStore } from './message-store.ts';
import { headDocumentOf } from './derive-documents.ts';
import {
    deriveInvitations,
    invitationRowOf,
} from './derive-invitations.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    deriveIdentityPiiRows,
} from './derive-identity-spine.ts';
import {
    deriveInvitationStates,
    invitationLifecycleStatesFor,
} from './derive-states.ts';
import {
    membershipExistsFor,
    seatsPrefixFor,
} from './derive-memberships.ts';
import {
    param,
    storedRevisionDocument,
    versionSnapshotsAt,
} from './document-family.ts';

// An invitation's current state: the latest lifecycle event on
// its id, derived from the message plane.
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
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.identity_id !== identityId
    ) {
        throw new ApiError(
            'Not found: /identities/' + identityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    const joins = await identityViewJoins(db);
    return attachEtag(
        Response.json(
            invitationIdentityView(loaded.invitation, joins),
        ),
        loaded.head.id,
    );
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
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.organization_id !== organization
    ) {
        throw new ApiError(
            'Not found: /organizations/' + organization
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    return attachEtag(
        Response.json(await invitationOrganizationView(
            db, loaded.invitation,
        )),
        loaded.head.id,
    );
}

// POST /organizations/:id/invitations/ — grant pending.
// Path org is the invitation org. A fresh grant answers
// 201 with the invitation; a pending duplicate answers 200
// with the pending one. Pair formation stays inside the
// handler.
export async function postOrganizationInvitationGrant(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    _roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
): Promise<unknown> {
    requireWriteStamp(requestAt, operationId);
    return grantInvitation(
        db, param(params, 0), payload, actor,
        requestAt, operationId, received,
    );
}

// PUT /identities/:id/invitations/:id — accepted or
// declined from pending.
export async function putInvitationOnIdentityNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    _roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
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
            requestAt, operationId, received,
        );
    }
    return declineInvitation(
        db, id, identityId, transition, actor,
        requestAt, operationId, received,
    );
}

// PUT /organizations/:id/invitations/:id — revoked from
// pending.
export async function putInvitationOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    _roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
): Promise<unknown> {
    requireWriteStamp(requestAt, operationId);
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
        requestAt, operationId, received,
    );
}

// Grant: an admin invites an EXISTING identity by email.
// The organization is the path organization. A pending
// invitation for the (organization, identity) pair under
// another id answers 200 and stores nothing; a resend
// naming a taken invitation id answers 409.
async function grantInvitation(
    db: DbAdapter,
    organization: Id,
    body: Record<string, unknown>,
    actor: Id,
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
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
    const outcome = await grantOutcomeFor(
        db, organization, identityId);
    if (outcome.kind === 'member') {
        throw new ApiError(
            'that identity is already a member of this'
            + ' organization', HTTP_CONFLICT);
    }
    // A pending invitation under another id is the one this
    // grant would repeat, so it answers and nothing lands. A
    // resend names its own invitation, a taken name the
    // statement refuses.
    if (outcome.kind === 'existing' && outcome.id !== invitationId) {
        return {
            id: outcome.id, organization_id: organization,
            identity_id: identityId, at: outcome.at,
            state: 'pending',
        };
    }
    if (received === undefined) {
        throw new Error('requestId is required');
    }
    const invitation = {
        id: invitationId, organization_id: organization,
        identity_id: identityId,
        at: grantAt, state: 'pending',
    };
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: received.target,
        routePattern: 'invitations',
        routeSegments: ['invitations'],
        pathSegments: ['invitations'],
        headerFields: received.headerFields,
        body,
        bodyBytes: received.bodyBytes,
        requesterIdentityId: actor,
        requestAt,
        organization: undefined,
        responseBody: invitation,
        operationId,
        requestId: received.requestId,
    });
    const answer = await runStateWrite(db, {
        kind: 'siblings',
        received: messagePair,
        siblings: [{
            method: 'PUT',
            path: canonicalPath(undefined, '/invitations/'),
            name: invitationId,
            state: invitation,
            condition: { kind: 'genesis', declarer: 'handler' },
        }],
        project: unprojected,
        answer: { kind: 'created', location: invitationId },
    });
    if (answer.outcome === 'land') {
        db.postNotification({
            kind: 'scoped',
            organizationIds: [organization],
            identityIds: [identityId],
        });
    }
    return answer.response;
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
    const pending = (await deriveInvitations(adapter)).find(
        inv => inv.organization_id === organization
            && inv.identity_id === identityId
            && inv.state === 'pending',
    );
    return pending === undefined
        ? null
        : { id: pending.id, at: pending.at };
}

async function formInvitationOperationMessagePair(
    actor: Id,
    requestAt: string,
    operationId: string,
    requestId: string,
    body: Record<string, unknown>,
    invitationId: Id,
    op: string,
    received: ReceivedRequest,
): Promise<MessagePair> {
    return formWriteMessagePair({
        method: 'POST',
        pathname: received.target,
        routePattern: 'invitations/:id/' + op,
        routeSegments: ['invitations', ':id', op],
        pathSegments: ['invitations', invitationId, op],
        headerFields: received.headerFields,
        body,
        bodyBytes: received.bodyBytes,
        requesterIdentityId: actor,
        requestAt,
        organization: undefined,
        responseBody: undefined,
        operationId,
        requestId,
    });
}

// Accept, decline, and revoke (§1 C): each is an operation on
// the invitation, latched on the head the client read. The
// invitation lands its terminal state in order on that tag,
// beside `siblings` (accept's seat). A head already in the
// terminal state is the answer, and nothing lands; any other
// state but pending is 409. A tag naming another head was read
// from a head this one replaced: the statement refuses it, so
// no rule of this head is asked.
async function transitionInvitation(
    db: DbAdapter,
    loaded: InvitationHead,
    terminal: InvitationState,
    messagePair: MessagePair,
    // Deferred: accept's seat read runs only when this lands.
    siblings: () => Promise<readonly StateSibling[]>,
): Promise<Response> {
    const inv = loaded.invitation;
    const latches = latchesOf(
        entityTagsOf(messagePair), [loaded.head.id],
    );
    if (latches.kind === 'missing') {
        throw new ApiError(
            'If-Match is required for '
                + INVITATIONS_STORAGE_PREFIX + inv.id,
            HTTP_PRECONDITION_REQUIRED,
        );
    }
    if (latches.kind === 'extra') {
        throw new ApiError(
            'If-Match names no document this operation'
                + ' derives from',
            HTTP_PRECONDITION_FAILED,
        );
    }
    const latch = latches.heads[0]!;
    const current = latch === loaded.head.id;
    if (
        current
        && inv.state !== terminal
        && inv.state !== 'pending'
    ) {
        throw new ApiError(
            'invitation is not pending', HTTP_CONFLICT);
    }
    const lands = current && inv.state === 'pending';
    const parent = {
        method: 'PUT',
        path: INVITATIONS_STORAGE_PREFIX,
        name: inv.id,
        state: {
            id: inv.id,
            organization_id: inv.organization_id,
            identity_id: inv.identity_id,
            at: inv.at,
            state: lands ? terminal : inv.state,
        },
    } as const;
    const [first, ...rest] = lands ? await siblings() : [];
    const answer = await runStateWrite(db, {
        kind: 'siblings',
        received: messagePair,
        siblings: first === undefined
            ? [{
                ...parent,
                condition: { kind: 'in-order', head: latch },
            }]
            : [
                {
                    ...parent,
                    condition: {
                        kind: 'in-order',
                        head: latch,
                        read: loaded.head,
                    },
                },
                first,
                ...rest,
            ],
        project: unprojected,
        answer: { kind: 'parent' },
    });
    if (answer.outcome === 'land') {
        db.postNotification({
            kind: 'scoped',
            organizationIds: [inv.organization_id],
            identityIds: [inv.identity_id],
        });
    }
    return answer.response;
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
    received?: ReceivedRequest,
): Promise<Response> {
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.identity_id !== pathIdentityId
    ) {
        throw new ApiError(
            'Not found: /identities/' + pathIdentityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    if (received === undefined) {
        throw new Error('requestId is required');
    }
    const inv = loaded.invitation;
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
    const messagePair = await formInvitationOperationMessagePair(
        actor, requestAt, operationId, received.requestId,
        {
            membershipId,
            acceptEventId: transition.eventId,
            acceptAt: transition.at,
        },
        id, 'acceptance', received);
    // The seat is granted once: a live seat stays as it is.
    return transitionInvitation(
        db, loaded, 'accepted', messagePair,
        async () => await membershipExistsFor(
                db, inv.organization_id, actor,
            )
            ? []
            : [{
                method: 'PUT',
                path: seatsPrefixFor(inv.organization_id),
                name: actor,
                state: { type: 'member', at: transition.at },
                condition: {
                    kind: 'genesis', declarer: 'handler',
                },
            }],
    );
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
    received?: ReceivedRequest,
): Promise<Response> {
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.identity_id !== pathIdentityId
    ) {
        throw new ApiError(
            'Not found: /identities/' + pathIdentityId
                + '/invitations/' + id,
            HTTP_NOT_FOUND,
        );
    }
    if (received === undefined) {
        throw new Error('requestId is required');
    }
    if (loaded.invitation.identity_id !== actor) {
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
    const messagePair = await formInvitationOperationMessagePair(
        actor, requestAt, operationId, received.requestId,
        {
            declineEventId: transition.eventId,
            declineAt: transition.at,
        },
        id, 'decline', received);
    return transitionInvitation(
        db, loaded, 'declined', messagePair,
        () => Promise.resolve([]),
    );
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
    received?: ReceivedRequest,
): Promise<Response> {
    const loaded = await loadInvitation(db, id);
    if (received === undefined) {
        throw new Error('requestId is required');
    }
    if (
        loaded === null
        || loaded.invitation.organization_id !== pathOrganization
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
    const messagePair = await formInvitationOperationMessagePair(
        actor, requestAt, operationId, received.requestId,
        {
            revokeEventId: transition.eventId,
            revokeAt: transition.at,
        },
        id, 'revocation', received);
    return transitionInvitation(
        db, loaded, 'revoked', messagePair,
        () => Promise.resolve([]),
    );
}

// The invitation's head: its row, and the pair a client's
// If-Match names.
type InvitationHead = {
    readonly invitation: InvitationRow;
    readonly head: MessagePairEntity;
};

async function loadInvitation(
    adapter: DbAdapter,
    id: Id,
): Promise<InvitationHead | null> {
    const head = await messageStore(adapter).getDocumentHead(
        INVITATIONS_STORAGE_PREFIX, id,
    );
    return head === null
        ? null
        : {
            invitation: invitationRowOf(headDocumentOf(head)),
            head,
        };
}

const INVITATIONS_STORAGE_PREFIX =
    '/invitations/';

function invitationDocumentEntity(
    document: { name: Id; body: Record<string, unknown> },
): Record<string, unknown> {
    return {
        id: document.name,
        // The spread body's `at` is the invitation's own
        // grant time — validated at write time by
        // grantInvitation's validateTimestampField(body,
        // 'grantAt', …) and copied to the document body —
        // not a ledger fact: GET
        // .../invitations/:id/versions/ stamps a DIFFERENT
        // `at` on top of this entity — the message pair's
        // own arrival time (versionSnapshotsAt,
        // document-family.ts). Same name, different fact —
        // see InvitationEntity.at (api/types.ts) and the
        // pin at tests/api-versions-etag.test.ts
        // ('invitation versions at is the ledger arrival
        // time, not the invitation grant time').
        ...document.body,
    };
}

async function invitationVersionSnapshots(
    db: DbAdapter,
    id: Id,
): Promise<Record<string, unknown>[]> {
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
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.identity_id !== identityId
    ) {
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
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.identity_id !== identityId
    ) {
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
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.organization_id !== organization
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
    const loaded = await loadInvitation(db, id);
    if (
        loaded === null
        || loaded.invitation.organization_id !== organization
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
