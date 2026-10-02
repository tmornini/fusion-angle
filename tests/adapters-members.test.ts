import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { adminContext } from './context-fixtures.ts';
import { recordedContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import { responseMessage } from './fixtures/response-message.ts';
import { deriveIdentityPii } from
    '../api/derive-identity-spine.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import {
    HTTP_GONE,
    RequestError,
} from '../shared/http-errors.ts';
import {
    buildHumanMemberMap,
    deleteHumanMemberSeat,
    featuredHumanMembers,
    getAdminSeatIds,
    getHumanMember,
    getHumanMemberProfile,
    postHumanMemberCreation,
    putHumanMember,
    type HumanMemberDraft,
} from '../client/members.ts';
import {
    type HumanMember,
    type SeatEntity,
} from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
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

Deno.test(
    'postHumanMemberCreation persists identity'
    + ' PII and a seat',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);

        await postHumanMemberCreation(
            ctx,
            'xdaJyuuPyHfffCGLhqDrOQ',
            buildHumanMember('Alice'),
        );

        // Phase Final Task 2: members/human_members ROW
        // halves stripped — parent via message-plane GET.
        const row = (await ctx.GET<{
            id: string; kind: string; title: string;
        }>('identities/xdaJyuuPyHfffCGLhqDrOQ')).body().toValue();
        assertStrictEquals(row.kind, 'person');
        assertStrictEquals(row.title, 'Engineer');
        const pii = await deriveIdentityPii(db, 'xdaJyuuPyHfffCGLhqDrOQ');
        assertStrictEquals(pii.name, 'Alice');
        const seat = (await ctx.GET<{
            identity_id: string; type: string;
        }>('organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'xdaJyuuPyHfffCGLhqDrOQ')).body().toValue();
        assertStrictEquals(seat.identity_id, 'xdaJyuuPyHfffCGLhqDrOQ');
        assertStrictEquals(seat.type, 'member');
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

Deno.test('deleteHumanMemberSeat removes the seat', async () => {
    const { db, ctx } = await adminContext();
    const id = generateIdentifier();
    await seedHumanMember(db, id, 'Leaving Member');
    await deleteHumanMemberSeat(ctx, await getHumanMember(ctx, id));
    const err = await assertRejects(
        () => ctx.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg/members/' + id,
        ),
    ) as Error;
    assert(err instanceof RequestError);
    assertStrictEquals(err.status, HTTP_GONE);
    assertEquals(await deriveMembershipsForIdentity(db, id), []);
});

Deno.test('a seat removal latches the held seat', async () => {
    const { db } = await adminContext();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    const id = generateIdentifier();
    await seedHumanMember(db, id, 'Leaving Member');
    const member = await getHumanMember(ctx, id);
    sent.length = 0;
    await deleteHumanMemberSeat(ctx, member);
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['DELETE', member.membership.query('header.etag').toText()],
    ]);
});

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
    const seat = (identity: string, at: string) =>
        responseMessage<SeatEntity>({
            id: generateIdentifier(),
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: identity, type: 'member', at,
        });
    const map = buildHumanMemberMap([
        seat(later, '2026-01-02T00:00:00.000000Z'),
        seat(earlier, '2026-01-01T00:00:00.000000Z'),
    ]);
    assertEquals([...map.keys()], [earlier, later]);
});
