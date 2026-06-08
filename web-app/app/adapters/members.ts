import type {
    MemberId,
    MemberEntity,
    HumanMemberEntity,
    IdentityPiiEntity,
    MemberPii,
    MemberState,
} from '../../../api/types.ts';
import { HumanMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import { getMemberPii } from './identities.ts';
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
    createSubscriptionChannel(
        ['members', 'states', 'identity_pii'],
    );

export function subscribeHumanMemberChanges(
    fn: () => void,
): () => void {
    return humanMemberChanges.subscribe(fn);
}

export function notifyHumanMemberChange(): void {
    humanMemberChanges.notify();
}

// A human member draft: the contact PII plus the org-
// profile detail fields, as the Add Member dialog and the
// edit form supply them. Split across members / identities
// / identity_pii / human-members at the write seam below.
export type HumanMemberDraft =
    Omit<HumanMemberEntity, 'id'>
    & {
        name: string;
        email: string;
        phone: string;
        bio: string;
    };

// Convert an identity_pii row to the display union. A
// missing row (erased PII) yields the erased variant; the
// CALLER decides what to render. Duplicated from
// getMemberPii by design — two uses, not three.
function memberPiiOf(
    row: IdentityPiiEntity | undefined,
): MemberPii {
    if (row === undefined) {
        return { erased: true };
    }
    return {
        erased: false,
        name: row.name,
        email: row.email,
        phone: row.phone,
        bio: row.bio,
    };
}

// Assemble the human-member map from already-read rows —
// pure, no ctx, no IO. getHumanMemberMap reads then
// delegates here; getMembers (the roster) reads members,
// human-members, identity-pii and states ONCE and feeds
// this builder, deriving the state map a single time
// rather than once per member kind.
export function buildHumanMemberMap(
    parents: readonly MemberEntity[],
    details: readonly HumanMemberEntity[],
    piiRows: readonly IdentityPiiEntity[],
    stateMap: ReadonlyMap<MemberId, MemberState>,
): Map<MemberId, HumanMember> {
    const detailById = new Map(
        details.map(d => [d.id, d]),
    );
    const piiById = new Map(
        piiRows.map(r => [r.id, r]),
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
            new HumanMember(
                parent, detail,
                memberPiiOf(piiById.get(parent.id)),
                state,
            ),
        );
    }
    return map;
}

export async function getHumanMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, HumanMember>> {
    const [parents, details, piiRows, stateMap] =
        await Promise.all([
            ctx.GET<MemberEntity[]>('members'),
            ctx.GET<HumanMemberEntity[]>(
                'human-members',
            ),
            ctx.GET<IdentityPiiEntity[]>(
                'identity-pii',
            ),
            getMemberStates(ctx),
        ]);
    return buildHumanMemberMap(
        parents, details, piiRows, stateMap,
    );
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
    const [parent, detail, pii, state] =
        await Promise.all([
            ctx.GET<MemberEntity>(`members/${id}`),
            ctx.GET<HumanMemberEntity>(
                `human-members/${id}`,
            ),
            getMemberPii(ctx, id),
            getMemberState(ctx, id),
        ]);
    return new HumanMember(
        parent, detail, pii, state,
    );
}

export async function getHumanMemberRow(
    ctx: RequestContext,
    id: string,
): Promise<HumanMemberEntity> {
    return ctx.GET<HumanMemberEntity>(
        `human-members/${id}`,
    );
}

// Split a human-member write across the parent (type), the
// identity, the PII row, and the detail row. Used by edits;
// creation goes through postHumanMemberCreation.
export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `members/${id}`,
                body: { type: 'human' },
            },
            {
                method: 'put',
                resource: `identities/${id}`,
                body: { kind: 'person' },
            },
            {
                method: 'put',
                resource: `identity-pii/${id}`,
                body: { name, email, phone, bio },
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

// Human-member creation: parent row + identity + PII row +
// detail row + initial state event in one ctx.commit
// batch. Use only at the Add Member call site; transitions
// of an existing member go through
// postHumanMemberStateChange.
export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
    initialState: MemberState,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `members/${id}`,
                body: { type: 'human' },
            },
            {
                method: 'put',
                resource: `identities/${id}`,
                body: { kind: 'person' },
            },
            {
                method: 'put',
                resource: `identity-pii/${id}`,
                body: { name, email, phone, bio },
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
