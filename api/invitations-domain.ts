import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import {
    ApiError,
    HTTP_FORBIDDEN,
    HTTP_CONFLICT,
    HTTP_NOT_FOUND,
} from '../shared/http-errors.ts';
import {
    ValidationError,
    nowUtc,
    type Id,
    type InvitationState,
    type MembershipEntity,
    type MessagePairEntity,
} from '../shared/types.ts';
import {
    assertOnlyKeys,
    validateMembershipRequest,
    validateTimestampField,
} from './validators.ts';
import {
    formWriteMessagePair,
    httpDateOf,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
    parseEntityTags,
    runStateWrite,
} from './message-pair.ts';
import type {
    MessagePair,
    ReceivedRequest,
    SiblingCondition,
    StateAnswerKind,
    StateSibling,
    WriteAnswer,
} from './message-pair.ts';
import { bodyOf } from './derive-documents.ts';
import {
    deriveIdentityPiiRows,
} from './derive-identity-spine.ts';
import { seatsPrefixFor } from './derive-memberships.ts';
import { param } from './document-family.ts';
import {
    selectVersionAt,
    selectVersionsAt,
    wholeCollectionSelection,
    wholeHeadSelection,
    type HeadSelection,
} from './head-reads.ts';
import {
    memberSeesState,
    type ViewQuery,
} from './membership-gate.ts';
import {
    lastAdminRefusal,
    membershipOfHead,
    membershipTransition,
    MEMBERSHIPS_PATH,
    organizationMembershipHeads,
    identityMembershipHeads,
    type MembershipActor,
    type MembershipRequest,
} from './memberships.ts';
import {
    membershipNameOf,
    parsedMembershipName,
    type MembershipName,
} from '../shared/membership-name.ts';
import {
    responseOfWire,
    servedResponse,
} from './served-response.ts';

const ADMIN_WRITE =
    'forbidden: an organization invitation write'
    + ' requires an admin role';
const INVITEE_READ =
    'forbidden: only the invitee or an admin'
    + ' may read this invitation';
const LIST_READ =
    'forbidden: invitation list is self or admin';

const OPERATION_PATTERN =
    'invitations/:membership-name/:state';
const OPERATION_SEGMENTS = [
    'invitations', ':membership-name', ':state',
];

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

function requireInvitee(
    actor: Id,
    identityId: Id,
    state: InvitationState,
): void {
    if (actor === identityId) return;
    const verb = state === 'accepted'
        ? 'accept'
        : state === 'declined'
            ? 'decline'
            : 'answer';
    throw new ApiError(
        'forbidden: only the invitee may ' + verb,
        HTTP_FORBIDDEN,
    );
}

function membershipName(params: string[]): string {
    return param(params, 1);
}

function parsedName(name: string): MembershipName {
    const parsed = parsedMembershipName(name);
    if (parsed === undefined) {
        throw new Error(
            'membership-id reached a handler unparsed',
        );
    }
    return parsed;
}

function askedQuery(query: ViewQuery | undefined): ViewQuery {
    return query ?? { kind: 'every' };
}

function storedMembership(
    membership: MembershipEntity,
): Record<string, unknown> {
    return {
        id: membership.id,
        organization_id: membership.organization_id,
        identity_id: membership.identity_id,
        type: membership.type,
        state: membership.state,
        at: membership.at,
    };
}

function headerOf(
    received: ReceivedRequest,
    name: string,
): string | undefined {
    return received.headerFields.find(
        (field) => field.name === name,
    )?.value;
}

function starCreate(received: ReceivedRequest): boolean {
    const raw = headerOf(received, IF_NONE_MATCH_HEADER);
    return raw !== undefined && raw.trim() === '*';
}

function matchTags(
    received: ReceivedRequest,
): readonly string[] | undefined {
    const raw = headerOf(received, IF_MATCH_HEADER);
    if (raw === undefined) return undefined;
    const tags = parseEntityTags(raw);
    if (tags === undefined) {
        throw new Error(
            'the gate admitted a malformed If-Match',
        );
    }
    return tags;
}

// The latch names the head this handler read. Anything else
// skips the table: the statement refuses it.
function latchAgrees(
    received: ReceivedRequest,
    head: MessagePairEntity | null,
): boolean {
    if (starCreate(received)) return head === null;
    const tags = matchTags(received);
    if (tags === undefined) return false;
    return head !== null
        && tags.length === 1
        && tags[0] === head.id;
}

