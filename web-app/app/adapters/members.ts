import type {
    MemberId,
    MemberEntity,
    HumanMemberEntity,
    IdentityPiiEntity,
    MemberPii,
    MemberState,
    MemberStateDetail,
} from '../../../api/types.ts';
import { HumanMember, nowUtc } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import { getMemberPii } from './identities.ts';
import {
    getMemberStateDetail,
    getMemberStateDetails,
} from './state-events.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    HumanMember,
    isMemberState,
    isDimensionKey,
} from '../../../api/types.ts';
export type {
    MemberId,
    HumanMemberEntity,
    MemberState,
    MemberStateDetail,
    DimensionKey,
} from '../../../api/types.ts';

const humanMemberChanges =
    createSubscriptionChannel();

export function subscribeHumanMemberChanges(
    fn: () => void,
): () => void {
    return humanMemberChanges.subscribe(fn);
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
    stateMap: ReadonlyMap<MemberId, MemberStateDetail>,
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
            getMemberStateDetails(ctx),
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
        .filter(member => member.department().present)
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
            getMemberStateDetail(ctx, id),
        ]);
    return new HumanMember(
        parent, detail, pii, state,
    );
}

export async function getHumanMemberEntity(
    ctx: RequestContext,
    id: string,
): Promise<HumanMemberEntity> {
    return ctx.GET<HumanMemberEntity>(
        `human-members/${id}`,
    );
}

// A human member's create's second hop (its PII intake, PUT
// identities/:id/pii) failed — the member's other facets already
// landed. Distinguished from a first-hop failure so the caller
// can name the partial state rather than a blanket "failed to
// add member" (mirrors identities.ts's own
// IdentityPiiIntakeFailedError for identity create).
export class HumanMemberPiiIntakeFailedError extends Error {
    readonly id: string;
    constructor(id: string, cause: unknown) {
        super(
            `human member ${id} was created, but its PII`
            + ' intake failed — it now carries no PII until a'
            + ' retry succeeds',
            { cause },
        );
        this.id = id;
    }
}

// Re-put the human-member detail facet (the parent member type
// and identity kind are server-supplied facts the composing
// POST re-pins; the named composing POST /human-members/:id
// lands them in ONE transaction). The edit body ECHOES the
// current lifecycle trio verbatim so a byte-identical
// members/:id re-put folds by message_hash rather than minting
// a phantom transition. PII changes via a separate PUT
// identities/:id/pii second hop, fired IFF the caller supplies
// a `pii` arg — the dirty check (members/detail.ts's
// saveHumanMember) decides, so a detail-only save stays ONE hop
// (Phase 10 Task 2's intake decomposition).
export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    detail: Omit<HumanMemberEntity, 'id'>,
    stateEcho: MemberStateDetail,
    pii?: Omit<IdentityPiiEntity, 'id'>,
): Promise<void> {
    await ctx.POST(`human-members/${id}`, {
        detail: detail as unknown as
            Record<string, unknown>,
        state: stateEcho.state,
        stateAt: stateEcho.stateAt,
        stateEventId: stateEcho.stateEventId,
    });
    if (pii !== undefined) {
        await ctx.PUT(`identities/${id}/pii`, { ...pii });
    }
    humanMemberChanges.notify();
}

// Human-member creation: parent row + identity + detail row +
// initial state event, composed by the named POST /human-
// members into ONE transaction; PII enters via a separate PUT
// identities/:id/pii second hop (Phase 10 Task 2's intake
// decomposition — a bad PII sub-object can no longer roll the
// member back). Use only at the Add Member call site;
// transitions of an existing member go through
// postHumanMemberStateChange. The initial event's author is
// stamped server-side from the verified token; the client mints
// the event id, so a retry hits one row.
export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
    initialState: MemberState,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.POST('human-members', {
        id,
        detail: detail as unknown as
            Record<string, unknown>,
        initialState,
        initialStateEventId: generateCryptoSafeBase62(),
        initialStateAt: nowUtc(),
    });
    try {
        await ctx.PUT(`identities/${id}/pii`, {
            name, email, phone, bio,
        });
    } catch (err) {
        throw new HumanMemberPiiIntakeFailedError(id, err);
    }
    humanMemberChanges.notify();
}

// A state change is an honest document write: PUT members/:id
// with a FRESH trio — the postIdeaStateChange composition,
// pointed at the members document address. Save stays
// decomposed (Phase 10 Task 2): detail, PII, and state remain
// independent writes.
export async function postHumanMemberStateChange(
    ctx: RequestContext,
    id: string,
    state: MemberState,
): Promise<void> {
    await ctx.PUT(`members/${id}`, {
        type: 'human',
        state,
        state_at: nowUtc(),
        state_event_id: generateCryptoSafeBase62(),
    });
    humanMemberChanges.notify();
}
