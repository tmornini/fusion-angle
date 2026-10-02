import { bodyOf } from './derive-documents.ts';
import type { DbAdapter } from './db.ts';
import type { ViewQuery } from './membership-gate.ts';
import { BODY_INDEXED_PATH } from './schema-postgres.ts';
import {
    membershipNameOf,
    type MembershipName,
} from '../shared/membership-name.ts';
import {
    assertInvitationState,
    type Id,
    type InvitationState,
    type MembershipEntity,
    type MembershipType,
    type MessagePairEntity,
    ValidationError,
} from '../shared/types.ts';
import {
    assertOnlyKeys,
    pickIdentifier,
    pickString,
    validateEnumField,
    validateTimestampField,
} from './validators.ts';

export const MEMBERSHIPS_PATH = BODY_INDEXED_PATH;

const MEMBERSHIP_BODY_KEYS: readonly string[] = [
    'id',
    'organization_id',
    'identity_id',
    'type',
    'state',
    'at',
];

const MEMBERSHIP_TYPES = ['admin', 'member'] as const;

// The store edge: exactly the six keys, `id` equal to
// the name of its two ids, a known type and state, an
// RFC-3339 zulu `at`.
export function validateMembershipBody(
    body: Record<string, unknown>,
): MembershipEntity {
    assertOnlyKeys(
        body, MEMBERSHIP_BODY_KEYS, 'MembershipEntity',
    );
    const organizationId = pickIdentifier(
        body, 'organization_id',
    );
    const identityId = pickIdentifier(body, 'identity_id');
    const id = pickString(body, 'id');
    const name = membershipNameOf(organizationId, identityId);
    if (id !== name) {
        throw new ValidationError(
            'id must be the membership name',
        );
    }
    return {
        id,
        organization_id: organizationId,
        identity_id: identityId,
        type: validateEnumField(
            body, 'type', MEMBERSHIP_TYPES,
            'membership type', 'MembershipEntity',
        ),
        state: assertInvitationState(
            pickString(body, 'state'), 'MembershipEntity',
        ),
        at: validateTimestampField(
            body, 'at', 'MembershipEntity',
        ),
    };
}

export function membershipOfHead(
    head: MessagePairEntity,
): MembershipEntity {
    return validateMembershipBody(bodyOf(head.response));
}

export type MembershipActor = 'invitee' | 'admin';

export type MembershipRequest = {
    readonly state: InvitationState,
    readonly type?: MembershipType,
    readonly at: string,
};

export type MembershipOutcome =
    | {
        readonly kind: 'lands',
        readonly next: MembershipEntity,
    }
    | { readonly kind: 'unchanged' }
    | { readonly kind: 'refused', readonly error: string };

type Typed = 'keeps' | 'requires' | 'retypes';

type Row = {
    readonly actor: MembershipActor,
    readonly from: InvitationState | 'none',
    readonly to: InvitationState,
    readonly typed: Typed,
};

const MEMBERSHIP_TRANSITIONS: readonly Row[] = [
    // the grant
    { actor: 'admin', from: 'none', to: 'pending',
        typed: 'requires' },
    { actor: 'admin', from: 'declined', to: 'pending',
        typed: 'requires' },
    { actor: 'admin', from: 'revoked', to: 'pending',
        typed: 'requires' },
    { actor: 'admin', from: 'removed', to: 'pending',
        typed: 'requires' },
    // the invitee
    { actor: 'invitee', from: 'pending', to: 'accepted',
        typed: 'keeps' },
    { actor: 'invitee', from: 'pending', to: 'declined',
        typed: 'keeps' },
    // the admin
    { actor: 'admin', from: 'pending', to: 'revoked',
        typed: 'keeps' },
    { actor: 'admin', from: 'accepted', to: 'removed',
        typed: 'keeps' },
    { actor: 'admin', from: 'accepted', to: 'accepted',
        typed: 'retypes' },
    { actor: 'admin', from: 'none', to: 'accepted',
        typed: 'requires' },
    { actor: 'admin', from: 'revoked', to: 'accepted',
        typed: 'requires' },
    { actor: 'admin', from: 'removed', to: 'accepted',
        typed: 'requires' },
];

function refused(
    from: InvitationState | 'none',
    to: InvitationState,
    actor: MembershipActor,
): MembershipOutcome {
    return {
        kind: 'refused',
        error: 'no transition from ' + from
            + ' to ' + to + ' for the ' + actor,
    };
}

