import type {
    MemberId,
    Member,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdentityPiiEntity,
    MemberState,
    StateEntity,
} from '../../../api/types.ts';
import { SystemMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildHumanMemberMap,
} from './members.ts';
import {
    buildAIMemberMap,
} from './ai-members.ts';
import {
    getMemberStates,
    latestStatesForIds,
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

// The roster. Reads members, human-members, identity-pii,
// ai-members and the states log ONCE, derives the latest
// state per member a single time via latestStatesForIds,
// then feeds both pure builders. Earlier this fanned out to
// getHumanMembers + getAIMembers, each of which re-read
// members and the states log via getMemberStates — so the
// members table was read four times and the states log
// twice per roster load. The states log read is the costly
// one (the org fence resolves every event's owning org), so
// deriving once is the "read the ledger once" cleanup.
export async function getMembers(
    ctx: RequestContext,
): Promise<Member[]> {
    const [
        parents, humanDetails, piiRows, aiDetails, events,
    ] = await Promise.all([
        ctx.GET<MemberEntity[]>('members'),
        ctx.GET<HumanMemberEntity[]>('human-members'),
        ctx.GET<IdentityPiiEntity[]>('identity-pii'),
        ctx.GET<AIMemberEntity[]>('ai-members'),
        ctx.GET<StateEntity[]>('states'),
    ]);
    const ids = new Set<MemberId>(
        parents.map(p => p.id),
    );
    const stateMap =
        latestStatesForIds<MemberState>(events, ids);
    const humans = buildHumanMemberMap(
        parents, humanDetails, piiRows, stateMap,
    );
    const ais = buildAIMemberMap(
        parents, aiDetails, stateMap,
    );
    return [
        ...humans.values(),
        ...ais.values(),
    ];
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

// The display name for a member whose PII is absent — erased,
// or never recorded. Member-domain vocabulary; the identity
// surfaces use IDENTITY_WITHOUT_PII_NAME instead.
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
