// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postActivity,
    isActivityType,
} from '../web-app/app/adapters/activities.ts';
import type {
    ActivityEntity,
    ActivityActorEntity,
} from '../api/types.ts';

function buildCurrentPerson() {
    return {
        first_name: 'Demo',
        last_name: 'User',
        email: 'demo@example.com',
        phone: '',
        title: 'product_manager' as const,
        status: 'active' as const,
        strengths: '[]' as const,
        team_dimensions: '{}' as const,
        bio: '',
        department: 'Product',
    };
}

function setup(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    return { db, ctx: createRequestContext(db) };
}

async function withCurrentPerson(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const { db, ctx } = setup();
    await db.people.put(
        'current', buildCurrentPerson(),
    );
    return { db, ctx };
}

const sampleInput = {
    type: 'idea_created' as const,
    action: 'created',
    target: 'an idea',
    status: 'open',
    feedback: '',
};

test('postActivity creates one activity row', async () => {
    const { db, ctx } = await withCurrentPerson();
    await postActivity(ctx, sampleInput);
    const rows: ActivityEntity[] =
        await db.activities.getAll();
    assert.equal(rows.length, 1);
});

test('postActivity persists the input fields', async () => {
    const { db, ctx } = await withCurrentPerson();
    await postActivity(ctx, sampleInput);
    const [row] = await db.activities.getAll();
    assert.equal(row?.type, 'idea_created');
    assert.equal(row?.action, 'created');
    assert.equal(row?.target, 'an idea');
    assert.equal(row?.status, 'open');
    assert.equal(row?.feedback, '');
});

test('postActivity stamps a timestamp', async () => {
    const { db, ctx } = await withCurrentPerson();
    await postActivity(ctx, sampleInput);
    const [row] = await db.activities.getAll();
    assert.ok(
        row && row.timestamp.length > 0,
        'timestamp should be populated',
    );
    assert.ok(
        !Number.isNaN(
            Date.parse(row!.timestamp),
        ),
        'timestamp should parse as a date',
    );
});

test(
    'postActivity creates an actor row for the'
    + ' current person',
    async () => {
        const { db, ctx } =
            await withCurrentPerson();
        await postActivity(ctx, sampleInput);
        const actors: ActivityActorEntity[] =
            await db.activityActors.getAll();
        assert.equal(actors.length, 1);
        assert.equal(actors[0]?.person_id, 'current');
    },
);

test(
    'postActivity links the actor to the activity',
    async () => {
        const { db, ctx } =
            await withCurrentPerson();
        await postActivity(ctx, sampleInput);
        const [activity] =
            await db.activities.getAll();
        const [actor] =
            await db.activityActors.getAll();
        assert.ok(activity && actor);
        assert.equal(
            actor!.activity_id, activity!.id,
        );
    },
);

test(
    'postActivity actor row carries a created_at',
    async () => {
        const { db, ctx } =
            await withCurrentPerson();
        await postActivity(ctx, sampleInput);
        const [actor] =
            await db.activityActors.getAll();
        assert.ok(
            actor && actor.created_at.length > 0,
        );
    },
);

test(
    'two postActivity calls create two activity'
    + ' rows with distinct ids',
    async () => {
        const { db, ctx } =
            await withCurrentPerson();
        await postActivity(ctx, sampleInput);
        await postActivity(ctx, {
            ...sampleInput,
            type: 'status_changed',
            action: 'changed status',
        });
        const rows = await db.activities.getAll();
        assert.equal(rows.length, 2);
        assert.notEqual(
            rows[0]?.id, rows[1]?.id,
        );
    },
);

test(
    'postActivity persisted rows are visible via'
    + ' a fresh request context',
    async () => {
        const { db, ctx } =
            await withCurrentPerson();
        await postActivity(ctx, sampleInput);
        const fresh = createRequestContext(db);
        const rows =
            await fresh.GET<ActivityEntity[]>(
                'activities',
            );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.target, 'an idea');
    },
);

test(
    'postActivity throws when no current person'
    + ' exists',
    async () => {
        const { ctx } = setup();
        await assert.rejects(
            () => postActivity(ctx, sampleInput),
        );
    },
);

test('empty database reports no activities', async () => {
    const { db } = setup();
    const rows = await db.activities.getAll();
    assert.equal(rows.length, 0);
});

test('isActivityType narrows known activity types', () => {
    assert.equal(isActivityType('idea_created'), true);
    assert.equal(isActivityType('project_created'), true);
    assert.equal(isActivityType('bogus'), false);
});
