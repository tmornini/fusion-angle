import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, DELETE,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    jsonArrayField,
} from '../api/types.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// records

test(
    'GET records returns an empty array on an'
    + ' empty db',
    async () => {
        const db = await freshDb();
        const out =
            await GET<unknown[]>(db, 'records', DEV_TOKEN);
        assert.deepEqual(out, []);
    },
);

test(
    'PUT records/:id then GET round-trips a record',
    async () => {
        const db = await freshDb();
        await PUT(db, 'records/rec-1', {
            id: 'rec-1',
            organization_id: '1',
            name: 'Customer',
            description: 'A customer record',
            position: 1,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-rec-1',
        }, DEV_TOKEN);
        const stored = await GET<{
            id: string;
            name: string;
            description: string;
            position: number;
        }>(db, 'records/rec-1', DEV_TOKEN);
        assert.equal(stored.id, 'rec-1');
        assert.equal(stored.name, 'Customer');
        assert.equal(stored.position, 1);
    },
);

test(
    'DELETE records/:id removes the record',
    async () => {
        const db = await freshDb();
        await PUT(db, 'records/rec-1', {
            id: 'rec-1',
            organization_id: '1',
            name: 'X',
            description: '',
            position: 1,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-rec-1',
        }, DEV_TOKEN);
        await DELETE(db, 'records/rec-1', DEV_TOKEN);
        await assert.rejects(
            () => GET(db, 'records/rec-1', DEV_TOKEN),
        );
    },
);

// record-attributes

test(
    'GET record-attributes returns an empty array',
    async () => {
        const db = await freshDb();
        const out = await GET<unknown[]>(
            db, 'record-attributes', DEV_TOKEN,
        );
        assert.deepEqual(out, []);
    },
);

test(
    'PUT record-attributes/:id then GET'
    + ' round-trips an attribute',
    async () => {
        const db = await freshDb();
        await PUT(db, 'record-attributes/a-1', {
            id: 'a-1',
            organization_id: '1',
            record_id: 'rec-1',
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        }, DEV_TOKEN);
        const stored = await GET<{
            id: string;
            record_id: string;
            attribute_type: string;
        }>(db, 'record-attributes/a-1', DEV_TOKEN);
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
        const db = await freshDb();
        await PUT(db, 'record-attributes/a-1', {
            id: 'a-1',
            organization_id: '1',
            record_id: 'rec-1',
            name: 'X',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        }, DEV_TOKEN);
        await DELETE(
            db, 'record-attributes/a-1', DEV_TOKEN,
        );
        await assert.rejects(
            () => GET(
                db, 'record-attributes/a-1', DEV_TOKEN),
        );
    },
);

// flow-records (nested under flows/:id/records)

test(
    'GET flows/:id/records returns an empty array',
    async () => {
        const db = await freshDb();
        const out = await GET<unknown[]>(
            db, 'flows/flow-1/records', DEV_TOKEN,
        );
        assert.deepEqual(out, []);
    },
);

test(
    'PUT flows/:id/records/:frid then GET round-trips a'
    + ' binding',
    async () => {
        const db = await freshDb();
        await PUT(db, 'flows/flow-1/records/fr-1', {
            id: 'fr-1',
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: '2026-05-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const stored = await GET<{
            id: string;
            flow_id: string;
            record_id: string;
        }>(db, 'flows/flow-1/records/fr-1', DEV_TOKEN);
        assert.equal(stored.flow_id, 'flow-1');
        assert.equal(stored.record_id, 'rec-1');
    },
);

test(
    'DELETE flows/:id/records/:frid removes the binding',
    async () => {
        const db = await freshDb();
        await PUT(db, 'flows/flow-1/records/fr-1', {
            id: 'fr-1',
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: '2026-05-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await DELETE(
            db, 'flows/flow-1/records/fr-1', DEV_TOKEN,
        );
        await assert.rejects(
            () => GET(
                db, 'flows/flow-1/records/fr-1', DEV_TOKEN,
            ),
        );
    },
);
