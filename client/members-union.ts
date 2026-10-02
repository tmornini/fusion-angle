import type {
    MemberId,
    Member,
    SeatEntity,
    AIAgentEntity,
    FormerSeatEntity,
} from '../shared/types.ts';
import {
    HumanMember,
    SystemMember,
    FormerMember,
    SYSTEM_MEMBER_ID,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    buildHumanMemberMap,
    getHumanMemberProfile,
} from './members.ts';
import {
    buildAIAgentMap,
} from './ai-members.ts';
import { getMemberPii } from './identities.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
    HTTP_FORBIDDEN,
} from '../shared/http-errors.ts';

function getSystemMembers(): SystemMember[] {
    return [
        new SystemMember(
            {
                id: SYSTEM_MEMBER_ID,
                type: 'system',
            },
        ),
    ];
}

export async function getMembers(
    ctx: RequestContext,
): Promise<Member[]> {
    const organization = ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
    const [seats, agents] = await Promise.all([
        organization === undefined
            ? Promise.resolve(
                [] as HttpMessage<SeatEntity>[],
            )
            : ctx.GETCollection<SeatEntity>(
                'organizations/' + organization
                    + '/members/',
            ),
        ctx.GETCollection<AIAgentEntity>('ai-agents/')
            .then(parts => parts.map((m) => m.body().toValue())),
    ]);
    const humans = buildHumanMemberMap(seats);
    const ais = buildAIAgentMap(agents);
    return fillHumanMemberPii(ctx, [
        ...humans.values(),
        ...ais.values(),
    ]);
}

// Live PII fill. getMembers runs this so every roster
// (designer, workbox, ideas) shows the name unless
// /pii is actually erased.
export async function fillHumanMemberPii(
    ctx: RequestContext,
    members: readonly Member[],
): Promise<Member[]> {
    return Promise.all(members.map(async member => {
        if (member.kind !== 'human') {
            return member;
        }
        const pii = await getMemberPii(
            ctx, member.idForLink(),
        );
        return new HumanMember(
            {
                id: member.idForLink(),
                type: 'human',
            },
            member.profile(),
            pii,
            member.membership,
        );
    }));
}

// Members list only. Other rosters (ideas, workbox,
// designer) paint names from PII and never GET
// identities/:id for title/department.
export async function fillHumanMemberProfile(
    ctx: RequestContext,
    members: readonly Member[],
): Promise<Member[]> {
    return Promise.all(members.map(async member => {
        if (member.kind !== 'human') {
            return member;
        }
        const id = member.idForLink();
        try {
            const { profile } =
                await getHumanMemberProfile(
                    ctx, id,
                );
            return new HumanMember(
                { id, type: 'human' },
                profile,
                member.pii(),
                member.membership,
            );
        } catch (error) {
            if (error instanceof RequestError
                && (error.status === HTTP_NOT_FOUND
                    || error.status
                        === HTTP_FORBIDDEN)) {
                return member;
            }
            throw error;
        }
    }));
}

// The seats the ledger has DELETEd for this organization —
// resolved beside the live roster so an author who has
// left still names. A flat session with no organization
// has no former seats to read.
async function getFormerMembers(
    ctx: RequestContext,
): Promise<FormerMember[]> {
    const organization = ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
    if (organization === undefined) return [];
    const seats = (await ctx.GET<FormerSeatEntity[]>(
        'organizations/' + organization
            + '/former-members/',
    )).body().toValue();
    return seats.map(seat => new FormerMember(seat));
}

export async function getMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, Member>> {
    const [members, former] = await Promise.all([
        getMembers(ctx),
        getFormerMembers(ctx),
    ]);
    const system = getSystemMembers();
    return new Map(
        [...members, ...former, ...system].map(
            member => [member.idForLink(), member],
        ),
    );
}

export const MEMBER_WITHOUT_PII_NAME = 'Member without PII';

export function memberName(
    memberMap: Map<MemberId, Member>,
    memberId: MemberId,
): string {
    const member = memberMap.get(memberId);
    if (!member) {
        throw new Error(
            'memberName: unknown member '
            + memberId,
        );
    }
    if (member.kind === 'human') {
        const pii = member.pii();
        return pii.erased
            ? MEMBER_WITHOUT_PII_NAME
            : pii.name;
    }
    return member.name();
}
