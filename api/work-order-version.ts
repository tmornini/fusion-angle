// A work order's whole state (§5): its fields, its node
// and the move into it, its binding, its claim, and the
// events this version recorded. History is the chain of versions; no version
// carries an earlier one's events. Every function here is
// pure: the handler reads the head and the clock, then
// asks for the next version.

import type {
    Id,
    TransitionFieldValueEntity,
    WorkOrderEventEntity,
} from '../shared/types.ts';
import { addUtcSeconds } from '../shared/work-order-claims.ts';
import { microsOf } from '../shared/pair-root.ts';
import { sortJsonKeys } from '../shared/http-message/canonical.ts';

export type WorkOrderClaim = {
    readonly member_id: Id,
    readonly at: string,
    readonly expires_at: string,
};

export type WorkOrderTransition = {
    readonly member_id: Id,
    readonly at: string,
};

export type WorkOrderFields = {
    readonly display_id: string,
    readonly flow_graph: Record<string, unknown>,
    readonly position: number,
};

export type WorkOrderVersion = WorkOrderFields & {
    readonly id: Id,
    readonly organization_id: Id,
    readonly state: string,
    readonly transition: WorkOrderTransition,
    readonly instance_id?: Id,
    readonly record_type_id?: Id,
    readonly claim?: WorkOrderClaim,
    readonly events: readonly WorkOrderEventEntity[],
};

export type ClaimChange =
    | {
        readonly kind: 'claimed',
        readonly version: WorkOrderVersion,
    }
    | { readonly kind: 'held', readonly by: Id };

export type BindingChange =
    | {
        readonly kind: 'bound',
        readonly version: WorkOrderVersion,
    }
    | { readonly kind: 'rebound', readonly to: Id };

// Keys in the version's order (Interpretation K). An
// absent facet is an absent key.
function ordered(version: WorkOrderVersion): WorkOrderVersion {
    return {
        id: version.id,
        organization_id: version.organization_id,
        display_id: version.display_id,
        flow_graph: version.flow_graph,
        position: version.position,
        state: version.state,
        transition: version.transition,
        ...(version.instance_id === undefined
            || version.record_type_id === undefined
            ? {}
            : {
                instance_id: version.instance_id,
                record_type_id: version.record_type_id,
            }),
        ...(version.claim === undefined
            ? {}
            : { claim: version.claim }),
        events: version.events,
    };
}

function withoutClaim(version: WorkOrderVersion): WorkOrderVersion {
    const { claim: _claim, ...rest } = version;
    return rest;
}

function event(
    id: Id,
    state: string,
    member: Id,
    at: string,
    fieldValueEntities: readonly TransitionFieldValueEntity[],
): WorkOrderEventEntity {
    return {
        id, state, member_id: member, at,
        field_values: fieldValueEntities,
    };
}

// One clock (§5): the request's stamp against the claim's
// expires_at. At the instant itself the claim has lapsed,
// as isExpiresAtPassed decides today.
export function isClaimUnlapsedAt(
    claim: WorkOrderClaim,
    now: string,
): boolean {
    return microsOf(now) < microsOf(claim.expires_at);
}

export function createdVersion(input: {
    readonly id: Id,
    readonly organization_id: Id,
    readonly fields: WorkOrderFields,
    readonly births: readonly {
        readonly id: Id,
        readonly state: string,
        readonly at: string,
    }[],
    readonly creator: Id,
    readonly lockTimeoutSeconds: number,
}): WorkOrderVersion {
    const node = input.births[1]!;
    const claimed = input.births[2]!;
    return ordered({
        id: input.id,
        organization_id: input.organization_id,
        ...input.fields,
        state: node.state,
        transition: { member_id: input.creator, at: node.at },
        claim: {
            member_id: input.creator,
            at: claimed.at,
            expires_at: addUtcSeconds(
                claimed.at, input.lockTimeoutSeconds,
            ),
        },
        events: input.births.map((birth) => event(
            birth.id, birth.state, input.creator, birth.at, [],
        )),
    });
}

