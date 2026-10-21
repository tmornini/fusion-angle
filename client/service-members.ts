import type {
    MemberId,
    ServiceEntity,
    MembershipEntity,
    MembershipReadEntity,
} from '../shared/types.ts';
import { ServiceMember, nowUtc } from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
import { requireOrganization, isHumanSeat } from './members.ts';
import { notifyMembershipChanges } from
    './membership-changes.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../shared/http-errors.ts';

const serviceMemberChanges =
    createSubscriptionChannel();

export function subscribeServiceMemberChanges(
    fn: () => void,
): () => void {
    return serviceMemberChanges.subscribe(fn);
}

export type ServiceMemberDraft =
    Omit<ServiceEntity, 'id'>;

function servicesPath(ctx: RequestContext): string {
    return 'organizations/' + requireOrganization(ctx)
        + '/services/';
}

function membershipItemPath(
    ctx: RequestContext,
    id: MemberId,
): string {
    const organization = requireOrganization(ctx);
    return 'organizations/' + organization
        + '/invitations/'
        + membershipNameOf(organization, id);
}

// A service is a member while its membership is accepted:
// a service document with no seat among the memberships
// given is not a member.
export function buildServiceMembers(
    services: readonly ServiceEntity[],
    memberships: readonly HttpMessage<MembershipEntity>[],
): ServiceMember[] {
    const seats = new Map(memberships.map(
        (membership) => [
            membership.body().toValue().identity_id,
            membership,
        ],
    ));
    return services.flatMap((service) => {
        const membership = seats.get(service.id);
        return membership === undefined
            ? []
            : [new ServiceMember(service, membership)];
    });
}

// A membership that is not accepted, or that seats a
// person, is absence, as a missing document is.
export async function getServiceMember(
    ctx: RequestContext,
    id: MemberId,
): Promise<ServiceMember> {
    const [service, membership] = await Promise.all([
        ctx.GET<ServiceEntity>(servicesPath(ctx) + id),
        ctx.GET<MembershipReadEntity>(
            membershipItemPath(ctx, id),
        ),
    ]);
    if (membership.body().toValue().state !== 'accepted'
        || isHumanSeat(membership)) {
        throw new RequestError(
            'no live service member ' + id,
            HTTP_NOT_FOUND,
            membership,
        );
    }
    return new ServiceMember(
        service.body().toValue(), membership,
    );
}

export async function postServiceMemberCreation(
    ctx: RequestContext,
    id: MemberId,
    input: ServiceMemberDraft,
): Promise<void> {
    await ctx.POST(
        'organizations/' + requireOrganization(ctx)
            + '/memberships/',
        {
            id,
            kind: 'service',
            membership: {
                type: 'member',
                at: nowUtc(),
            },
            service: {
                name: input.name,
                description: input.description,
            },
        },
    );
    notifyMembershipChanges();
    serviceMemberChanges.notify();
}

export function getServiceMemberEntity(
    ctx: RequestContext,
    id: MemberId,
): Promise<HttpMessage<ServiceEntity>> {
    return ctx.GET<ServiceEntity>(servicesPath(ctx) + id);
}

// A save from the held service names the head it
// replaces, so a write over a newer head is refused
// rather than lost.
export async function putServiceMember(
    ctx: RequestContext,
    held: HttpMessage<ServiceEntity>,
    input: ServiceMemberDraft,
): Promise<HttpMessage<ServiceEntity>> {
    const saved = await ctx.PUT<ServiceEntity>(
        servicesPath(ctx) + held.body().toValue().id,
        {
            name: input.name,
            description: input.description,
        },
        [held],
    );
    serviceMemberChanges.notify();
    return saved;
}