function staleCondition(
    received: ReceivedRequest,
    head: MessagePairEntity | null,
): SiblingCondition {
    if (starCreate(received)) {
        return { kind: 'never-written', declarer: 'client' };
    }
    const tags = matchTags(received) ?? [];
    const other = tags.find(
        (tag) => head === null || tag !== head.id,
    );
    const tag = other ?? tags[0];
    if (tag === undefined) {
        throw new Error('a stale latch named no tag');
    }
    return { kind: 'in-order', head: tag };
}

function servedHead(
    head: MessagePairEntity,
    requestId: string,
): Response {
    return responseOfWire(servedResponse(
        head.response,
        {
            date: httpDateOf(nowUtc()),
            requestId,
        },
        { sees: 'whole' },
    ));
}

function notify(
    db: DbAdapter,
    organizationId: Id,
    identityId: Id,
): void {
    db.postNotification({
        kind: 'scoped',
        organizationIds: [organizationId],
        identityIds: [identityId],
    });
}

// The column is the verb that was received. Succession
// is unique only for PUT and DELETE, so a later POST
// named pending does not conflict.
async function operationPair(
    method: string,
    actor: Id,
    requestAt: string,
    operationId: string,
    received: ReceivedRequest,
    body: Record<string, unknown>,
    name: string,
    state: string,
): Promise<MessagePair> {
    const formed = await formWriteMessagePair({
        method,
        pathname: received.target,
        routePattern: OPERATION_PATTERN,
        routeSegments: OPERATION_SEGMENTS,
        pathSegments: ['invitations', name, state],
        headerFields: received.headerFields,
        body,
        bodyBytes: received.bodyBytes,
        requesterIdentityId: actor,
        requestAt,
        organization: undefined,
        responseBody: undefined,
        operationId,
        requestId: received.requestId,
    });
    return formed;
}

async function landMembership(
    db: DbAdapter,
    method: string,
    actor: Id,
    requestAt: string,
    operationId: string,
    received: ReceivedRequest,
    body: Record<string, unknown>,
    name: string,
    stateName: string,
    parentState: Record<string, unknown>,
    condition: SiblingCondition,
    seat: StateSibling | undefined,
    answer: StateAnswerKind,
): Promise<WriteAnswer> {
    const receivedPair = await operationPair(
        method, actor, requestAt, operationId, received,
        body, name, stateName,
    );
    const parent = {
        method: 'PUT' as const,
        path: MEMBERSHIPS_PATH,
        name,
        state: parentState,
        condition,
    };
    const siblings = seat === undefined
        ? [parent] as const
        : [parent, seat] as const;
    return runStateWrite(db, {
        kind: 'siblings',
        received: receivedPair,
        siblings,
        reader: { sees: 'whole' },
        answer,
    });
}

// Interpretation E, rows 1–3. A DELETE head is current, so
// a later accept restores the seat in order on it.
export async function seatSiblingOf(
    db: DbAdapter,
    from: MembershipEntity | null,
    next: MembershipEntity,
): Promise<StateSibling | undefined> {
    if (
        next.state !== 'accepted'
        && next.state !== 'removed'
    ) {
        return undefined;
    }
    if (from === null && next.state === 'removed') {
        return undefined;
    }
    const path = seatsPrefixFor(next.organization_id);
    const head = await db.messagePairs.getHeadPair(
        path, next.identity_id,
    );
    if (next.state === 'removed') {
        if (head === null) return undefined;
        return {
            method: 'DELETE',
            path,
            name: next.identity_id,
            condition: { kind: 'in-order', head: head.id },
        };
    }
    // The seat route stores the path's ids on the wire.
    // A later PUT of { type, at } matches this body.
    const state = {
        id: next.identity_id,
        organization_id: next.organization_id,
        identity_id: next.identity_id,
        type: next.type,
        at: next.at,
    };
    if (head === null) {
        return {
            method: 'PUT',
            path,
            name: next.identity_id,
            state,
            condition: {
                kind: 'genesis', declarer: 'handler',
            },
        };
    }
    return {
        method: 'PUT',
        path,
        name: next.identity_id,
        state,
        condition: { kind: 'in-order', head: head.id },
    };
}

function guardsLastAdmin(
    next: MembershipEntity,
): boolean {
    return next.state === 'removed'
        || (
            next.state === 'accepted'
            && next.type !== 'admin'
        );
}

async function refuseLastAdmin(
    db: DbAdapter,
    from: MembershipEntity,
    next: MembershipEntity,
): Promise<void> {
    if (!guardsLastAdmin(next)) return;
    const accepted = await db.readTransaction(
        async (view) => {
            const heads = await organizationMembershipHeads(
                view,
                from.organization_id,
                { kind: 'state', state: 'accepted' },
            );
            return heads.map(membershipOfHead);
        },
    );
    const refusal = lastAdminRefusal(accepted, from, next);
    if (refusal !== undefined) {
        throw new ApiError(refusal, HTTP_CONFLICT);
    }
}

