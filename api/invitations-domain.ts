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
    type MembershipCreate,
    SERVICE_ADMIN_REFUSAL,
    validateMembershipCreateBody,
    validateMembershipRequest,
    validateTimestampField,
} from './validators.ts';
import {
    attemptFor,
    canonicalPath,
    formWriteMessagePair,
    httpDateOf,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
    parseEntityTags,
    PII_DOCUMENT_NAME,
    runStateWrite,
    runWrite,
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
    deriveIdentityKind,
    deriveIdentityPiiRows,
    identityPrefixFor,
} from './derive-identity-spine.ts';
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
    validateMembershipBody,
    organizationMembershipHeads,
    identityMembershipHeads,
    type MembershipActor,
    type MembershipRequest,
    type MembershipTransitionBody,
} from './memberships.ts';
import {
    membershipNameOf,
    parsedMembershipName,
    type MembershipName,
} from '../shared/membership-name.ts';
import {
    envelopeOf,
    responseOfWire,
    servedResponse,
} from './served-response.ts';

const ADMIN_WRITE =
    'forbidden: an organization invitation write'
    + ' requires an admin role';
const INVITEE_READ =
    'forbidden: only the invitee'
    + ' may read this invitation';
const LIST_READ =
    'forbidden: invitation list is self';

const OPERATION_PATTERN =
    'invitations/:membership-name/:state';
const OPERATION_SEGMENTS = [
    'invitations', ':membership-name', ':state',
];
const MEMBERSHIP_CREATE_PATTERN =
    'organizations/:id/memberships/';
const MEMBERSHIP_CREATE_SEGMENTS = [
    'organizations', ':id', 'memberships', '',
];

function requireAdmin(
    roles: readonly string[],
    message: string,
): void {
    if (!roles.includes('admin')) {
        throw new ApiError(message, HTTP_FORBIDDEN);
    }
}

