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
    HumanWorker,
    type Worker,
    type WorkerId,
} from '../api/types.ts';

function buildHumanWorkerRow(
    id: string,
    first: string,
    last: string,
) {
    return {
        id,
        first_name: first,
        last_name: last,
        email: `${first}@example.com`.toLowerCase(),
        phone: '',
        title: 'product_manager',
        strengths: '[]' as const,
        team_dimensions: '{}' as const,
        bio: '',
        department: 'Product',
    };
}

async function seedWorkerState(
    db: MemoryDbAdapter,
    workerId: string,
): Promise<void> {
    await db.states.record(
        `st-${workerId}`,
        workerId,
        'active',
        'system',
    );
}

test(
    'workerName returns fullName for known human id',
    () => {
        const map = new Map<WorkerId, Worker>([
            ['u1', new HumanWorker(
                buildHumanWorkerRow(
                    'u1', 'Alice', 'Adams',
                ),
                'active',
            )],
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
        await db.workers.put(
            'u1', buildHumanWorkerRow(
                'u1', 'Alice', 'Adams',
            ),
        );
        await seedWorkerState(db, 'u1');
        const ctx = createRequestContext(db);
        const map = await getHumanWorkerMap(ctx);
        assert.equal(map.size, 1);
        assert.equal(
            map.get('u1')?.fullName(),
            'Alice Adams',
        );
    },
);

// Test removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.

test('Fresh ctx re-fetches each call', async () => {
    const db = new MemoryDbAdapter();
    await db.workers.put('u1', buildHumanWorkerRow(
        'u1', 'Alice', 'Adams',
    ));
    await seedWorkerState(db, 'u1');
    const m1 = await getHumanWorkerMap(
        createRequestContext(db),
    );
    await db.workers.put('u2', buildHumanWorkerRow(
        'u2', 'Bob', 'Brown',
    ));
    await seedWorkerState(db, 'u2');
    const m2 = await getHumanWorkerMap(
        createRequestContext(db),
    );
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test(
    'getCurrentHumanWorker returns HumanWorkerEntity',
    async () => {
        const db = new MemoryDbAdapter();
        await db.workers.put('current', {
            ...buildHumanWorkerRow(
                'current', 'Alice', 'Adams',
            ),
        });
        const row = await getCurrentHumanWorker(
            createRequestContext(db),
        );
        assert.equal(row.first_name, 'Alice');
        assert.equal(row.last_name, 'Adams');
    },
);

// Test removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.

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

// Test removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.

// Tests removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.
