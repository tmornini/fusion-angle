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
    postHumanWorkerCreation,
    postHumanWorkerStateChange,
    type HumanWorkerDraft,
} from '../web-app/app/adapters/workers.ts';
import {
    seedCurrentWorker,
    seedHumanWorker,
} from './worker-fixtures.ts';

function buildHumanWorker(
    name: string,
): HumanWorkerDraft {
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
    const ctx = createRequestContext(db);
    return { db, ctx };
}

test(
    'postHumanWorkerCreation persists the row'
    + ' and records the initial state event',
    async () => {
        const { db, ctx } = await setupDb();
        await seedCurrentWorker(db);

        await postHumanWorkerCreation(
            ctx,
            'w1',
            buildHumanWorker('Alice'),
            'active',
        );

        const row = await db.workers.getById('w1');
        assert.equal(row.name, 'Alice');
        assert.equal(row.type, 'human');
        const events = await db.states.allFor('w1');
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'postHumanWorkerStateChange records a state'
    + ' event without touching the worker row',
    async () => {
        const { db, ctx } = await setupDb();
        await seedCurrentWorker(db);
        await seedHumanWorker(db, 'w1', 'Original Name');
        const before = await db.workers.getById('w1');

        await postHumanWorkerStateChange(
            ctx, 'w1', 'archived',
        );

        const after = await db.workers.getById('w1');
        assert.deepEqual(after, before);
        const events = await db.states.allFor('w1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);