function requireSelf(
    actor: Id,
    identityId: Id,
    message: string,
): void {
    if (actor !== identityId) {
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

function pendingMembership(
    next: MembershipTransitionBody,
    expiresAt: string,
): MembershipEntity {
    if (next.state !== 'pending') {
        throw new Error('a grant must land pending');
    }
    return {
        id: next.id,
        organization_id: next.organization_id,
        identity_id: next.identity_id,
        type: next.type,
        state: next.state,
        at: next.at,
        expires_at: expiresAt,
    };
}

function settledMembership(
    next: MembershipTransitionBody,
): MembershipEntity {
    if (next.state === 'pending') {
        throw new Error(
            'a put transition landed pending',
        );
    }
    return {
        id: next.id,
        organization_id: next.organization_id,
        identity_id: next.identity_id,
        type: next.type,
        state: next.state,
        at: next.at,
    };
}

function storedMembership(
    membership: MembershipEntity,
): Record<string, unknown> {
    const stored: Record<string, unknown> = {
        id: membership.id,
        organization_id: membership.organization_id,
        identity_id: membership.identity_id,
        type: membership.type,
        state: membership.state,
        at: membership.at,
    };
    if (membership.state === 'pending') {
        stored['expires_at'] = membership.expires_at;
    }
    return stored;
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
        envelopeOf(head),
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
    return runStateWrite(db, {
        kind: 'siblings',
        received: receivedPair,
        siblings: [parent],
        reader: { sees: 'whole' },
        answer,
    });
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
    _roles: readonly string[],
    query?: ViewQuery,
): Promise<HeadSelection> {
    const identityId = param(params, 0);
    requireSelf(actor, identityId, LIST_READ);
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
    requireSelf(actor, identityId, INVITEE_READ);
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
    requireSelf(actor, identityId, INVITEE_READ);
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
    requireSelf(actor, identityId, INVITEE_READ);
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

function invitationFields(
    body: Record<string, unknown>,
): { email: string; at: string; expiresAt: string } {
    const email = body['email'];
    if (typeof email !== 'string' || email === '') {
        throw new ValidationError(
            'an "email" is required',
        );
    }
    assertOnlyKeys(
        body, ['email', 'at', 'expiresAt'], 'Invitation',
    );
    const at = validateTimestampField(
        body, 'at', 'Invitation',
    );
    const expiresAt = validateTimestampField(
        body, 'expiresAt', 'Invitation',
    );
    if (expiresAt <= at) {
        throw new ValidationError(
            'expiresAt must be after at',
        );
    }
    return { email, at, expiresAt };
}

// POST /organizations/:id/invitations/ — invite pending.
export async function postOrganizationInvitation(
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
    const { email, at, expiresAt } = invitationFields(
        payload,
    );
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
        state: 'pending', type: 'member', at,
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
        storedMembership(
            pendingMembership(outcome.next, expiresAt),
        ), condition,
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

// POST /organizations/:id/memberships/ — one accepted
// member of any kind; the handler declares the three
// geneses.
export async function postOrganizationMembership(
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
    const created = validateMembershipCreateBody(payload);
    const name = membershipNameOf(
        organizationId, created.id,
    );
    const receivedPair = await formWriteMessagePair({
        method: 'POST',
        pathname: received.target,
        routePattern: MEMBERSHIP_CREATE_PATTERN,
        routeSegments: MEMBERSHIP_CREATE_SEGMENTS,
        pathSegments: [
            'organizations', organizationId,
            'memberships', '',
        ],
        headerFields: received.headerFields,
        body: payload,
        bodyBytes: received.bodyBytes,
        requesterIdentityId: actor,
        requestAt,
        organization: undefined,
        responseBody: undefined,
        operationId,
        requestId: received.requestId,
    });
    const answer = await runStateWrite(db, {
        kind: 'siblings',
        received: receivedPair,
        siblings: [
            {
                method: 'PUT',
                path: MEMBERSHIPS_PATH,
                name,
                state: storedMembership({
                    id: name,
                    organization_id: organizationId,
                    identity_id: created.id,
                    type: created.membership.type,
                    state: 'accepted',
                    at: created.membership.at,
                }),
                condition: {
                    kind: 'genesis',
                    declarer: 'handler',
                },
            },
            ...memberGeneses(organizationId, created),
        ],
        reader: { sees: 'whole' },
        answer: {
            kind: 'created',
            location: '/organizations/'
                + organizationId
                + '/invitations/' + name,
        },
    });
    if (answer.outcome === 'land') {
        notify(db, organizationId, created.id);
    }
    return answer.response;
}

// The identity and the member document: the two geneses
// beside the membership, one pair per kind. A human's
// document is its PII; an AI's or a service's is the
// organization-scoped document its family's PUT edits.
function memberGeneses(
    organizationId: Id,
    created: MembershipCreate,
): StateSibling[] {
    const genesis: SiblingCondition = {
        kind: 'genesis',
        declarer: 'handler',
    };
    const identities = canonicalPath(
        undefined, '/identities/',
    );
    switch (created.kind) {
        case 'human':
            return [
                {
                    method: 'PUT',
                    path: identities,
                    name: created.id,
                    state: {
                        id: created.id,
                        kind: 'person',
                        ...created.identity,
                    },
                    condition: genesis,
                },
                {
                    method: 'PUT',
                    path: identityPrefixFor(created.id),
                    name: PII_DOCUMENT_NAME,
                    state: {
                        name: created.pii.name,
                        email: created.pii.email,
                        phone: created.pii.phone,
                        bio: created.pii.bio,
                    },
                    condition: genesis,
                },
            ];
        case 'ai':
            return [
                {
                    method: 'PUT',
                    path: identities,
                    name: created.id,
                    state: { id: created.id, kind: 'service' },
                    condition: genesis,
                },
                {
                    method: 'PUT',
                    path: canonicalPath(
                        organizationId, '/ai-agents/',
                    ),
                    name: created.id,
                    state: { id: created.id, ...created.ai },
                    condition: genesis,
                },
            ];
        case 'service':
            return [
                {
                    method: 'PUT',
                    path: identities,
                    name: created.id,
                    state: { id: created.id, kind: 'service' },
                    condition: genesis,
                },
                {
                    method: 'PUT',
                    path: canonicalPath(
                        organizationId, '/services/',
                    ),
                    name: created.id,
                    state: {
                        id: created.id,
                        ...created.service,
                    },
                    condition: genesis,
                },
            ];
        default: {
            const unreachable: never = created;
            return unreachable;
        }
    }
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
    if (
        from !== null
        && from.state === 'pending'
        && request.state === 'accepted'
        && from.expires_at <= requestAt
    ) {
        throw new ApiError(
            'the invitation expired at ' + from.expires_at,
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
    const next = settledMembership(outcome.next);
    // an identity that signs in by client credentials is
    // never an organization admin (spec decision 11)
    if (
        next.type === 'admin'
        && (await deriveIdentityKind(db, parsed.identityId))
            === 'service'
    ) {
        throw new ApiError(SERVICE_ADMIN_REFUSAL, HTTP_CONFLICT);
    }
    if (from !== null) {
        await refuseLastAdmin(db, from, next);
    }
    const condition: SiblingCondition = head === null
        ? { kind: 'never-written', declarer: 'client' }
        : { kind: 'in-order', head: head.id };
    const answer = await landMembership(
        db, 'PUT', actor, requestAt, operationId,
        received, payload, name, request.state,
        storedMembership(next), condition,
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

// A seed supplies the membership document it formed. The
// live route does not: it is exempt from pair wiring and
// forms the operation and the document itself. The
// supplied document is the one row.
async function writeSuppliedMembership(
    db: DbAdapter,
    messagePair: MessagePair,
): Promise<void> {
    if (
        messagePair.path !== MEMBERSHIPS_PATH
        || messagePair.method !== 'PUT'
    ) {
        throw new Error(
            'a supplied membership is a PUT at '
            + MEMBERSHIPS_PATH,
        );
    }
    const next = validateMembershipBody(
        bodyOf(messagePair.responseMessage),
    );
    if (next.id !== messagePair.name) {
        throw new Error(
            'a supplied membership name disagrees'
            + ' with its body',
        );
    }
    await runWrite(
        db, attemptFor([messagePair]), [messagePair],
    );
}

// PUT /organizations/:id/invitations/:membership-id
export async function putInvitationOnOrganizationNest(
    db: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    messagePair: MessagePair | undefined,
    _organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
): Promise<unknown> {
    if (messagePair !== undefined) {
        await writeSuppliedMembership(db, messagePair);
        return;
    }
    return putMembership(
        db, 'admin', params, payload, actor, roles,
        requestAt, operationId, received,
    );
}
