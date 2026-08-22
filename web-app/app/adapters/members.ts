import type {
    MemberId,
    MemberEntity,
    HumanMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    MembershipEntity,
} from '../../../api/types.ts';
import {
    HumanMember,
    nowUtc,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import { getMemberPii } from './identities.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    HumanMember,
    isDimensionKey,
} from '../../../api/types.ts';
export type {
    MemberId,
    HumanMemberEntity,
    DimensionKey,
} from '../../../api/types.ts';

const humanMemberChanges =
    createSubscriptionChannel();

export function subscribeHumanMemberChanges(
    fn: () => void,
): () => void {
    return humanMemberChanges.subscribe(fn);
}

export type HumanMemberDraft =
    Omit<HumanMemberEntity, 'id'>
    & {
        name: string;
        email: string;
        phone: string;
        bio: string;
    };

function emptyPersonProfile(
    id: MemberId,
): HumanMemberEntity {
    return {
        id,
        title: '',
        department: '',
        strengths: [],
        team_dimensions: {},
    };
}

function sessionOrganization(
    ctx: RequestContext,
): string | undefined {
    return ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
}

function seatsCollection(ctx: RequestContext): string {
    const organization = sessionOrganization(ctx);
    if (organization === undefined) {
        throw new Error(
            'no organization on the session for seats',
        );
    }
    return 'organizations/' + organization + '/members/';
}

function profileOf(
    identity: IdentityEntity,
): HumanMemberEntity {
    return {
        id: identity.id,
        title: identity.title ?? '',
        department: identity.department ?? '',
        strengths: identity.strengths ?? [],
        team_dimensions: identity.team_dimensions ?? {},
    };
}

function seatedHumanParent(
    id: MemberId,
): MemberEntity {
    return { id, type: 'human' };
}

export function buildHumanMemberMap(
    seats: readonly MembershipEntity[],
): Map<MemberId, HumanMember> {
    const map = new Map<MemberId, HumanMember>();
    for (const seat of seats) {
        map.set(
            seat.identity_id,
            new HumanMember(
                seatedHumanParent(seat.identity_id),
                emptyPersonProfile(seat.identity_id),
                { erased: true },
            ),
        );
    }
    return map;
}

export async function getHumanMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, HumanMember>> {
    const seats = await ctx.GET<MembershipEntity[]>(
        seatsCollection(ctx),
    );
    const map = buildHumanMemberMap(seats);
    const filled = await Promise.all(
        [...map.entries()].map(async ([id]) => {
            const pii = await getMemberPii(ctx, id);
            return [
                id,
                new HumanMember(
                    seatedHumanParent(id),
                    emptyPersonProfile(id),
                    pii,
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
): Promise<HumanMember> {
    const [, identity, pii] =
        await Promise.all([
            ctx.GET<MembershipEntity>(
                seatsCollection(ctx) + id,
            ),
            ctx.GET<IdentityEntity>(
                `identities/${id}`,
            ),
            getMemberPii(ctx, id),
        ]);
    return new HumanMember(
        seatedHumanParent(id),
        profileOf(identity),
        pii,
    );
}

export async function getHumanMemberEntity(
    ctx: RequestContext,
    id: string,
): Promise<HumanMemberEntity> {
    const identity = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
    return profileOf(identity);
}

export class HumanMemberPiiIntakeFailedError extends Error {
    readonly id: string;
    constructor(id: string, cause: unknown) {
        super(
            `human member ${id} was created, but its PII`
            + ' intake failed — it now carries no PII until a'
            + ' retry succeeds',
            { cause },
        );
        this.id = id;
    }
}

export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    detail: Omit<HumanMemberEntity, 'id'>,
    pii?: Omit<IdentityPiiEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`identities/${id}`, {
        kind: 'person',
        title: detail.title,
        department: detail.department,
        strengths: detail.strengths,
        team_dimensions: detail.team_dimensions,
    });
    if (pii !== undefined) {
        await ctx.PUT(`identities/${id}/pii`, { ...pii });
    }
    humanMemberChanges.notify();
}

export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.PUT(`identities/${id}`, {
        kind: 'person',
        title: detail.title,
        department: detail.department,
        strengths: detail.strengths,
        team_dimensions: detail.team_dimensions,
    });
    try {
        await ctx.PUT(`identities/${id}/pii`, {
            name, email, phone, bio,
        });
    } catch (err) {
        throw new HumanMemberPiiIntakeFailedError(id, err);
    }
    await ctx.PUT(
        seatsCollection(ctx) + id,
        { type: 'member', at: nowUtc() },
    );
    humanMemberChanges.notify();
}