async function readHead(
    db: DbAdapter,
    name: string,
): Promise<MessagePairEntity | null> {
    return db.messagePairs.getHeadPair(
        MEMBERSHIPS_PATH, name,
    );
}

function miss(name: string): never {
    throw new EntityNotFoundError('invitations', name);
}

async function visibleHead(
    db: DbAdapter,
    name: string,
    roles: readonly string[],
    nest: 'organization' | 'identity',
): Promise<MessagePairEntity> {
    const head = await readHead(db, name);
    if (head === null) miss(name);
    if (nest === 'organization') {
        const state = membershipOfHead(head).state;
        if (!memberSeesState(roles, state)) miss(name);
    }
    return head;
}

// GET /identities/:id/invitations/
export async function getIdentityInvitations(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
    query?: ViewQuery,
): Promise<HeadSelection> {
    const identityId = param(params, 0);
    requireSelfOrAdmin(actor, identityId, roles, LIST_READ);
    return wholeCollectionSelection(
        await identityMembershipHeads(
            db, identityId, askedQuery(query),
        ),
        'stateless',
    );
}

// GET /identities/:id/invitations/:membership-id
export async function getInvitationOnIdentityNest(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
    const identityId = param(params, 0);
    const name = membershipName(params);
    requireSelfOrAdmin(actor, identityId, roles, INVITEE_READ);
    const head = await visibleHead(
        db, name, roles, 'identity',
    );
    return wholeHeadSelection(
        head, 'stateless', 'invitations', name,
    );
}

// GET /organizations/:id/invitations/
export async function getOrganizationInvitations(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    _roles: readonly string[],
    query?: ViewQuery,
): Promise<HeadSelection> {
    return wholeCollectionSelection(
        await organizationMembershipHeads(
            db, param(params, 0), askedQuery(query),
        ),
        'stateless',
    );
}

// GET /organizations/:id/invitations/:membership-id
export async function getInvitationOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
    const name = membershipName(params);
    const head = await visibleHead(
        db, name, roles, 'organization',
    );
    return wholeHeadSelection(
        head, 'stateless', 'invitations', name,
    );
}

// GET .../versions/
export async function getInvitationVersionsOnIdentityNest(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
    const identityId = param(params, 0);
    const name = membershipName(params);
    requireSelfOrAdmin(actor, identityId, roles, INVITEE_READ);
    await visibleHead(db, name, roles, 'identity');
    return selectVersionsAt(
        db, MEMBERSHIPS_PATH, name, 'stateless',
        'invitations', { sees: 'whole' },
        () => Promise.reject(
            new EntityNotFoundError('invitations', name),
        ),
    );
}

export async function getInvitationVersionOnIdentityNest(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
    const identityId = param(params, 0);
    const name = membershipName(params);
    const tag = param(params, params.length - 1);
    requireSelfOrAdmin(actor, identityId, roles, INVITEE_READ);
    await visibleHead(db, name, roles, 'identity');
    return selectVersionAt(
        db, MEMBERSHIPS_PATH, name, tag, 'stateless',
        'invitations', { sees: 'whole' },
        () => Promise.reject(
            new EntityNotFoundError('invitations', name),
        ),
    );
}

export async function getInvitationVersionsOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
    const name = membershipName(params);
    await visibleHead(db, name, roles, 'organization');
    return selectVersionsAt(
        db, MEMBERSHIPS_PATH, name, 'stateless',
        'invitations', { sees: 'whole' },
        () => Promise.reject(
            new EntityNotFoundError('invitations', name),
        ),
    );
}

export async function getInvitationVersionOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    _actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
    const name = membershipName(params);
    const tag = param(params, params.length - 1);
    await visibleHead(db, name, roles, 'organization');
    return selectVersionAt(
        db, MEMBERSHIPS_PATH, name, tag, 'stateless',
        'invitations', { sees: 'whole' },
        () => Promise.reject(
            new EntityNotFoundError('invitations', name),
        ),
    );
}

function grantFields(
    body: Record<string, unknown>,
): { email: string; grantAt: string } {
    const email = body['email'];
    if (typeof email !== 'string' || email === '') {
        throw new ValidationError(
            'an "email" is required',
        );
    }
    assertOnlyKeys(
        body, ['email', 'grantAt'], 'InvitationGrant',
    );
    return {
        email,
        grantAt: validateTimestampField(
            body, 'grantAt', 'InvitationGrant',
        ),
    };
}

