import type {
    MemberId,
    MemberEntity,
    HumanMemberEntity,
    MemberState,
} from '../../../api/types.ts';
import { HumanMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildStateEventOp,
    getMemberState,
    getMemberStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    HumanMember,
    MEMBER_STATE_CONFIG,
    isMemberState,
    isDimensionKey,
} from '../../../api/types.ts';
export type {
    MemberId,
    HumanMemberEntity,
    MemberState,
    DimensionKey,
} from '../../../api/types.ts';

const humanMemberChanges =
    createSubscriptionChannel(['members', 'states']);

export function subscribeHumanMemberChanges(
    fn: () => void,
): () => void {
    return humanMemberChanges.subscribe(fn);
}

export function notifyHumanMemberChange(): void {
    humanMemberChanges.notify();
}

// A human member draft: the parent display name plus
// the detail fields, as the Add Member dialog and the
// edit form supply them. Split into the two table rows
// at the write seam below.
export type HumanMemberDraft =
    Omit<HumanMemberEntity, 'id'> & { name: string };

// A human member composed for the editor: parent name
// merged onto the detail row. Lifecycle state is read
// separately from the states log.
export interface HumanMemberRow extends HumanMemberEntity {
    name: string;
}

export async function getHumanMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, HumanMember>> {
    const [parents, details, stateMap] =
        await Promise.all([
            ctx.GET<MemberEntity[]>('members'),
            ctx.GET<HumanMemberEntity[]>(
                'human-members',
            ),
            getMemberStates(ctx),
        ]);
    const detailById = new Map(
        details.map(d => [d.id, d]),
    );
    const map = new Map<MemberId, HumanMember>();
    for (const parent of parents) {
        if (parent.type !== 'human') continue;
        const detail = detailById.get(parent.id);
        if (detail === undefined) {
            throw new Error(
                'no human detail for member '
                + parent.id,
            );
        }
        const state = stateMap.get(parent.id);
        if (state === undefined) {
            throw new Error(
                'no state event for human member '
                + parent.id,
            );
        }
        map.set(
            parent.id,
            new HumanMember(parent, detail, state),
        );
    }
    return map;
}

export async function getCurrentHumanMember(
    ctx: RequestContext,
): Promise<MemberEntity> {
    return ctx.GET<MemberEntity>(
        'current-member',
    );
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
        .filter(member => member.hasDepartment())
        .slice(0, TOP_HUMAN_MEMBER_COUNT);
}

export async function getHumanMember(
    ctx: RequestContext,
    id: string,
): Promise<HumanMember> {
    const [parent, detail, state] =
        await Promise.all([
            ctx.GET<MemberEntity>(`members/${id}`),
            ctx.GET<HumanMemberEntity>(
                `human-members/${id}`,
            ),
            getMemberState(ctx, id),
        ]);
    return new HumanMember(parent, detail, state);
}

export async function getHumanMemberRow(
    ctx: RequestContext,
    id: string,
): Promise<HumanMemberRow> {
    const [parent, detail] = await Promise.all([
        ctx.GET<MemberEntity>(`members/${id}`),
        ctx.GET<HumanMemberEntity>(
            `human-members/${id}`,
        ),
    ]);
    return { ...detail, name: parent.name };
}

// Split a human-member write across the parent (type +
// name) and detail rows. Used by edits; creation goes
// through postHumanMemberCreation.
export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `members/${id}`,
                body: { type: 'human', name },
            },
            {
                method: 'put',
                resource: `human-members/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
        ],
    });
    humanMemberChanges.notify();
}

// Human-member creation: parent row + detail row +
// initial state event in one ctx.commit batch. Use only
// at the Add Member call site; transitions of an
// existing member go through postHumanMemberStateChange.
export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
    initialState: MemberState,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `members/${id}`,
                body: { type: 'human', name },
            },
            {
                method: 'put',
                resource: `human-members/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
            await buildStateEventOp(
                ctx, id, initialState,
            ),
        ],
    });
    humanMemberChanges.notify();
}

export async function postHumanMemberStateChange(
    ctx: RequestContext,
    id: string,
    state: MemberState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(ctx, id, state),
        ],
    });
    humanMemberChanges.notify();
}
