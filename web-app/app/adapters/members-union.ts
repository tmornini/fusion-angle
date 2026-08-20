import type {
    MemberId,
    Member,
    MembershipEntity,
    AIAgentEntity,
} from '../../../api/types.ts';
import {
    HumanMember,
    SystemMember,
    SYSTEM_MEMBER_ID,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildHumanMemberMap,
} from './members.ts';
import {
    buildAIAgentMap,
} from './ai-members.ts';
import { getMemberPii } from './identities.ts';

export {
    SystemMember,
    isHumanMember,
    isAIMember,
    isSystemMember,
} from '../../../api/types.ts';
export type {
    Member,
} from '../../../api/types.ts';

function getSystemMembers(): SystemMember[] {
    return [
        new SystemMember(
            {
                id: SYSTEM_MEMBER_ID,
                type: 'system',
                state: 'active',
                state_at: '',
                state_event_id: SYSTEM_MEMBER_ID,
            },
            'active',
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
            ? Promise.resolve([] as MembershipEntity[])
            : ctx.GET<MembershipEntity[]>(
                'organizations/' + organization
                    + '/members/',
            ),
        ctx.GET<AIAgentEntity[]>('ai-agents/'),
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
                state: member.stateValue(),
                state_at: member.stateAtValue(),
                state_event_id:
                    member.stateEventIdValue(),
            },
            {
                id: member.idForLink(),
                title: member.titleLabel(),
                department: member.departmentLabel(),
                strengths: [...member.strengths()],
                team_dimensions: {
                    ...member.teamDimensions(),
                },
            },
            pii,
            {
                state: member.stateValue(),
                stateAt: member.stateAtValue(),
                stateEventId:
                    member.stateEventIdValue(),
            },
        );
    }));
}

export async function getMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, Member>> {
    const members = await getMembers(ctx);
    const system = getSystemMembers();
    return new Map(
        [...members, ...system].map(
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
