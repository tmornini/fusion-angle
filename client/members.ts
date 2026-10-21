import type {
    MemberId,
    MemberEntity,
    HumanMemberEntity,
    IdentityEntity,
    HumanProfile,
    IdentityPiiEntity,
    MemberPii,
    MembershipEntity,
    AIAgentEntity,
    ServiceEntity,
} from '../shared/types.ts';
import {
    HumanMember,
    nowUtc,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { byAtThenIdAscending } from '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { getMemberPii } from './identities.ts';
import {
    notifyHumanMemberChanges,
    notifyMembershipChanges,
} from './membership-changes.ts';
export {
    subscribeHumanMemberChanges,
} from './membership-changes.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../shared/http-errors.ts';

export type HumanMemberDraft =
    Omit<HumanMemberEntity, 'id'>
    & {
        name: string;
        email: string;
        phone: string;
        bio: string;
    };

function sessionOrganization(
    ctx: RequestContext,
): string | undefined {
    return ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
}

export function requireOrganization(ctx: RequestContext): string {
    const organization = sessionOrganization(ctx);
    if (organization === undefined) {
        throw new Error(
            'no organization on the session for memberships',
        );
    }
    return organization;
}

function acceptedMemberships(ctx: RequestContext): string {
    return 'organizations/' + requireOrganization(ctx)
        + '/memberships/?state=accepted';
}

function membershipItem(
    ctx: RequestContext,
    identityId: string,
): string {
    const organization = requireOrganization(ctx);
    return 'organizations/' + organization
        + '/invitations/'
        + membershipNameOf(organization, identityId);
}

function byAtThenIdentity(
    a: HttpMessage<MembershipEntity>,
    b: HttpMessage<MembershipEntity>,
): number {
    const left = a.body().toValue();
    const right = b.body().toValue();
    return byAtThenIdAscending(
        { at: left.at, id: left.identity_id },
        { at: right.at, id: right.identity_id },
    );
}

function profileOf(
    identity: IdentityEntity,
): HumanProfile {
    if (!('title' in identity)) {
        return { present: false };
    }
    return {
        present: true,
        title: identity.title,
        department: identity.department,
        strengths: identity.strengths,
        team_dimensions: identity.team_dimensions,
    };
}

function seatedHumanParent(
    id: MemberId,
): MemberEntity {
    return { id, type: 'human' };
}

// The roster serves in write order; the members page and
// the palette's featured six read memberships in grant
// order: at, then identity.
export function buildHumanMemberMap(
    memberships: readonly HttpMessage<MembershipEntity>[],
): Map<MemberId, HumanMember> {
    const map = new Map<MemberId, HumanMember>();
    const granted = memberships.toSorted(byAtThenIdentity);
    for (const membership of granted) {
        const identityId = membership.body()
            .toValue().identity_id;
        map.set(
            identityId,
            new HumanMember(
                seatedHumanParent(identityId),
                { present: false },
                { erased: true },
                membership,
            ),
        );
    }
    return map;
}

// A membership's kind test, not a roster: the ids of the
// organization's AI and service members, an aggregate
// that drops the responses it was built from.
export async function getNonHumanMemberIds(
    ctx: RequestContext,
): Promise<ReadonlySet<MemberId>> {
    const organization = requireOrganization(ctx);
    const [agents, services] = await Promise.all([
        ctx.GETCollection<AIAgentEntity>(
            'organizations/' + organization + '/ai-agents/',
        ),
        ctx.GETCollection<ServiceEntity>(
            'organizations/' + organization + '/services/',
        ),
    ]);
    return new Set([
        ...agents.map(part => part.body().toValue().id),
        ...services.map(part => part.body().toValue().id),
    ]);
}

export async function getHumanMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, HumanMember>> {
    const [memberships, nonHuman] = await Promise.all([
        ctx.GETCollection<MembershipEntity>(
            acceptedMemberships(ctx),
        ),
        getNonHumanMemberIds(ctx),
    ]);
    const map = buildHumanMemberMap(memberships.filter(
        part => !nonHuman.has(part.body().toValue().identity_id),
    ));
    const filled = await Promise.all(
        [...map.entries()].map(async ([id, member]) => {
            const pii = await getMemberPii(ctx, id);
            return [
                id,
                new HumanMember(
                    seatedHumanParent(id),
                    { present: false },
                    pii,
                    member.membership,
                ),
            ] as const;
        }),
    );
    return new Map(filled);
}

export async function getCurrentHumanMember(
    ctx: RequestContext,
): Promise<{ id: string }> {
    return { id: ctx.identity.id };
}

const TOP_HUMAN_MEMBER_COUNT = 6;

export async function getHumanMembers(
    ctx: RequestContext,
): Promise<HumanMember[]> {
    const memberMap = await getHumanMemberMap(ctx);
    return Array.from(memberMap.values());
}

export function featuredHumanMembers(
    members: HumanMember[],
): HumanMember[] {
    return members
        .filter(member => member.department().present)
        .slice(0, TOP_HUMAN_MEMBER_COUNT);
}

export async function getHumanMember(
    ctx: RequestContext,
    id: string,
): Promise<HumanMember | null> {
    let membership: HttpMessage<MembershipEntity>;
    try {
        membership = await ctx.GET<MembershipEntity>(
            membershipItem(ctx, id),
        );
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status === HTTP_NOT_FOUND
        ) {
            return null;
        }
        throw err;
    }
    const body = membership.body().toValue();
    if (body.state !== 'accepted') return null;
    const [identity, pii] = await Promise.all([
        ctx.GET<IdentityEntity>(
            `identities/${id}`,
        ).then(read => read.body().toValue()),
        getMemberPii(ctx, id),
    ]);
    if (identity.kind !== 'person') return null;
    return new HumanMember(
        seatedHumanParent(id),
        profileOf(identity),
        pii,
        membership,
    );
}

