import { test } from 'node:test';
import { deriveMemberStates } from
    '../api/derive-states.ts';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postAIMemberCreation,
    putAIMember,
    getAIMemberEntity,
    postAIMemberStateChange,
} from '../web-app/app/adapters/ai-members.ts';
import {
    seedHumanMember,
    seedAIMember,
    firstProviderModel,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import type { StateEntity } from '../api/types.ts';

function aiDraft(name: string) {
    return {
        name,
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

// Seeded AI members pin this trio (member-fixtures
// seedAIMember) — putAIMember echoes it byte-identically
// so a plain edit folds by message_hash.
const SEEDED_AI_TRIO = {
    state: 'active' as const,
    stateAt: '2026-01-01T00:00:00.000000Z',
    stateEventId: 'st-ai1',
};

test(
    'postAIMemberCreation lands the parent, detail and'
    + ' initial active event in one operation',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());

        await postAIMemberCreation(
            ctx, 'ai1', aiDraft('Claude'),
        );

        // Phase Final Task 2: members/ai_members ROW halves
        // stripped — parent + detail via pair-plane GET.
        const parent = await ctx.GET<{ id: string; type: string }>(
            'members/ai1',
        );
        assert.equal(parent.type, 'ai');
        const detail = await getAIMemberEntity(ctx, 'ai1');
        assert.equal(detail.name, 'Claude');
        const events = (await deriveMemberStates(db))
            .filter((e) => e.entity_id === 'ai1');
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(events[0]?.member_id, 'current');
        // Phase Final Stage B: roster tables retired.
        // Phase Final Stage B: roster tables retired.
    },
);

test(
    'putAIMember re-puts the facets with an echoed'
    + ' trio and without a new state event',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        await seedAIMember(db, 'ai1', 'Claude');
        const ctx = createRequestContext(db, await devToken());

        await putAIMember(
            ctx, 'ai1',
            { ...aiDraft('Renamed'), skill_focus: 'qa' },
            SEEDED_AI_TRIO,
        );

        const detail = await getAIMemberEntity(ctx, 'ai1');
        assert.equal(detail.name, 'Renamed');
        assert.equal(detail.skill_focus, 'qa');
        // Phase Final Task 2: parent via pair-plane GET.
        const parent = await ctx.GET<{ id: string; type: string }>(
            'members/ai1',
        );
        assert.equal(parent.type, 'ai');
        // The edit echoed the trio — the seeded event holds.
        const events = (await deriveMemberStates(db))
            .filter((e) => e.entity_id === 'ai1');
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'postAIMemberStateChange records a state'
    + ' change via PUT members/:id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        await seedAIMember(db, 'ai1', 'Claude');
        const ctx = createRequestContext(db, await devToken());
        const before = await getAIMemberEntity(ctx, 'ai1');

        await postAIMemberStateChange(
            ctx, 'ai1', 'archived',
        );

        // Detail facet is untouched; only the members/:id
        // document trio moves.
        const after = await getAIMemberEntity(ctx, 'ai1');
        assert.deepEqual(after, before);
        // Archive rides PUT members/:id with a fresh trio —
        // pin history via the live derived path.
        const events = await ctx.GET<StateEntity[]>(
            'members/ai1/versions',
        );
        assert.equal(events.length, 2);
        // Family history is DESC — index 0 is current.
        assert.equal(
            events[0]?.state, 'archived',
        );
    },
);
