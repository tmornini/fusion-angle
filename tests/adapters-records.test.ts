import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getRecord,
    getRecords,
    putRecord,
    deleteRecord,
    getRecordState,
    postRecordCreation,
    postRecordStateChange,
    archiveRecord,
} from '../web-app/app/adapters/records.ts';
async function seedCurrentWorker(
    db: MemoryDbAdapter,
): Promise<void> {
    await db.workers.put('current', {
        first_name: 'Demo',
        last_name: 'User',
        email: 'demo@example.com',
        title: 'Admin',
        department: 'Product',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        phone: '',
        bio: '',
    });
}

test(
    'postRecordCreation writes the row and the'
    + ' initial state event',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'Customer',
                description: 'A customer record',
                position: 1,
            },
            'active',
        );
        const stored = await getRecord(ctx, 'rec-1');
        assert.equal(stored.id, 'rec-1');
        assert.equal(stored.name, 'Customer');
        const state = await getRecordState(
            ctx, 'rec-1',
        );
        assert.equal(state, 'active');
    },
);

test(
    'putRecord overwrites an existing row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'A',
                description: 'first',
                position: 1,
            },
            'active',
        );
        await putRecord(ctx, 'rec-1', {
            name: 'B',
            description: 'second',
            position: 1,
        });
        const stored = await getRecord(ctx, 'rec-1');
        assert.equal(stored.name, 'B');
        assert.equal(stored.description, 'second');
    },
);

test(
    'getRecords excludes records whose latest'
    + ' state event is deleted',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'Keep',
                description: '',
                position: 1,
            },
            'active',
        );
        await postRecordCreation(
            ctx, 'rec-2',
            {
                name: 'Drop',
                description: '',
                position: 2,
            },
            'active',
        );
        await postRecordStateChange(
            ctx, 'rec-2', 'deleted',
        );
        const records = await getRecords(ctx);
        const ids = records
            .map(r => r.entity.id)
            .sort();
        assert.deepEqual(ids, ['rec-1']);
    },
);

test(
    'archiveRecord transitions the record to'
    + ' archived',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'X',
                description: '',
                position: 1,
            },
            'active',
        );
        await archiveRecord(ctx, 'rec-1');
        const state = await getRecordState(
            ctx, 'rec-1',
        );
        assert.equal(state, 'archived');
    },
);

test(
    'postRecordStateChange records a new event'
    + ' without touching the entity row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'X',
                description: 'orig',
                position: 1,
            },
            'active',
        );
        await postRecordStateChange(
            ctx, 'rec-1', 'archived',
        );
        const stored = await getRecord(ctx, 'rec-1');
        assert.equal(stored.description, 'orig');
        const state = await getRecordState(
            ctx, 'rec-1',
        );
        assert.equal(state, 'archived');
    },
);

test(
    'deleteRecord hard-splices the row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'X',
                description: '',
                position: 1,
            },
            'active',
        );
        await deleteRecord(ctx, 'rec-1');
        await assert.rejects(
            () => getRecord(ctx, 'rec-1'),
        );
    },
);

test(
    'getRecordState throws when no state event'
    + ' exists for the record',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => getRecordState(ctx, 'rec-missing'),
            /no state event/,
        );
    },
);

test(
    'state events for records land in the unified'
    + ' states log',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordCreation(
            ctx, 'rec-1',
            {
                name: 'X',
                description: '',
                position: 1,
            },
            'active',
        );
        await postRecordStateChange(
            ctx, 'rec-1', 'archived',
        );
        const events = await db.states.allFor(
            'rec-1',
        );
        const values = events
            .map(e => e.state)
            .sort();
        assert.deepEqual(
            values, ['active', 'archived'],
        );
    },
);
