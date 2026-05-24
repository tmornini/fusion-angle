import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, DELETE,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import { jsonArrayField } from '../api/types.ts';

// records

test(
    'GET records returns an empty array on an'
    + ' empty db',
    async () => {
        const db = new MemoryDbAdapter();
        const out =
            await GET<unknown[]>(db, 'records');
        assert.deepEqual(out, []);
    },
);

test(
    'PUT records/:id then GET round-trips a record',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(db, 'records/rec-1', {
            id: 'rec-1',
            name: 'Customer',
            description: 'A customer record',
        });
        const stored = await GET<{
            id: string;
            name: string;
            description: string;
        }>(db, 'records/rec-1');
        assert.equal(stored.id, 'rec-1');
        assert.equal(stored.name, 'Customer');
    },
);

test(
    'DELETE records/:id removes the record',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(db, 'records/rec-1', {
            id: 'rec-1',
            name: 'X',
            description: '',
        });
        await DELETE(db, 'records/rec-1');
        await assert.rejects(
            () => GET(db, 'records/rec-1'),
        );
    },
);

// record-attributes

test(
    'GET record-attributes returns an empty array',
    async () => {
        const db = new MemoryDbAdapter();
        const out = await GET<unknown[]>(
            db, 'record-attributes',
        );
        assert.deepEqual(out, []);
    },
);

test(
    'PUT record-attributes/:id then GET'
    + ' round-trips an attribute',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(db, 'record-attributes/a-1', {
            id: 'a-1',
            record_id: 'rec-1',
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        });
        const stored = await GET<{
            id: string;
            record_id: string;
            attribute_type: string;
        }>(db, 'record-attributes/a-1');
        assert.equal(stored.id, 'a-1');
        assert.equal(stored.record_id, 'rec-1');
        assert.equal(
            stored.attribute_type, 'text',
        );
    },
);

test(
    'DELETE record-attributes/:id removes the row',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(db, 'record-attributes/a-1', {
            id: 'a-1',
            record_id: 'rec-1',
            name: 'X',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        });
        await DELETE(
            db, 'record-attributes/a-1',
        );
        await assert.rejects(
            () => GET(db, 'record-attributes/a-1'),
        );
    },
);

// flow-records

test(
    'GET flow-records returns an empty array',
    async () => {
        const db = new MemoryDbAdapter();
        const out = await GET<unknown[]>(
            db, 'flow-records',
        );
        assert.deepEqual(out, []);
    },
);

test(
    'PUT flow-records/:id then GET round-trips a'
    + ' binding',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(db, 'flow-records/fr-1', {
            id: 'fr-1',
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: '2026-05-01T00:00:00.000Z',
        });
        const stored = await GET<{
            id: string;
            flow_id: string;
            record_id: string;
        }>(db, 'flow-records/fr-1');
        assert.equal(stored.flow_id, 'flow-1');
        assert.equal(stored.record_id, 'rec-1');
    },
);

test(
    'DELETE flow-records/:id removes the binding',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(db, 'flow-records/fr-1', {
            id: 'fr-1',
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: '2026-05-01T00:00:00.000Z',
        });
        await DELETE(db, 'flow-records/fr-1');
        await assert.rejects(
            () => GET(db, 'flow-records/fr-1'),
        );
    },
);
