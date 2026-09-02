import { assertEquals, assertStrictEquals } from '@std/assert';
import { adminContext } from './context-fixtures.ts';
import { deriveIdentityPii } from
    '../api/derive-identity-spine.ts';
import {
    postHumanMemberCreation,
    featuredHumanMembers,
    getHumanMemberProfile,
    type HumanMember,
    type HumanMemberDraft,
} from '../web-app/app/adapters/members.ts';
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
        const row = await ctx.GET<{
            id: string; kind: string; title: string;
        }>('identities/xdaJyuuPyHfffCGLhqDrOQ');
        assertStrictEquals(row.kind, 'person');
        assertStrictEquals(row.title, 'Engineer');
        const pii = await deriveIdentityPii(db, 'xdaJyuuPyHfffCGLhqDrOQ');
        assertStrictEquals(pii.name, 'Alice');
        const seat = await ctx.GET<{
            identity_id: string; type: string;
        }>('organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'xdaJyuuPyHfffCGLhqDrOQ');
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
        const { putHumanMember } = await import(
            '../web-app/app/adapters/members.ts'
        );
        await putHumanMember(
            ctx, 'xdaJyuuPyHfffCGLhqDrOQ', {
                title: 'Lead',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
        );
        const after = await ctx.GET<{
            id: string; title: string;
        }>('identities/xdaJyuuPyHfffCGLhqDrOQ');
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
        await getHumanMemberProfile(ctx, id),
        { present: false },
    );
});

Deno.test('a full identity document reads 1:1', async () => {
    const { db, ctx } = await adminContext();
    const id = generateIdentifier();
    await seedHumanMember(db, id, 'Whole Profile');
    assertEquals(
        await getHumanMemberProfile(ctx, id),
        {
            present: true,
            title: 'product_manager',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
        },
    );
});
