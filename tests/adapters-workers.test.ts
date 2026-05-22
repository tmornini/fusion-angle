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
} from '../web-app/app/adapters/workers.ts';
import type {
    HumanWorkerEntity,
} from '../api/types.ts';

function buildHumanWorker(
    first: string,
): Omit<HumanWorkerEntity, 'id'> {
    return {
        first_name: first,
        last_name: 'Test',
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Product',
        strengths: '[]' as const,
        team_dimensions: '{}' as const,
        phone: '',
        bio: '',
    };
}

async function seedCurrentWorker(
    db: MemoryDbAdapter,
): Promise<void> {
    await db.workers.put(
        'current', buildHumanWorker('demo'),
    );
    await db.states.record(
        'st-current', 'current',
        'active', 'system',
    );
}

function setupDb(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    return { db, ctx };
}

test(
    'postHumanWorkerCreation persists the row'
    + ' and records the initial state event',
    async () => {
        const { db, ctx } = setupDb();
        await seedCurrentWorker(db);

        await postHumanWorkerCreation(
            ctx,
            'w1',
            buildHumanWorker('Alice'),
            'active',
        );

        const row = await db.workers.getById('w1');
        assert.equal(row.first_name, 'Alice');
        const events = await db.states.allFor('w1');
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'postHumanWorkerStateChange records a state'
    + ' event without touching the worker row',
    async () => {
        const { db, ctx } = setupDb();
        await seedCurrentWorker(db);
        await db.workers.put(
            'w1', buildHumanWorker('Original'),
        );
        await db.states.record(
            'st-w1', 'w1', 'active', 'system',
        );
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
