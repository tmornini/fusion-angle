import type { MembershipName } from
    '../shared/membership-name.ts';
import {
    isInvitationState,
    type Id,
    type InvitationState,
} from '../shared/types.ts';

export type ViewQuery =
    | { readonly kind: 'every' }
    | {
        readonly kind: 'state';
        readonly state: InvitationState;
    };

export type QueryRefusal = {
    readonly kind: 'refused';
    readonly error: string;
};

const ONE_STATE =
    'a view takes one ?state= and nothing else';
const STATE_ALPHABET =
    'state must be one of pending, accepted,'
    + ' declined, revoked, removed';

export function viewQueryOf(
    search: string,
): ViewQuery | QueryRefusal {
    const params = new URLSearchParams(search);
    const keys = [...params.keys()];
    if (keys.length === 0) return { kind: 'every' };
    const states = params.getAll('state');
    const onlyState = keys.every(
        (key) => key === 'state',
    );
    if (!onlyState || states.length !== 1) {
        return { kind: 'refused', error: ONE_STATE };
    }
    const state = states[0];
    if (
        state === undefined
        || !isInvitationState(state)
    ) {
        return { kind: 'refused', error: STATE_ALPHABET };
    }
    return { kind: 'state', state };
}

const INVITATION_VIEW_STATES:
    readonly InvitationState[] = [
        'pending', 'declined', 'revoked',
    ];
const MEMBERSHIP_VIEW_STATES:
    readonly InvitationState[] = [
        'accepted', 'removed',
    ];

function viewQueryIn(
    search: string,
    allowed: readonly InvitationState[],
    fallback: InvitationState,
    alphabetError: string,
): ViewQuery | QueryRefusal {
    const judged = viewQueryOf(search);
    if (judged.kind === 'refused') return judged;
    if (judged.kind === 'every') {
        return { kind: 'state', state: fallback };
    }
    if (!allowed.includes(judged.state)) {
        return { kind: 'refused', error: alphabetError };
    }
    return judged;
}

export function invitationsViewQueryOf(
    search: string,
): ViewQuery | QueryRefusal {
    return viewQueryIn(
        search, INVITATION_VIEW_STATES, 'pending',
        'state must be one of pending, declined,'
            + ' revoked',
    );
}

export function membershipsViewQueryOf(
    search: string,
): ViewQuery | QueryRefusal {
    return viewQueryIn(
        search, MEMBERSHIP_VIEW_STATES, 'accepted',
        'state must be one of accepted, removed',
    );
}

export const MEMBER_VISIBLE_STATES:
    readonly InvitationState[] = [
        'accepted',
        'removed',
    ];

export function memberSeesState(
    roles: readonly string[],
    state: InvitationState,
): boolean {
    return roles.includes('admin')
        || MEMBER_VISIBLE_STATES.includes(state);
}

export type MembershipNest = 'organization' | 'identity';

// 'foreign': 403. 'absent': 404. undefined: the path's.
export function membershipNameRefusal(
    nest: MembershipNest,
    pathId: Id,
    name: MembershipName,
): 'foreign' | 'absent' | undefined {
    if (nest === 'organization') {
        return name.organizationId === pathId
            ? undefined
            : 'foreign';
    }
    return name.identityId === pathId
        ? undefined
        : 'absent';
}