// The profile with the read it came from, so a save over
// it names the head it replaces.
export async function getHumanMemberProfile(
    ctx: RequestContext,
    id: string,
): Promise<{
    profile: HumanProfile;
    read: HttpMessage<IdentityEntity>;
}> {
    const read = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
    return { profile: profileOf(read.body().toValue()), read };
}

// The identity save latches the identity read it was formed
// from; the PII save, when there is one, latches the held
// PII, and goes unlatched when the member had none (a
// singleton's first write).
export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    identity: {
        held: HttpMessage<IdentityEntity>;
        body: Omit<HumanMemberEntity, 'id'>;
    },
    pii?: {
        current: MemberPii;
        body: Omit<IdentityPiiEntity, 'id'>;
    },
): Promise<void> {
    await ctx.PUT(`identities/${id}`, {
        kind: 'person',
        title: identity.body.title,
        department: identity.body.department,
        strengths: identity.body.strengths,
        team_dimensions: identity.body.team_dimensions,
    }, [identity.held]);
    if (pii !== undefined) {
        await ctx.PUT(
            `identities/${id}/pii`,
            { ...pii.body },
            pii.current.erased ? undefined : [pii.current.message],
        );
    }
    notifyHumanMemberChanges();
}

export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.POST(
        'organizations/' + requireOrganization(ctx)
            + '/memberships/',
        {
            id,
            kind: 'human',
            membership: {
                type: 'member',
                at: nowUtc(),
            },
            identity: {
                title: detail.title,
                department: detail.department,
                strengths: detail.strengths,
                team_dimensions: detail.team_dimensions,
            },
            pii: { name, email, phone, bio },
        },
    );
    notifyMembershipChanges();
}

// The membership PUT that ends the place — the identity
// survives. The API refuses the last admin (409); the page
// mirrors that guard through getAdminSeatIds rather than
// discovering it here. The removal names the membership
// the member was read through.
export async function postMembershipRemoval(
    ctx: RequestContext,
    member: HumanMember,
): Promise<void> {
    await ctx.PUT(
        membershipItem(ctx, member.idForLink()),
        { state: 'removed', at: nowUtc() },
        [member.membership],
    );
    notifyMembershipChanges();
}

export async function getAdminSeatIds(
    ctx: RequestContext,
): Promise<MemberId[]> {
    const memberships = (
        await ctx.GETCollection<MembershipEntity>(
            acceptedMemberships(ctx),
        )
    ).map((m) => m.body().toValue());
    return memberships
        .filter(membership => membership.type === 'admin')
        .map(membership => membership.identity_id);
}
