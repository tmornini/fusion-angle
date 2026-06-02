import type {
    MemberId,
    Member,
    MemberEntity,
} from '../../../api/types.ts';
import { SystemMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getHumanMembers,
} from './members.ts';
import {
    getAIMembers,
} from './ai-members.ts';
import {
    getMemberStates,
} from './state-events.ts';

export {
    SystemMember,
    isHumanMember,
    isAIMember,
    isSystemMember,
} from '../../../api/types.ts';
export type {
    Member,
} from '../../../api/types.ts';

// The system member has no detail row — it is a parent
// row (type 'system') plus its lifecycle state. Read it
// here so getMemberMap can resolve a system-authored
// event's author; getMembers (the roster) omits it.
async function getSystemMembers(
    ctx: RequestContext,
): Promise<SystemMember[]> {
    const [parents, stateMap] = await Promise.all([
        ctx.GET<MemberEntity[]>('members'),
        getMemberStates(ctx),
    ]);
    const out: SystemMember[] = [];
    for (const parent of parents) {
        if (parent.type !== 'system') continue;
        const state = stateMap.get(parent.id);
        if (state === undefined) {
            throw new Error(
                'no state event for system member '
                + parent.id,
            );
        }
        out.push(new SystemMember(parent, state));
    }
    return out;
}

export async function getMembers(
    ctx: RequestContext,
): Promise<Member[]> {
    const [humans, ais] = await Promise.all([
        getHumanMembers(ctx),
        getAIMembers(ctx),
    ]);
    return [...humans, ...ais];
}

// Resolve every member by id for name display. Unlike
// getMembers (the roster), this includes the system
// member so a system-authored event's author resolves
// rather than throwing.
export async function getMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, Member>> {
    const [members, system] = await Promise.all([
        getMembers(ctx),
        getSystemMembers(ctx),
    ]);
    return new Map(
        [...members, ...system].map(
            member => [member.idForLink(), member],
        ),
    );
}

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
    return member.name();
}