function sameFields(
    head: WorkOrderFields,
    fields: WorkOrderFields,
): boolean {
    return head.display_id === fields.display_id
        && head.position === fields.position
        && JSON.stringify(sortJsonKeys(head.flow_graph))
            === JSON.stringify(sortJsonKeys(fields.flow_graph));
}

// The PUT (§5): the request's fields over the head's
// facets, no event. Fields equal to the head's are the
// head, so the statement matches and nothing lands
// (Decision 11).
export function fieldsVersion(
    head: WorkOrderVersion,
    fields: WorkOrderFields,
): WorkOrderVersion {
    if (sameFields(head, fields)) {
        return head;
    }
    return ordered({ ...head, ...fields, events: [] });
}

export function claimedVersion(
    head: WorkOrderVersion,
    input: {
        readonly member: Id,
        readonly claimEventId: Id,
        readonly claimAt: string,
        readonly expireEventId: Id,
        readonly expireAt: string,
        readonly expiresAt: string,
        readonly now: string,
    },
): ClaimChange {
    const prior = head.claim;
    const live = prior !== undefined
        && isClaimUnlapsedAt(prior, input.now);
    if (live && prior.member_id !== input.member) {
        return { kind: 'held', by: prior.member_id };
    }
    if (
        live
        && prior.at === input.claimAt
        && prior.expires_at === input.expiresAt
    ) {
        return { kind: 'claimed', version: head };
    }
    const lapsed = prior !== undefined && !live
        ? [event(
            input.expireEventId, 'claim_expired',
            prior.member_id, input.expireAt, [],
        )]
        : [];
    return {
        kind: 'claimed',
        version: ordered({
            ...head,
            claim: {
                member_id: input.member,
                at: input.claimAt,
                expires_at: input.expiresAt,
            },
            events: [
                ...lapsed,
                event(
                    input.claimEventId, 'claimed',
                    input.member, input.claimAt, [],
                ),
            ],
        }),
    };
}

// A release with no live claim is the head: the statement
// reports it matched and nothing lands (§5).
export function releasedVersion(
    head: WorkOrderVersion,
    input: {
        readonly eventId: Id,
        readonly member: Id,
        readonly at: string,
        readonly now: string,
    },
): WorkOrderVersion {
    if (
        head.claim === undefined
        || !isClaimUnlapsedAt(head.claim, input.now)
    ) {
        return head;
    }
    return ordered({
        ...withoutClaim(head),
        events: [event(
            input.eventId, 'claim_released',
            input.member, input.at, [],
        )],
    });
}

export function transitionedVersion(
    head: WorkOrderVersion,
    input: {
        readonly eventId: Id,
        readonly targetState: string,
        readonly member: Id,
        readonly at: string,
        readonly fieldValueEntities:
            readonly TransitionFieldValueEntity[],
        readonly release:
            | { readonly kind: 'kept' }
            | {
                readonly kind: 'released',
                readonly id: Id,
                readonly at: string,
            },
    },
): WorkOrderVersion {
    const moved = event(
        input.eventId, input.targetState, input.member,
        input.at, input.fieldValueEntities,
    );
    if (input.release.kind === 'kept') {
        return ordered({
            ...head,
            state: input.targetState,
            transition: { member_id: input.member, at: input.at },
            events: [moved],
        });
    }
    return ordered({
        ...withoutClaim(head),
        state: input.targetState,
        transition: { member_id: input.member, at: input.at },
        events: [
            moved,
            event(
                input.release.id, 'claim_released',
                input.member, input.release.at, [],
            ),
        ],
    });
}

export function boundVersion(
    head: WorkOrderVersion,
    instanceId: Id,
    recordTypeId: Id,
): BindingChange {
    if (head.instance_id === undefined) {
        return {
            kind: 'bound',
            version: ordered({
                ...head,
                instance_id: instanceId,
                record_type_id: recordTypeId,
                events: [],
            }),
        };
    }
    if (
        head.instance_id === instanceId
        && head.record_type_id === recordTypeId
    ) {
        return { kind: 'bound', version: head };
    }
    return { kind: 'rebound', to: head.instance_id };
}
