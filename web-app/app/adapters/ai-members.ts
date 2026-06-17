import type {
    MemberId,
    MemberEntity,
    AIMemberEntity,
    MemberState,
} from '../../../api/types.ts';
import { AIMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    postStateEvent,
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

export type AIMemberDraft =
    Omit<AIMemberEntity, 'id'>;

// Assemble the AI-member map from already-read rows — pure,
// no ctx, no IO. getAIMemberMap reads then delegates here;
// getMembers (the roster) feeds this builder from one
// batched read shared with the human builder.
export function buildAIMemberMap(
    parents: readonly MemberEntity[],
    details: readonly AIMemberEntity[],
    stateMap: ReadonlyMap<MemberId, MemberState>,
): Map<MemberId, AIMember> {
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

export async function getAIMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, AIMember>> {
    const [parents, details, stateMap] =
        await Promise.all([
            ctx.GET<MemberEntity[]>('members'),
            ctx.GET<AIMemberEntity[]>('ai-members'),
            getMemberStates(ctx),
        ]);
    return buildAIMemberMap(parents, details, stateMap);
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

export async function getAIMemberEntity(
    ctx: RequestContext,
    id: MemberId,
): Promise<AIMemberEntity> {
    return ctx.GET<AIMemberEntity>(
        `ai-members/${id}`,
    );
}

// Split an AI-member write across the parent (type) and the
// detail row. Used by edits; creation goes through
// postAIMemberCreation. The named composing POST /ai-members/:id
// lands both facet puts in ONE transaction; no state event (an
// edit does not move the member's lifecycle).
export async function putAIMember(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    await ctx.POST(`ai-members/${id}`, {
        detail: input as unknown as
            Record<string, unknown>,
    });
    aiMemberChanges.notify();
}

// AI-member creation: parent row + detail row + initial state
// event, composed by the named POST /ai-members into ONE
// transaction. Use only at the create call site; transitions of
// an existing member go through postAIMemberStateChange. The
// initial event's author is stamped server-side from the
// verified token; the client mints the event id, so a retry
// hits one row.
export async function postAIMemberCreation(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    await ctx.POST('ai-members', {
        id,
        detail: input as unknown as
            Record<string, unknown>,
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
    });
    aiMemberChanges.notify();
}

export async function postAIMemberStateChange(
    ctx: RequestContext,
    id: MemberId,
    state: MemberState,
): Promise<void> {
    await postStateEvent(ctx, id, state);
    aiMemberChanges.notify();
}
