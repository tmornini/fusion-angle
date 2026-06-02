import type {
    MemberId,
    MemberEntity,
    AIMemberEntity,
    MemberState,
} from '../../../api/types.ts';
import { AIMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    buildStateEventOp,
    getMemberState,
    getMemberStates,
} from './state-events.ts';

export {
    AIMember,
} from '../../../api/types.ts';
export type {
    AIMemberEntity,
} from '../../../api/types.ts';

const aiMemberChanges =
    createSubscriptionChannel(['ai_members', 'states']);

export function subscribeAIMemberChanges(
    fn: () => void,
): () => void {
    return aiMemberChanges.subscribe(fn);
}

export function notifyAIMemberChange(): void {
    aiMemberChanges.notify();
}

export type AIMemberDraft =
    Omit<AIMemberEntity, 'id'> & { name: string };

export interface AIMemberRow extends AIMemberEntity {
    name: string;
}

export async function getAIMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, AIMember>> {
    const [parents, details, stateMap] =
        await Promise.all([
            ctx.GET<MemberEntity[]>('members'),
            ctx.GET<AIMemberEntity[]>('ai-members'),
            getMemberStates(ctx),
        ]);
    const detailById = new Map(
        details.map(d => [d.id, d]),
    );
    const map = new Map<MemberId, AIMember>();
    for (const parent of parents) {
        if (parent.type !== 'ai') continue;
        const detail = detailById.get(parent.id);
        if (detail === undefined) {
            throw new Error(
                'no AI detail for member ' + parent.id,
            );
        }
        const state = stateMap.get(parent.id);
        if (state === undefined) {
            throw new Error(
                'no state event for AI member '
                + parent.id,
            );
        }
        map.set(
            parent.id,
            new AIMember(parent, detail, state),
        );
    }
    return map;
}

export async function getAIMembers(
    ctx: RequestContext,
): Promise<AIMember[]> {
    const map = await getAIMemberMap(ctx);
    return Array.from(map.values());
}

export async function getAIMember(
    ctx: RequestContext,
    id: MemberId,
): Promise<AIMember> {
    const [parent, detail, state] =
        await Promise.all([
            ctx.GET<MemberEntity>(`members/${id}`),
            ctx.GET<AIMemberEntity>(
                `ai-members/${id}`,
            ),
            getMemberState(ctx, id),
        ]);
    return new AIMember(parent, detail, state);
}

export async function getAIMemberRow(
    ctx: RequestContext,
    id: MemberId,
): Promise<AIMemberRow> {
    const [parent, detail] = await Promise.all([
        ctx.GET<MemberEntity>(`members/${id}`),
        ctx.GET<AIMemberEntity>(`ai-members/${id}`),
    ]);
    return { ...detail, name: parent.name };
}

// Edits only; creation goes through
// postAIMemberCreation.
export async function putAIMember(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `members/${id}`,
                body: { type: 'ai', name },
            },
            {
                method: 'put',
                resource: `ai-members/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
        ],
    });
    aiMemberChanges.notify();
}

// Creation also emits the initial 'active' state
// event, so it cannot reuse putAIMember (edits only).
// Use at every site that creates an AI member.
export async function postAIMemberCreation(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `members/${id}`,
                body: { type: 'ai', name },
            },
            {
                method: 'put',
                resource: `ai-members/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
            await buildStateEventOp(ctx, id, 'active'),
        ],
    });
    aiMemberChanges.notify();
}

export async function postAIMemberStateChange(
    ctx: RequestContext,
    id: MemberId,
    state: MemberState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(ctx, id, state),
        ],
    });
    aiMemberChanges.notify();
}
