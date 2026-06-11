import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { orgToken } from './token-fixtures.ts';
import {
    getRecord,
    getRecords,
    putRecord,
    getRecordState,
    postRecordChange,
    postRecordStateChange,
} from '../web-app/app/adapters/records.ts';
import {
    jsonArrayField,
} from '../api/types.ts';
import {
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

test(
    'postRecordChange create writes the row and'
    + ' the initial state event',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
            .map(r => r.record.idForLink())
            .sort();
        assert.deepEqual(ids, ['rec-1']);
    },
);

test(
    'postRecordStateChange records a new event'
    + ' without touching the entity row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
    'getRecordState throws when no state event'
    + ' exists for the record',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await orgToken());
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
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await orgToken());
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
        const events = await db.states.getAllFor(
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
