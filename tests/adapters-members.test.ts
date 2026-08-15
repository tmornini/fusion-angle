import { test } from 'node:test';
import { deriveMemberStates } from
    '../api/derive-states.ts';
import { strict as assert } from 'node:assert';
import { adminContext } from './context-fixtures.ts';
import { deriveIdentityPii } from
    '../api/derive-identity-spine.ts';
import {
    postHumanMemberCreation,
    postHumanMemberStateChange,
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
import type { StateEntity } from '../api/types.ts';

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
    'postHumanMemberCreation persists the row'
    + ' and records the initial state event',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);

        await postHumanMemberCreation(
            ctx,
            'w1',
            buildHumanMember('Alice'),
            'active',
        );

        // Phase Final Task 2: members/human_members ROW
        // halves stripped — parent via pair-plane GET.
        const row = await ctx.GET<{ id: string; type: string }>(
            'members/w1',
        );
        assert.equal(row.type, 'human');
        // Phase Final Task 2: identity_pii ROW half stripped.
        const pii = await deriveIdentityPii(db, 'w1');
        assert.equal(pii.name, 'Alice');
        // Phase Final Stage B: identity spine tables retired.
        const events = (await deriveMemberStates(db))
            .filter((e) => e.entity_id === 'w1');
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
        // Phase Final Stage B: roster tables retired.
    },
);

test(
    'postHumanMemberStateChange records a state'
    + ' change via PUT members/:id',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);
        await seedHumanMember(db, 'w1', 'Original Name');
        // Phase Final Task 2: parent via pair-plane GET.
        const before = await ctx.GET<{
            id: string; type: string;
        }>('members/w1');
        assert.equal(before.type, 'human');

        await postHumanMemberStateChange(
            ctx, 'w1', 'archived',
        );

        const after = await ctx.GET<{
            id: string; type: string;
        }>('members/w1');
        // Type is a server-supplied fact; only the
        // lifecycle trio on the members/:id document moves.
        assert.equal(after.type, 'human');
        assert.equal(after.id, before.id);
        // Archive rides PUT members/:id with a fresh
        // trio — pin history via the live derived path.
        const events = await ctx.GET<StateEntity[]>(
            'members/w1/versions',
        );
        assert.equal(events.length, 2);
        // Family history is DESC — index 0 is current.
        assert.equal(
            events[0]?.state, 'archived',
        );
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
