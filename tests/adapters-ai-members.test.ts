import { test } from 'node:test';
import { deriveStatesFor } from
    '../api/derive-states.ts';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
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

test(
    'postAIMemberCreation lands the parent, detail and'
    + ' initial active event in one operation',
    async () => {
        const db = new MemoryDbAdapter();
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
        const events = await deriveStatesFor(db, '1', 'ai1');
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
    'putAIMember re-puts the facets without a new'
    + ' state event',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        await seedAIMember(db, 'ai1', 'Claude');
        const ctx = createRequestContext(db, await devToken());

        await putAIMember(
            ctx, 'ai1',
            { ...aiDraft('Renamed'), skill_focus: 'qa' },
        );

        const detail = await getAIMemberEntity(ctx, 'ai1');
        assert.equal(detail.name, 'Renamed');
        assert.equal(detail.skill_focus, 'qa');
        // Phase Final Task 2: parent via pair-plane GET.
        const parent = await ctx.GET<{ id: string; type: string }>(
            'members/ai1',
        );
        assert.equal(parent.type, 'ai');
        // The edit wrote no event — the seeded one holds.
        const events = await deriveStatesFor(db, '1', 'ai1');
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'postAIMemberStateChange records a state event'
    + ' without touching the AI member row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        await seedAIMember(db, 'ai1', 'Claude');
        const ctx = createRequestContext(db, await devToken());
        const before = await getAIMemberEntity(ctx, 'ai1');

        await postAIMemberStateChange(
            ctx, 'ai1', 'archived',
        );

        // Phase Final Task 2: detail row half stripped —
        // pair-plane GET is the entity oracle.
        const after = await getAIMemberEntity(ctx, 'ai1');
        assert.deepEqual(after, before);
        // Phase Final Task 1(b): archive rides pair-plane-only
        // PUT /states/:id — pin history via the live derived
        // path, never the retired row half.
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/ai1/history',
        );
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);
