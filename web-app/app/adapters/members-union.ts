import type {
    MemberId,
    Member,
    IdentityPiiEntity,
    IdentityEntity,
    MembershipEntity,
    AIAgentEntity,
} from '../../../api/types.ts';
import {
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
    const [
        seats, identities, piiRows, agents,
    ] = await Promise.all([
        organization === undefined
            ? Promise.resolve([] as MembershipEntity[])
            : ctx.GET<MembershipEntity[]>(
                'organizations/' + organization
                    + '/members',
            ),
        ctx.GET<IdentityEntity[]>('identities'),
        ctx.GET<IdentityPiiEntity[]>('identity-pii'),
        ctx.GET<AIAgentEntity[]>('ai-agents'),
    ]);
    const humans = buildHumanMemberMap(
        seats, identities, piiRows,
    );
    const ais = buildAIAgentMap(agents);
    return [
        ...humans.values(),
        ...ais.values(),
    ];
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
