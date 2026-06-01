import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getHumanWorkerMap,
    getCurrentHumanWorker,
} from '../web-app/app/adapters/workers.ts';
import {
    workerName,
} from '../web-app/app/adapters/workers-union.ts';
import {
    type Worker,
    type WorkerId,
} from '../api/types.ts';
import {
    makeHumanWorker,
    seedHumanWorker,
} from './worker-fixtures.ts';

test(
    'workerName returns name for known human id',
    () => {
        const map = new Map<WorkerId, Worker>([
            [
                'u1',
                makeHumanWorker('u1', 'Alice Adams'),
            ],
        ]);
        assert.equal(
            workerName(map, 'u1'),
            'Alice Adams',
        );
    },
);

test('workerName throws for unknown id', () => {
    const map = new Map<WorkerId, Worker>();
    assert.throws(
        () => workerName(map, 'missing'),
        /unknown worker/,
    );
});

test(
    'getHumanWorkerMap fetches workers via adapter',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanWorker(db, 'u1', 'Alice Adams');
        const ctx = createRequestContext(db);
        const map = await getHumanWorkerMap(ctx);
        assert.equal(map.size, 1);
        assert.equal(
            map.get('u1')?.name(),
            'Alice Adams',
        );
    },
);

test('Fresh ctx re-fetches each call', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedHumanWorker(db, 'u1', 'Alice Adams');
    const m1 = await getHumanWorkerMap(
        createRequestContext(db),
    );
    await seedHumanWorker(db, 'u2', 'Bob Brown');
    const m2 = await getHumanWorkerMap(
        createRequestContext(db),
    );
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test(
    'getCurrentHumanWorker returns the identity',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanWorker(
            db, 'current', 'Alice Adams',
        );
        const row = await getCurrentHumanWorker(
            createRequestContext(db),
        );
        assert.equal(row.name, 'Alice Adams');
        assert.equal(row.type, 'human');
    },
);

test(
    'RequestContext requestId is stable'
    + ' and unique',
    () => {
        const db = new MemoryDbAdapter();
        const a = createRequestContext(db);
        const b = createRequestContext(db);
        assert.equal(
            a.requestId, a.requestId,
        );
        assert.notEqual(
            a.requestId, b.requestId,
        );
        assert.ok(a.requestId.length > 0);
    },
);
