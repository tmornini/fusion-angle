import { test } from 'node:test';
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

        const parent = await db.members.getById('ai1');
        assert.equal(parent.type, 'ai');
        const detail = await getAIMemberEntity(ctx, 'ai1');
        assert.equal(detail.name, 'Claude');
        const events = await db.states.getAllFor('ai1');
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(events[0]?.member_id, 'current');
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
        const parent = await db.members.getById('ai1');
        assert.equal(parent.type, 'ai');
        // The edit wrote no event — the seeded one holds.
        const events = await db.states.getAllFor('ai1');
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
        const before =
            await db.aiMembers.getById('ai1');
        const ctx = createRequestContext(db, await devToken());

        await postAIMemberStateChange(
            ctx, 'ai1', 'archived',
        );

        const after =
            await db.aiMembers.getById('ai1');
        assert.deepEqual(after, before);
        const events = await db.states.getAllFor('ai1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);
