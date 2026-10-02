import type {
    MemberId,
    MemberEntity,
    HumanMemberEntity,
    IdentityEntity,
    HumanProfile,
    IdentityPiiEntity,
    MemberPii,
    SeatEntity,
} from '../shared/types.ts';
import {
    HumanMember,
    nowUtc,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { byAtThenIdAscending } from '../shared/identifier.ts';
import { getMemberPii } from './identities.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';

const humanMemberChanges =
    createSubscriptionChannel();

export function subscribeHumanMemberChanges(
    fn: () => void,
): () => void {
    return humanMemberChanges.subscribe(fn);
}

export type HumanMemberDraft =
    Omit<HumanMemberEntity, 'id'>
    & {
        name: string;
        email: string;
        phone: string;
        bio: string;
    };

function sessionOrganization(
    ctx: RequestContext,
): string | undefined {
    return ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
}

function seatsCollection(ctx: RequestContext): string {
    const organization = sessionOrganization(ctx);
    if (organization === undefined) {
        throw new Error(
            'no organization on the session for seats',
        );
    }
    return 'organizations/' + organization + '/members/';
}

function profileOf(
    identity: IdentityEntity,
): HumanProfile {
    if (!('title' in identity)) {
        return { present: false };
    }
    return {
        present: true,
        title: identity.title,
        department: identity.department,
        strengths: identity.strengths,
        team_dimensions: identity.team_dimensions,
    };
}

function seatedHumanParent(
    id: MemberId,
): MemberEntity {
    return { id, type: 'human' };
}

// The roster serves in write order; the members page and
// the palette's featured six read the seats in grant order.
export function buildHumanMemberMap(
    seats: readonly HttpMessage<SeatEntity>[],
): Map<MemberId, HumanMember> {
    const map = new Map<MemberId, HumanMember>();
    const granted = seats.toSorted((a, b) => byAtThenIdAscending(
        a.body().toValue(), b.body().toValue(),
    ));
    for (const seat of granted) {
        const identityId = seat.body().toValue().identity_id;
        map.set(
            identityId,
            new HumanMember(
                seatedHumanParent(identityId),
                { present: false },
                { erased: true },
                seat,
            ),
        );
    }
    return map;
}

export async function getHumanMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, HumanMember>> {
    const map = buildHumanMemberMap(
        await ctx.GETCollection<SeatEntity>(
            seatsCollection(ctx),
        ),
    );
    const filled = await Promise.all(
        [...map.entries()].map(async ([id, member]) => {
            const pii = await getMemberPii(ctx, id);
            return [
                id,
                new HumanMember(
                    seatedHumanParent(id),
                    { present: false },
                    pii,
                    member.membership,
                ),
            ] as const;
        }),
    );
    return new Map(filled);
}

export async function getCurrentHumanMember(
    ctx: RequestContext,
): Promise<{ id: string }> {
    return { id: ctx.identity.id };
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
    const [seat, identity, pii] =
        await Promise.all([
            ctx.GET<SeatEntity>(
                seatsCollection(ctx) + id,
            ),
            ctx.GET<IdentityEntity>(
                `identities/${id}`,
            ).then(read => read.body().toValue()),
            getMemberPii(ctx, id),
        ]);
    return new HumanMember(
        seatedHumanParent(id),
        profileOf(identity),
        pii,
        seat,
    );
}

// The profile with the read it came from, so a save over
// it names the head it replaces.
export async function getHumanMemberProfile(
    ctx: RequestContext,
    id: string,
): Promise<{
    profile: HumanProfile;
    read: HttpMessage<IdentityEntity>;
}> {
    const read = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
    return { profile: profileOf(read.body().toValue()), read };
}

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

// The identity save latches the identity read it was formed
// from; the PII save, when there is one, latches the held
// PII, and goes unlatched when the member had none (a
// singleton's first write).
export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    identity: {
        held: HttpMessage<IdentityEntity>;
        body: Omit<HumanMemberEntity, 'id'>;
    },
    pii?: {
        current: MemberPii;
        body: Omit<IdentityPiiEntity, 'id'>;
    },
): Promise<void> {
    await ctx.PUT(`identities/${id}`, {
        kind: 'person',
        title: identity.body.title,
        department: identity.body.department,
        strengths: identity.body.strengths,
        team_dimensions: identity.body.team_dimensions,
    }, [identity.held]);
    if (pii !== undefined) {
        await ctx.PUT(
            `identities/${id}/pii`,
            { ...pii.body },
            pii.current.erased ? undefined : [pii.current.message],
        );
    }
    humanMemberChanges.notify();
}

export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.PUT(`identities/${id}`, {
        kind: 'person',
        title: detail.title,
        department: detail.department,
        strengths: detail.strengths,
        team_dimensions: detail.team_dimensions,
    });
    try {
        await ctx.PUT(`identities/${id}/pii`, {
            name, email, phone, bio,
        });
    } catch (err) {
        throw new HumanMemberPiiIntakeFailedError(id, err);
    }
    await ctx.PUT(
        seatsCollection(ctx) + id,
        { type: 'member', at: nowUtc() },
    );
    humanMemberChanges.notify();
}

// The seat's own DELETE — the identity survives; only its
// place in this organization goes. The API refuses the last
// admin seat (409); the page mirrors that guard through
// getAdminSeatIds below rather than discovering it here.
// The removal names the seat the member was read through.
export async function deleteHumanMemberSeat(
    ctx: RequestContext,
    member: HumanMember,
): Promise<void> {
    await ctx.DELETE(
        seatsCollection(ctx) + member.idForLink(),
        [member.membership],
    );
    humanMemberChanges.notify();
}

export async function getAdminSeatIds(
    ctx: RequestContext,
): Promise<MemberId[]> {
    const seats = (await ctx.GETCollection<SeatEntity>(
        seatsCollection(ctx),
    )).map((m) => m.body().toValue());
    return seats
        .filter(seat => seat.type === 'admin')
        .map(seat => seat.identity_id);
}
