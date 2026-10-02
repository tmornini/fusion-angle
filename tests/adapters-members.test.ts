import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { adminContext } from './context-fixtures.ts';
import { recordedContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import { responseMessage } from './fixtures/response-message.ts';
import { deriveIdentityPii } from
    '../api/derive-identity-spine.ts';
import {
    buildHumanMemberMap,
    featuredHumanMembers,
    getAdminSeatIds,
    getHumanMember,
    getHumanMemberProfile,
    postHumanMemberCreation,
    postMembershipRemoval,
    putHumanMember,
    type HumanMemberDraft,
} from '../client/members.ts';
import {
    type HumanMember,
    type MembershipEntity,
    type SeatEntity,
} from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import {
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';

function buildHumanMember(
    name: string,
): HumanMemberDraft {
    return {
        name,
        email:
            `${name}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Product',
        strengths: [],
        team_dimensions: {},
        phone: '',
        bio: '',
    };
}

const ALICE = 'xdaJyuuPyHfffCGLhqDrOQ';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';

function membershipResource(identityId: string): string {
    return 'organizations/' + STARK + '/invitations/'
        + membershipNameOf(STARK, identityId);
}

Deno.test(
    'postHumanMemberCreation persists identity'
    + ' PII and an accepted membership',
    async () => {
        const { db } = await adminContext();
        await seedCurrentMember(db);
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );

        await postHumanMemberCreation(
            ctx, ALICE, buildHumanMember('Alice'),
        );

        // Phase Final Task 2: members/human_members ROW
        // halves stripped — parent via message-plane GET.
        const row = (await ctx.GET<{
            id: string; kind: string; title: string;
        }>('identities/' + ALICE)).body().toValue();
        assertStrictEquals(row.kind, 'person');
        assertStrictEquals(row.title, 'Engineer');
        const pii = await deriveIdentityPii(db, ALICE);
        assertStrictEquals(pii.name, 'Alice');
        const seat = (await ctx.GET<{
            identity_id: string; type: string;
        }>(
            'organizations/' + STARK + '/members/' + ALICE,
        )).body().toValue();
        assertStrictEquals(seat.identity_id, ALICE);
        assertStrictEquals(seat.type, 'member');
        const membership = (await ctx.GET<MembershipEntity>(
            membershipResource(ALICE),
        )).body().toValue();
        assertStrictEquals(membership.state, 'accepted');
        assertStrictEquals(membership.type, 'member');
        const wrote = sent.filter((request) =>
            request.method === 'PUT'
            && request.path === '/api/'
                + membershipResource(ALICE)
        );
        assertStrictEquals(wrote.length, 1);
        assertStrictEquals(wrote[0]!.ifNoneMatch, '*');
        assertEquals(JSON.parse(wrote[0]!.body ?? 'null'), {
            state: 'accepted',
            type: 'member',
            at: membership.at,
        });
    },
);

Deno.test(
    'postHumanMemberCreation run twice leaves one'
    + ' accepted membership',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);
        const draft = buildHumanMember('Alice');
        await postHumanMemberCreation(ctx, ALICE, draft);
        await postHumanMemberCreation(ctx, ALICE, draft);
        const accepted = await ctx.GETCollection<
            MembershipEntity
        >(
            'organizations/' + STARK
                + '/invitations/?state=accepted',
        );
        const mine = accepted.filter((part) =>
            part.body().toValue().identity_id === ALICE
        );
        assertStrictEquals(mine.length, 1);
        assertStrictEquals(
            mine[0]!.body().toValue().state, 'accepted',
        );
        assertStrictEquals(
            mine[0]!.body().toValue().type, 'member',
        );
    },
);

Deno.test(
    'postHumanMemberCreation accepts a removed'
    + ' membership, latched on its head',
    async () => {
        const { db } = await adminContext();
        await seedCurrentMember(db);
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        const id = generateIdentifier();
        const draft = buildHumanMember('Returning');
        await postHumanMemberCreation(ctx, id, draft);
        const member = await getHumanMember(ctx, id);
        assert(member !== null);
        await postMembershipRemoval(ctx, member);
        const removed = await ctx.GET<MembershipEntity>(
            membershipResource(id),
        );
        assertStrictEquals(
            removed.body().toValue().state, 'removed',
        );
        const tag = removed.query('header.etag').toText();
        sent.length = 0;
        await postHumanMemberCreation(ctx, id, draft);
        const path = '/api/' + membershipResource(id);
        assertEquals(
            sent.filter((request) => request.path === path)
                .map((request) => [
                    request.method,
                    request.ifMatch,
                    request.ifNoneMatch,
                ]),
            [
                ['PUT', null, '*'],
                ['GET', null, null],
                ['PUT', tag, null],
            ],
        );
        const after = await ctx.GET<MembershipEntity>(
            membershipResource(id),
        );
        assertStrictEquals(
            after.body().toValue().state, 'accepted',
        );
        assertStrictEquals(
            after.body().toValue().type, 'member',
        );
    },
);

Deno.test(
    'putHumanMember updates the identity profile',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);
        await seedHumanMember(db, 'xdaJyuuPyHfffCGLhqDrOQ', 'Original Name');
        const { read } = await getHumanMemberProfile(
            ctx, 'xdaJyuuPyHfffCGLhqDrOQ',
        );
        await putHumanMember(
            ctx, 'xdaJyuuPyHfffCGLhqDrOQ', {
                held: read,
                body: {
                    title: 'Lead',
                    department: 'Product',
                    strengths: [],
                    team_dimensions: {},
                },
            },
        );
        const after = (await ctx.GET<{
            id: string; title: string;
        }>('identities/xdaJyuuPyHfffCGLhqDrOQ')).body().toValue();
        assertStrictEquals(after.title, 'Lead');
    },
);

Deno.test('featuredHumanMembers keeps only members with a dept',
() => {
    const mk = (present: boolean) =>
        ({ department: () => present
            ? { present: true, label: 'Eng' }
            : { present: false } }) as
            unknown as HumanMember;
    const result = featuredHumanMembers([
        mk(true), mk(false), mk(true),
    ]);
    assertStrictEquals(result.length, 2);
});

Deno.test('featuredHumanMembers caps the list at six', () => {
    const mk = () =>
        ({ department: () =>
            ({ present: true, label: 'Eng' }) }) as
            unknown as HumanMember;
    const ten = Array.from({ length: 10 }, mk);
    assertStrictEquals(featuredHumanMembers(ten).length, 6);
});

Deno.test('a { kind } identity reads as an absent profile',
async () => {
    const { ctx } = await adminContext();
    const id = generateIdentifier();
    await ctx.PUT('identities/' + id, { kind: 'person' });
    assertEquals(
        (await getHumanMemberProfile(ctx, id)).profile,
        { present: false },
    );
});

Deno.test('a full identity document reads 1:1', async () => {
    const { db, ctx } = await adminContext();
    const id = generateIdentifier();
    await seedHumanMember(db, id, 'Whole Profile');
    assertEquals(
        (await getHumanMemberProfile(ctx, id)).profile,
        {
            present: true,
            title: 'product_manager',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
        },
    );
});

Deno.test(
    'postMembershipRemoval removes the membership',
    async () => {
        const { db, ctx } = await adminContext();
        const id = generateIdentifier();
        await seedHumanMember(db, id, 'Leaving Member');
        const member = await getHumanMember(ctx, id);
        assert(member !== null);
        await postMembershipRemoval(ctx, member);
        const read = await ctx.GET<MembershipEntity>(
            membershipResource(id),
        );
        assertStrictEquals(
            read.body().toValue().state, 'removed',
        );
    },
);

Deno.test(
    'a membership removal latches the held membership',
    async () => {
        const { db } = await adminContext();
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        const id = generateIdentifier();
        await seedHumanMember(db, id, 'Leaving Member');
        const member = await getHumanMember(ctx, id);
        assert(member !== null);
        sent.length = 0;
        await postMembershipRemoval(ctx, member);
        assertEquals(
            sent.map((r) => [r.method, r.ifMatch]), [
                [
                    'PUT',
                    member.membership.query('header.etag')
                        .toText(),
                ],
            ],
        );
    },
);

const MEMBER_DETAIL = {
    title: 'Lead',
    department: 'Product',
    strengths: [],
    team_dimensions: {},
};

const MEMBER_PII = {
    name: 'Saved Member',
    email: 'saved@example.com',
    phone: '',
    bio: '',
};

Deno.test('a member save latches its identity read and its'
    + ' held PII', async () => {
    const { db } = await adminContext();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    const id = generateIdentifier();
    await seedHumanMember(db, id, 'Original Name');
    const member = await getHumanMember(ctx, id);
    assert(member !== null);
    const pii = member.pii();
    assert(!pii.erased);
    const { read } = await getHumanMemberProfile(ctx, id);
    sent.length = 0;
    await putHumanMember(
        ctx, id,
        { held: read, body: MEMBER_DETAIL },
        { current: pii, body: MEMBER_PII },
    );
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['PUT', read.query('header.etag').toText()],
        ['PUT', pii.message.query('header.etag').toText()],
    ]);
});

Deno.test('a member save over absent PII sends no PII latch',
async () => {
    const { db } = await adminContext();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    const id = generateIdentifier();
    await ctx.PUT('identities/' + id, { kind: 'person' });
    const { read } = await getHumanMemberProfile(ctx, id);
    sent.length = 0;
    await putHumanMember(
        ctx, id,
        { held: read, body: MEMBER_DETAIL },
        { current: { erased: true }, body: MEMBER_PII },
    );
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['PUT', read.query('header.etag').toText()],
        ['PUT', null],
    ]);
});

Deno.test('getAdminSeatIds lists the admin seats only',
async () => {
    const { db, ctx } = await adminContext();
    const member = generateIdentifier();
    await seedHumanMember(db, member, 'Plain Member');
    assertEquals(
        await getAdminSeatIds(ctx),
        ['XXZruirZyAOoRpNxaDnpSA'],
    );
});

Deno.test('buildHumanMemberMap takes the seats in grant order',
() => {
    const later = generateIdentifier();
    const earlier = generateIdentifier();
    const organization = 'AjdvjuECVZEgZoFajaIEkg';
    const membership = (identity: string, at: string) =>
        responseMessage<MembershipEntity>({
            id: membershipNameOf(organization, identity),
            organization_id: organization,
            identity_id: identity,
            type: 'member',
            state: 'accepted',
            at,
        });
    const map = buildHumanMemberMap([
        membership(later, '2026-01-02T00:00:00.000000Z'),
        membership(earlier, '2026-01-01T00:00:00.000000Z'),
    ]);
    assertEquals([...map.keys()], [earlier, later]);
});

Deno.test(
    'getHumanMember reads a removed member as absent',
    async () => {
        const { db, ctx } = await adminContext();
        const id = generateIdentifier();
        await seedHumanMember(db, id, 'Leaving Member');
        const seatPath = 'organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/members/' + id;
        const seat = await ctx.GET<SeatEntity>(seatPath);
        await ctx.DELETE(seatPath, [seat]);
        assertStrictEquals(
            await getHumanMember(ctx, id), null,
        );
    },
);
