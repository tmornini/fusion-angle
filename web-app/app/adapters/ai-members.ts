import type {
    MemberId,
    MemberEntity,
    AIMemberEntity,
    MemberState,
    MemberStateDetail,
} from '../../../api/types.ts';
import { AIMember, nowUtc } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    memberStateDetailFromRow,
} from './members.ts';

export {
    AIMember,
} from '../../../api/types.ts';
export type {
    AIMemberEntity,
    MemberStateDetail,
} from '../../../api/types.ts';

const aiMemberChanges =
    createSubscriptionChannel();

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
// batched read shared with the human builder. Lifecycle
// trio rides each parent row (Phase A stamp).
export function buildAIMemberMap(
    parents: readonly MemberEntity[],
    details: readonly AIMemberEntity[],
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
        map.set(
            parent.id,
            new AIMember(
                parent, detail,
                memberStateDetailFromRow(parent),
            ),
        );
    }
    return map;
}

export async function getAIMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, AIMember>> {
    const [parents, details] =
        await Promise.all([
            ctx.GET<MemberEntity[]>('members'),
            ctx.GET<AIMemberEntity[]>('ai-members'),
        ]);
    return buildAIMemberMap(parents, details);
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
    const [parent, detail] =
        await Promise.all([
            ctx.GET<MemberEntity>(`members/${id}`),
            ctx.GET<AIMemberEntity>(
                `ai-members/${id}`,
            ),
        ]);
    return new AIMember(
        parent, detail,
        memberStateDetailFromRow(parent),
    );
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
// lands both facet puts in ONE transaction. The edit body
// ECHOES the current lifecycle trio verbatim so a byte-
// identical members/:id re-put folds by message_hash rather
// than minting a phantom transition.
export async function putAIMember(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
    stateEcho: MemberStateDetail,
): Promise<void> {
    await ctx.POST(`ai-members/${id}`, {
        detail: input as unknown as
            Record<string, unknown>,
        state: stateEcho.state,
        stateAt: stateEcho.stateAt,
        stateEventId: stateEcho.stateEventId,
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
        initialStateAt: nowUtc(),
    });
    aiMemberChanges.notify();
}

// A state change is an honest document write: PUT members/:id
// with a FRESH trio — the postIdeaStateChange composition,
// pointed at the members document address.
export async function postAIMemberStateChange(
    ctx: RequestContext,
    id: MemberId,
    state: MemberState,
): Promise<void> {
    await ctx.PUT(`members/${id}`, {
        type: 'ai',
        state,
        state_at: nowUtc(),
        state_event_id: generateCryptoSafeBase62(),
    });
    aiMemberChanges.notify();
}