// POST /organizations/:id/invitations/ — grant pending.
export async function postOrganizationInvitationGrant(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
): Promise<unknown> {
    requireWriteStamp(requestAt, operationId);
    requireAdmin(roles, ADMIN_WRITE);
    if (received === undefined) {
        throw new Error('requestId is required');
    }
    const organizationId = param(params, 0);
    const { email, grantAt } = grantFields(payload);
    const match = (await deriveIdentityPiiRows(db))
        .find((person) => person.email === email);
    if (match === undefined) {
        throw new ApiError(
            'no identity with that email', HTTP_NOT_FOUND,
        );
    }
    const name = membershipNameOf(organizationId, match.id);
    const parsed = parsedName(name);
    const request: MembershipRequest = {
        state: 'pending', type: 'member', at: grantAt,
    };
    const head = await readHead(db, name);
    const from = head === null
        ? null
        : membershipOfHead(head);
    const outcome = membershipTransition(
        'admin', parsed, from, request,
    );
    if (outcome.kind === 'unchanged') {
        if (head === null) {
            throw new Error('an unchanged grant has no head');
        }
        return servedHead(head, received.requestId);
    }
    if (outcome.kind === 'refused') {
        throw new ApiError(outcome.error, HTTP_CONFLICT);
    }
    const condition: SiblingCondition = head === null
        ? { kind: 'genesis', declarer: 'handler' }
        : { kind: 'in-order', head: head.id };
    const answer = await landMembership(
        db, 'POST', actor, requestAt, operationId,
        received, payload, name, 'pending',
        storedMembership(outcome.next), condition, undefined,
        {
            kind: 'created',
            location: '/organizations/' + organizationId
                + '/invitations/' + name,
        },
    );
    if (answer.outcome === 'land') {
        notify(db, organizationId, match.id);
    }
    return answer.response;
}

async function putMembership(
    db: DbAdapter,
    actorKind: MembershipActor,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received: ReceivedRequest | undefined,
): Promise<Response> {
    requireWriteStamp(requestAt, operationId);
    const request = validateMembershipRequest(payload);
    const name = membershipName(params);
    const parsed = parsedName(name);
    if (received === undefined) {
        throw new Error('requestId is required');
    }
    const head = await readHead(db, name);
    // A tag that names another head stores nothing.
    // The statement answers 412 before any actor rule.
    if (!latchAgrees(received, head)) {
        const stale = await landMembership(
            db, 'PUT', actor, requestAt, operationId,
            received, payload, name, request.state,
            head === null
                ? { id: name }
                : bodyOf(head.response),
            staleCondition(received, head),
            undefined,
            { kind: 'parent' },
        );
        return stale.response;
    }
    if (actorKind === 'invitee') {
        requireInvitee(
            actor, parsed.identityId, request.state,
        );
    } else {
        requireAdmin(roles, ADMIN_WRITE);
    }
    const from = head === null
        ? null
        : membershipOfHead(head);
    // Pending belongs to the email POST. An item PUT
    // must not mint one.
    if (request.state === 'pending') {
        const fromState = from === null
            ? 'none'
            : from.state;
        throw new ApiError(
            'no transition from ' + fromState
                + ' to pending for the ' + actorKind,
            HTTP_CONFLICT,
        );
    }
    const outcome = membershipTransition(
        actorKind, parsed, from, request,
    );
    if (outcome.kind === 'refused') {
        throw new ApiError(outcome.error, HTTP_CONFLICT);
    }
    if (outcome.kind === 'unchanged') {
        if (head === null) {
            throw new Error(
                'an unchanged transition has no head',
            );
        }
        return servedHead(head, received.requestId);
    }
    if (from !== null) {
        await refuseLastAdmin(db, from, outcome.next);
    }
    const seat = await seatSiblingOf(db, from, outcome.next);
    const condition: SiblingCondition = head === null
        ? { kind: 'never-written', declarer: 'client' }
        : { kind: 'in-order', head: head.id };
    const answer = await landMembership(
        db, 'PUT', actor, requestAt, operationId,
        received, payload, name, request.state,
        storedMembership(outcome.next), condition, seat,
        { kind: 'parent' },
    );
    if (answer.outcome === 'land') {
        notify(db, parsed.organizationId, parsed.identityId);
    }
    return answer.response;
}

// PUT /identities/:id/invitations/:membership-id
export async function putInvitationOnIdentityNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
): Promise<unknown> {
    return putMembership(
        db, 'invitee', params, payload, actor, roles,
        requestAt, operationId, received,
    );
}

// PUT /organizations/:id/invitations/:membership-id
export async function putInvitationOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    _messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
): Promise<unknown> {
    return putMembership(
        db, 'admin', params, payload, actor, roles,
        requestAt, operationId, received,
    );
}
