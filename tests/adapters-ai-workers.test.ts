import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postAIWorkerStateChange,
} from '../web-app/app/adapters/ai-workers.ts';
import {
    seedHumanWorker,
    seedAIWorker,
} from './worker-fixtures.ts';

test(
    'postAIWorkerStateChange records a state event'
    + ' without touching the AI worker row',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanWorker(db, 'current', 'Demo User');
        await seedAIWorker(db, 'ai1', 'Claude');
        const before =
            await db.aiWorkers.getById('ai1');
        const ctx = createRequestContext(db);

        await postAIWorkerStateChange(
            ctx, 'ai1', 'archived',
        );

        const after =
            await db.aiWorkers.getById('ai1');
        assert.deepEqual(after, before);
        const events = await db.states.allFor('ai1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);
