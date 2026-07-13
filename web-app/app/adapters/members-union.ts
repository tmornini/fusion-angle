import type {
    MemberId,
    Member,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdentityPiiEntity,
} from '../../../api/types.ts';
import {
    SystemMember,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildHumanMemberMap,
    memberStateDetailFromRow,
} from './members.ts';
import {
    buildAIMemberMap,
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

// The system member has no detail row — it is a parent
// row (type 'system') plus its lifecycle state. Read it
// here so getMemberMap can resolve a system-authored
// event's author; getMembers (the roster) omits it.
// Lifecycle trio rides the parent GET row (Phase A).
async function getSystemMembers(
    ctx: RequestContext,
): Promise<SystemMember[]> {
    const parents =
        await ctx.GET<MemberEntity[]>('members');
    const out: SystemMember[] = [];
    for (const parent of parents) {
        if (parent.type !== 'system') continue;
        out.push(
            new SystemMember(
                parent,
                memberStateDetailFromRow(parent).state,
            ),
        );
    }
    return out;
}

// The roster. Reads members, human-members, identity-pii
// and ai-members ONCE, then feeds both pure builders.
// Lifecycle-current trio is stamped on each MemberEntity
// GET row (Phase A) — no second hop to the states log.
export async function getMembers(
    ctx: RequestContext,
): Promise<Member[]> {
    const [
        parents, humanDetails, piiRows, aiDetails,
    ] = await Promise.all([
        ctx.GET<MemberEntity[]>('members'),
        ctx.GET<HumanMemberEntity[]>('human-members'),
        ctx.GET<IdentityPiiEntity[]>('identity-pii'),
        ctx.GET<AIMemberEntity[]>('ai-members'),
    ]);
    const humans = buildHumanMemberMap(
        parents, humanDetails, piiRows,
    );
    const ais = buildAIMemberMap(
        parents, aiDetails,
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
