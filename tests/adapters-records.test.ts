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
    postRecordChange,
    postRecordStateChange,
    archiveRecord,
} from '../web-app/app/adapters/records.ts';
import {
    jsonArrayField,
} from '../api/types.ts';
import {
    seedCurrentWorker,
    seedHumanWorker,
} from './worker-fixtures.ts';

test(
    'postRecordChange create writes the row and'
    + ' the initial state event',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'Customer',
                description: 'A customer record',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
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
    'postRecordChange create writes attributes'
    + ' alongside the record',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'Q',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
                    record_id: 'rec-1',
                    name: 'Fee',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField([]),
                },
            ],
            initialState: 'active',
        });
        const attrs = await ctx.GET<
            { id: string; name: string }[]
        >('record-attributes');
        assert.equal(attrs.length, 1);
        assert.equal(attrs[0]!.name, 'Fee');
    },
);

test(
    'putRecord overwrites an existing row',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'A',
                description: 'first',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
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
    'postRecordChange edit replaces removed'
    + ' attributes with new ones',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-old',
                    record_id: 'rec-1',
                    name: 'Old',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField([]),
                },
            ],
            initialState: 'active',
        });
        await postRecordChange(ctx, 'rec-1', {
            kind: 'edit',
            record: {
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-new',
                    record_id: 'rec-1',
                    name: 'New',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField([]),
                },
            ],
            removedAttributeIds: ['a-old'],
        });
        const attrs = await ctx.GET<
            { id: string }[]
        >('record-attributes');
        assert.equal(attrs.length, 1);
        assert.equal(attrs[0]!.id, 'a-new');
    },
);

test(
    'getRecords excludes records whose latest'
    + ' state event is deleted',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'Keep',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        await postRecordChange(ctx, 'rec-2', {
            kind: 'create',
            record: {
                name: 'Drop',
                description: '',
                position: 2,
            },
            attributes: [],
            initialState: 'active',
        });
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
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'X',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
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
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'X',
                description: 'orig',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
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
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'X',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
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
        await db.createSchema();
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
        await db.createSchema();
        await seedCurrentWorker(db);
        const ctx = createRequestContext(db);
        await postRecordChange(ctx, 'rec-1', {
            kind: 'create',
            record: {
                name: 'X',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
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