function typeFor(
    typed: Typed,
    from: MembershipEntity | null,
    request: MembershipRequest,
): MembershipType | undefined {
    if (typed === 'requires') return request.type;
    if (from === null) return undefined;
    if (typed === 'keeps') {
        if (
            request.type !== undefined
            && request.type !== from.type
        ) {
            return undefined;
        }
        return from.type;
    }
    if (
        request.type === undefined
        || request.type === from.type
    ) {
        return undefined;
    }
    return request.type;
}

// §1's table. `from` is the head's body, or null when
// the name was never written.
export function membershipTransition(
    actor: MembershipActor,
    name: MembershipName,
    from: MembershipEntity | null,
    request: MembershipRequest,
): MembershipOutcome {
    const fromState = from === null ? 'none' : from.state;
    // The grant on a pending head changes nothing.
    if (
        actor === 'admin'
        && fromState === 'pending'
        && request.state === 'pending'
    ) {
        return { kind: 'unchanged' };
    }
    const row = MEMBERSHIP_TRANSITIONS.find((candidate) =>
        candidate.actor === actor
        && candidate.from === fromState
        && candidate.to === request.state
    );
    const type = row === undefined
        ? undefined
        : typeFor(row.typed, from, request);
    if (row === undefined || type === undefined) {
        return refused(fromState, request.state, actor);
    }
    return {
        kind: 'lands',
        next: {
            id: membershipNameOf(
                name.organizationId, name.identityId,
            ),
            organization_id: name.organizationId,
            identity_id: name.identityId,
            type,
            state: request.state,
            at: request.at,
        },
    };
}

// undefined: the write keeps an accepted admin.
export function lastAdminRefusal(
    accepted: readonly MembershipEntity[],
    from: MembershipEntity,
    next: MembershipEntity,
): string | undefined {
    if (from.type !== 'admin' || from.state !== 'accepted') {
        return undefined;
    }
    if (next.type === 'admin' && next.state === 'accepted') {
        return undefined;
    }
    const another = accepted.some((membership) =>
        membership.type === 'admin'
        && membership.state === 'accepted'
        && membership.organization_id
            === from.organization_id
        && membership.identity_id !== from.identity_id
    );
    return another
        ? undefined
        : 'the last accepted admin cannot be'
            + ' removed or demoted';
}

export async function membershipOf(
    db: DbAdapter,
    organizationId: Id,
    identityId: Id,
): Promise<MembershipEntity | null> {
    const head = await db.messagePairs.getHeadPair(
        MEMBERSHIPS_PATH,
        membershipNameOf(organizationId, identityId),
    );
    if (head === null) return null;
    const membership = membershipOfHead(head);
    return membership.state === 'accepted'
        ? membership
        : null;
}

export async function membershipsOfIdentity(
    db: DbAdapter,
    identityId: Id,
): Promise<MembershipEntity[]> {
    const heads = await db.messagePairs
        .getCollectionHeadPairsContaining(
            MEMBERSHIPS_PATH,
            { identity_id: identityId },
        );
    const accepted: MembershipEntity[] = [];
    for (const head of heads) {
        const membership = membershipOfHead(head);
        if (membership.state === 'accepted') {
            accepted.push(membership);
        }
    }
    return accepted;
}

function headsAdmitting(
    heads: readonly MessagePairEntity[],
    query: ViewQuery,
): MessagePairEntity[] {
    const admitted: MessagePairEntity[] = [];
    for (const head of heads) {
        const state = membershipOfHead(head).state;
        if (query.kind === 'every' || query.state === state) {
            admitted.push(head);
        }
    }
    return admitted;
}

export async function organizationMembershipHeads(
    db: DbAdapter,
    organizationId: Id,
    query: ViewQuery,
): Promise<MessagePairEntity[]> {
    const heads = await db.messagePairs
        .getCollectionHeadPairsContaining(
            MEMBERSHIPS_PATH,
            { organization_id: organizationId },
        );
    return headsAdmitting(heads, query);
}

export async function identityMembershipHeads(
    db: DbAdapter,
    identityId: Id,
    query: ViewQuery,
): Promise<MessagePairEntity[]> {
    const heads = await db.messagePairs
        .getCollectionHeadPairsContaining(
            MEMBERSHIPS_PATH,
            { identity_id: identityId },
        );
    return headsAdmitting(heads, query);
}
