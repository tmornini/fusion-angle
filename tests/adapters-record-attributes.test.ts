import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    putRecordAttribute,
    getRecordAttribute,
    getRecordAttributesByRecord,
    deleteRecordAttribute,
} from
'../web-app/app/adapters/record-attributes.ts';

test(
    'putRecordAttribute then getRecordAttribute'
    + ' round-trips the row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await putRecordAttribute(ctx, 'attr-1', {
            record_id: 'rec-1',
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        });
        const stored = await getRecordAttribute(
            ctx, 'attr-1',
        );
        assert.equal(stored.id, 'attr-1');
        assert.equal(stored.name, 'Email');
        assert.equal(
            stored.attribute_type, 'text',
        );
    },
);

test(
    'getRecordAttributesByRecord returns only the'
    + ' attributes for the given record_id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await putRecordAttribute(ctx, 'a-1', {
            record_id: 'rec-1',
            name: 'A1',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        });
        await putRecordAttribute(ctx, 'a-2', {
            record_id: 'rec-1',
            name: 'A2',
            attribute_type: 'text',
            sort_order: 2,
            options: [],
            constraints: [],
        });
        await putRecordAttribute(ctx, 'b-1', {
            record_id: 'rec-2',
            name: 'B1',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        });
        const rec1 = await
            getRecordAttributesByRecord(
                ctx, 'rec-1',
            );
        const ids = rec1.map(a => a.id).sort();
        assert.deepEqual(ids, ['a-1', 'a-2']);
    },
);

test(
    'getRecordAttributesByRecord returns rows in'
    + ' sort_order ascending',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await putRecordAttribute(ctx, 'a-mid', {
            record_id: 'rec-1',
            name: 'middle',
            attribute_type: 'text',
            sort_order: 5,
            options: [],
            constraints: [],
        });
        await putRecordAttribute(ctx, 'a-first', {
            record_id: 'rec-1',
            name: 'first',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        });
        await putRecordAttribute(ctx, 'a-last', {
            record_id: 'rec-1',
            name: 'last',
            attribute_type: 'text',
            sort_order: 10,
            options: [],
            constraints: [],
        });
        const rows = await
            getRecordAttributesByRecord(
                ctx, 'rec-1',
            );
        assert.deepEqual(
            rows.map(r => r.id),
            ['a-first', 'a-mid', 'a-last'],
        );
    },
);

test(
    'deleteRecordAttribute removes the row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await putRecordAttribute(ctx, 'a-1', {
            record_id: 'rec-1',
            name: 'A1',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        });
        await deleteRecordAttribute(ctx, 'a-1');
        await assert.rejects(
            () => getRecordAttribute(ctx, 'a-1'),
        );
    },
);

test(
    'putRecordAttribute rejects a regex'
    + ' constraint on a number attribute_type',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await assert.rejects(
            () => putRecordAttribute(ctx, 'a-1', {
                record_id: 'rec-1',
                name: 'X',
                attribute_type: 'number',
                sort_order: 1,
                options: [],
                constraints: [{
                    kind: 'regex',
                    pattern: '^\\d+$',
                }],
            }),
            /regex/,
        );
    },
);

test(
    'putRecordAttribute rejects range_min on a'
    + ' text attribute_type',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await assert.rejects(
            () => putRecordAttribute(ctx, 'a-1', {
                record_id: 'rec-1',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [{
                    kind: 'range_min',
                    min: '0',
                }],
            }),
        );
    },
);

test(
    'putRecordAttribute accepts a range_min'
    + ' constraint on a date attribute_type',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await putRecordAttribute(ctx, 'a-1', {
            record_id: 'rec-1',
            name: 'When',
            attribute_type: 'date',
            sort_order: 1,
            options: [],
            constraints: [{
                kind: 'range_min',
                min: '2000-01-01',
            }],
        });
        const stored = await getRecordAttribute(
            ctx, 'a-1',
        );
        assert.equal(stored.attribute_type, 'date');
    },
);

test(
    'putRecordAttribute accepts a regex constraint'
    + ' on a text attribute_type',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await putRecordAttribute(ctx, 'a-1', {
            record_id: 'rec-1',
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [{
                kind: 'regex',
                pattern:
                    '^[^@]+@[^@]+\\.[^@]+$',
            }],
        });
        const stored = await getRecordAttribute(
            ctx, 'a-1',
        );
        assert.equal(stored.name, 'Email');
    },
);
