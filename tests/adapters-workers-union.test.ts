// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getWorkers,
    getWorkerMap,
    workerName,
    isHumanWorker,
    isAIWorker,
} from '../web-app/app/adapters/workers-union.ts';
import type {
    WorkerId,
    Worker,
} from '../api/types.ts';
import {
    seedHumanWorker,
    seedAIWorker,
} from './worker-fixtures.ts';

async function setupSeeded(): Promise<{
    db: MemoryDbAdapter;
}> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedHumanWorker(
        db, 'hw_sarah_chen', 'Sarah Test',
    );
    await seedAIWorker(
        db, 'ai_claude_opus', 'Claude Opus',
    );
    return { db };
}

test(
    'getWorkers omits system; getWorkerMap'
    + ' resolves it as an author',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanWorker(
            db, 'hw_sarah', 'Sarah Chen',
        );
        await db.workers.put('system', {
            type: 'system',
            name: 'System Worker',
        });
        await db.states.record(
            'st-system', 'system',
            'active', 'system',
        );
        const ctx = createRequestContext(db);
        const roster = await getWorkers(ctx);
        assert.ok(
            !roster.some(
                w => w.idForLink() === 'system',
            ),
            'roster excludes the system worker',
        );
        const map = await getWorkerMap(ctx);
        assert.equal(
            workerName(map, 'system'),
            'System Worker',
        );
    },
);

test(
    'getWorkers returns humans and AIs unioned'
    + ' with correct kind discriminator',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db);
        const workers = await getWorkers(ctx);
        assert.equal(workers.length, 2);
        const human = workers.find(isHumanWorker)!;
        const ai = workers.find(isAIWorker)!;
        assert.ok(human);
        assert.ok(ai);
        assert.equal(human.kind, 'human');
        assert.equal(ai.kind, 'ai');
        assert.equal(
            human.idForLink(), 'hw_sarah_chen',
        );
        assert.equal(
            ai.idForLink(), 'ai_claude_opus',
        );
    },
);

test(
    'getWorkerMap keys by id with both kinds'
    + ' present',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db);
        const map = await getWorkerMap(ctx);
        assert.equal(map.size, 2);
        const human = map.get('hw_sarah_chen')!;
        const ai = map.get('ai_claude_opus')!;
        assert.ok(human);
        assert.ok(ai);
        assert.equal(human.kind, 'human');
        assert.equal(ai.kind, 'ai');
    },
);

test(
    'workerName returns the display name for'
    + ' both human and AI kinds',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db);
        const map = await getWorkerMap(ctx);
        assert.equal(
            workerName(map, 'hw_sarah_chen'),
            'Sarah Test',
        );
        assert.equal(
            workerName(map, 'ai_claude_opus'),
            'Claude Opus',
        );
    },
);

test(
    'worker.name() is polymorphic across human'
    + ' and AI kinds',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db);
        const map = await getWorkerMap(ctx);
        const human = map.get('hw_sarah_chen')!;
        const ai = map.get('ai_claude_opus')!;
        assert.equal(human.name(), 'Sarah Test');
        assert.equal(ai.name(), 'Claude Opus');
    },
);

test(
    'workerName throws on missing id (matches'
    + ' personName contract)',
    async () => {
        const map = new Map<WorkerId, Worker>();
        assert.throws(
            () => workerName(map, 'hw_missing'),
            /unknown worker/,
        );
    },
);

test(
    'getWorkers on an empty database returns'
    + ' an empty array',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        const ctx = createRequestContext(db);
        const workers = await getWorkers(ctx);
        assert.deepEqual(workers, []);
    },
);
