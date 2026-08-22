import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { adminContext } from './context-fixtures.ts';
import { deriveIdentityPii } from
    '../api/derive-identity-spine.ts';
import {
    postHumanMemberCreation,
    featuredHumanMembers,
    type HumanMemberDraft,
} from '../web-app/app/adapters/members.ts';
import type {
    HumanMember,
} from '../web-app/app/presenters/member.ts';
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

test(
    'postHumanMemberCreation persists identity'
    + ' PII and a seat',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);

        await postHumanMemberCreation(
            ctx,
            'xdaJyuuPyHfffCGLhqDrOQ',
            buildHumanMember('Alice'),
            'active',
        );

        // Phase Final Task 2: members/human_members ROW
        // halves stripped — parent via pair-plane GET.
        const row = await ctx.GET<{
            id: string; kind: string; title: string;
        }>('identities/xdaJyuuPyHfffCGLhqDrOQ');
        assert.equal(row.kind, 'person');
        assert.equal(row.title, 'Engineer');
        const pii = await deriveIdentityPii(db, 'xdaJyuuPyHfffCGLhqDrOQ');
        assert.equal(pii.name, 'Alice');
        const seat = await ctx.GET<{
            identity_id: string; type: string;
        }>('organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'xdaJyuuPyHfffCGLhqDrOQ');
        assert.equal(seat.identity_id, 'xdaJyuuPyHfffCGLhqDrOQ');
        assert.equal(seat.type, 'member');
    },
);

test(
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
            }, {
                state: 'active',
                stateAt: '2026-01-01T00:00:00.000000Z',
                stateEventId: 'st-w1',
            },
        );
        const after = await ctx.GET<{
            id: string; title: string;
        }>('identities/xdaJyuuPyHfffCGLhqDrOQ');
        assert.equal(after.title, 'Lead');
    },
);

test('featuredHumanMembers keeps only members with a dept',
() => {
    const mk = (present: boolean) =>
        ({ department: () => present
            ? { present: true, label: 'Eng' }
            : { present: false } }) as
            unknown as HumanMember;
    const result = featuredHumanMembers([
        mk(true), mk(false), mk(true),
    ]);
    assert.equal(result.length, 2);
});

test('featuredHumanMembers caps the list at six', () => {
    const mk = () =>
        ({ department: () =>
            ({ present: true, label: 'Eng' }) }) as
            unknown as HumanMember;
    const ten = Array.from({ length: 10 }, mk);
    assert.equal(featuredHumanMembers(ten).length, 6);
});
