import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, DELETE,
} from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

// Nested record-types + attributes (Task 23); flows/:id/records
// join family stays (decision 9 — UNTOUCHED).

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

const TYPES = 'organizations/1/record-types';
const TYPE = TYPES + '/rec-1';
const ATTRS = TYPE + '/attributes';
const ATTR = ATTRS + '/a-1';

// record-types

test(
    'GET nested record-types returns an empty array'
    + ' on an empty db',
    async () => {
        const db = await freshDb();
        const out =
            await GET<unknown[]>(db, TYPES, DEV_TOKEN);
        assert.deepEqual(out, []);
    },
);

test(
    'PUT nested record-types/:id then GET round-trips',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
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
            state: string;
            state_at: string;
            state_event_id: string;
        }>(db, TYPE, DEV_TOKEN);
        assert.equal(stored.id, 'rec-1');
        assert.equal(stored.name, 'Customer');
        assert.equal(stored.position, 1);
        assert.equal(stored.state, 'active');
        assert.equal(
            stored.state_at, '2026-01-01T00:00:00.000000Z',
        );
        assert.equal(stored.state_event_id, 'ev-rec-1');
    },
);

test(
    'DELETE nested record-types/:id removes the type',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rec-1',
            organization_id: '1',
            name: 'X',
            description: '',
            position: 1,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-rec-1',
        }, DEV_TOKEN);
        await DELETE(db, TYPE, DEV_TOKEN);
        await assert.rejects(
            () => GET(db, TYPE, DEV_TOKEN),
        );
    },
);

// nested attributes

test(
    'GET nested attributes returns an empty array',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rec-1',
            organization_id: '1',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-rec-1',
        }, DEV_TOKEN);
        const out = await GET<unknown[]>(
            db, ATTRS, DEV_TOKEN,
        );
        assert.deepEqual(out, []);
    },
);

test(
    'PUT nested attributes/:id then GET round-trips',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rec-1',
            organization_id: '1',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-rec-1',
        }, DEV_TOKEN);
        await PUT(db, ATTR, {
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        }, DEV_TOKEN);
        const stored = await GET<{
            id: string;
            record_type_id: string;
            attribute_type: string;
        }>(db, ATTR, DEV_TOKEN);
        assert.equal(stored.id, 'a-1');
        assert.equal(stored.record_type_id, 'rec-1');
        assert.equal(
            stored.attribute_type, 'text',
        );
    },
);

test(
    'DELETE nested attributes/:id removes the row',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rec-1',
            organization_id: '1',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-rec-1',
        }, DEV_TOKEN);
        await PUT(db, ATTR, {
            name: 'X',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        }, DEV_TOKEN);
        await DELETE(db, ATTR, DEV_TOKEN);
        await assert.rejects(
            () => GET(db, ATTR, DEV_TOKEN),
        );
    },
);

// flow-records (nested under flows/:id/records) — UNTOUCHED

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
