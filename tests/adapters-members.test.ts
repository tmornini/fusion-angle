import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
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
import { seedRootAdmin } from './root-admin-fixture.ts';

function buildHumanMember(
    name: string,
): HumanMemberDraft {
    return {
        name,
        email:
            `${name}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Product',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        phone: '',
        bio: '',
    };
}

async function setupDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

test(
    'postHumanMemberCreation persists the row'
    + ' and records the initial state event',
    async () => {
        const { db, ctx } = await setupDb();
        await seedCurrentMember(db);

        await postHumanMemberCreation(
            ctx,
            'w1',
            buildHumanMember('Alice'),
            'active',
        );

        const row = await db.members.getById('w1');
        assert.equal(row.type, 'human');
        const pii =
            await db.identityPii.getById('w1');
        assert.equal(pii.name, 'Alice');
        const events = await db.states.allFor('w1');
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'postHumanMemberStateChange records a state'
    + ' event without touching the member row',
    async () => {
        const { db, ctx } = await setupDb();
        await seedCurrentMember(db);
        await seedHumanMember(db, 'w1', 'Original Name');
        const before = await db.members.getById('w1');

        await postHumanMemberStateChange(
            ctx, 'w1', 'archived',
        );

        const after = await db.members.getById('w1');
        assert.deepEqual(after, before);
        const events = await db.states.allFor('w1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);

test('featuredHumanMembers keeps only members with a dept',
() => {
    const mk = (dept: boolean) =>
        ({ hasDepartment: () => dept }) as
            unknown as HumanMember;
    const result = featuredHumanMembers([
        mk(true), mk(false), mk(true),
    ]);
    assert.equal(result.length, 2);
});

test('featuredHumanMembers caps the list at six', () => {
    const mk = () =>
        ({ hasDepartment: () => true }) as
            unknown as HumanMember;
    const ten = Array.from({ length: 10 }, mk);
    assert.equal(featuredHumanMembers(ten).length, 6);
});
