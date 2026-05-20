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
    HumanWorkerEntity,
    AIWorkerEntity,
    WorkerId,
    Worker,
} from '../api/types.ts';

function buildHumanWorkerEntity(
    id: WorkerId,
    first: string,
): Omit<HumanWorkerEntity, 'id'> & { id: WorkerId } {
    return {
        id,
        first_name: first,
        last_name: 'Test',
        email: first.toLowerCase() + '@example.com',
        title: 'Engineer',
        department: 'Eng',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        phone: '',
        bio: '',
    };
}

function buildAIWorkerEntity(
    id: WorkerId,
    name: string,
): Omit<AIWorkerEntity, 'id'> & { id: WorkerId } {
    return {
        id,
        name,
        provider: 'Anthropic',
        description: '',
        auth_token: 'sk-test-XXXX',
    };
}

async function seedWorkerState(
    db: MemoryDbAdapter,
    workerId: WorkerId,
    state: string = 'active',
): Promise<void> {
    await db.states.record(
        `st-${workerId}`,
        workerId,
        state,
        'system',
    );
}

async function setupSeeded(): Promise<{
    db: MemoryDbAdapter;
}> {
    const db = new MemoryDbAdapter();
    const sarah = buildHumanWorkerEntity(
        'hw_sarah_chen', 'Sarah',
    );
    const opus = buildAIWorkerEntity(
        'ai_claude_opus', 'Claude Opus',
    );
    const { id: _h, ...sarahBody } = sarah;
    const { id: _a, ...opusBody } = opus;
    await db.workers.put('hw_sarah_chen', sarahBody);
    await db.aiWorkers.put('ai_claude_opus', opusBody);
    await seedWorkerState(db, 'hw_sarah_chen');
    await seedWorkerState(db, 'ai_claude_opus');
    return { db };
}

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
    'workerName returns fullName for humans and'
    + ' nameText for AIs',
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
        const ctx = createRequestContext(db);
        const workers = await getWorkers(ctx);
        assert.deepEqual(workers, []);
    },
);
