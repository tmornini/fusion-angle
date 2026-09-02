import { assertEquals, assertRejects, assertStrictEquals } from '@std/assert';
import {
    GET, PUT, DELETE,
} from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

// Nested record-types + attributes (Task 23);
// organizations/:id/flows/:id/records
// join family stays (decision 9 — UNTOUCHED).

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

const TYPES = 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/';
const TYPE = TYPES + 'rbfHGatkwQzGZJVXKJEeyw';
const ATTRS = TYPE + '/attributes/';
const ATTR = ATTRS + 'UQBiHFcwJeCDSnmkPBoYRA';

// record-types

Deno.test(
    'GET nested record-types returns an empty array'
    + ' on an empty db',
    async () => {
        const db = await freshDb();
        const out =
            await GET<unknown[]>(db, TYPES, DEV_TOKEN);
        assertEquals(out, []);
    },
);

Deno.test(
    'PUT nested record-types/:id then GET round-trips',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: 'A customer record',
            position: 1,
            state: 'active',
        }, DEV_TOKEN);
        const stored = await GET<{
            id: string;
            name: string;
            description: string;
            position: number;
            state: string;
        }>(db, TYPE, DEV_TOKEN);
        assertStrictEquals(stored.id, 'rbfHGatkwQzGZJVXKJEeyw');
        assertStrictEquals(stored.name, 'Customer');
        assertStrictEquals(stored.position, 1);
        assertStrictEquals(stored.state, 'active');
        assertStrictEquals('state_at' in stored, false);
    },
);

Deno.test(
    'DELETE nested record-types/:id removes the type',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'X',
            description: '',
            position: 1,
            state: 'active',
        }, DEV_TOKEN);
        await DELETE(db, TYPE, DEV_TOKEN);
        await assertRejects(
            () => GET(db, TYPE, DEV_TOKEN),
        );
    },
);

// nested attributes

Deno.test(
    'GET nested attributes returns an empty array',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
        }, DEV_TOKEN);
        const out = await GET<unknown[]>(
            db, ATTRS, DEV_TOKEN,
        );
        assertEquals(out, []);
    },
);

Deno.test(
    'PUT nested attributes/:id then GET round-trips',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
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
        assertStrictEquals(stored.id, 'UQBiHFcwJeCDSnmkPBoYRA');
        assertStrictEquals(stored.record_type_id, 'rbfHGatkwQzGZJVXKJEeyw');
        assertStrictEquals(
            stored.attribute_type, 'text',
        );
    },
);

Deno.test(
    'DELETE nested attributes/:id removes the row',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
        }, DEV_TOKEN);
        await PUT(db, ATTR, {
            name: 'X',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        }, DEV_TOKEN);
        await DELETE(db, ATTR, DEV_TOKEN);
        await assertRejects(
            () => GET(db, ATTR, DEV_TOKEN),
        );
    },
);

// flow-records (nested under
// organizations/:id/flows/:id/records) — UNTOUCHED

Deno.test(
    'GET organizations/:id/flows/:id/records returns an empty array',
    async () => {
        const db = await freshDb();
        const out = await GET<unknown[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/records/', DEV_TOKEN,
        );
        assertEquals(out, []);
    },
);

Deno.test(
    'PUT organizations/:id/flows/:id/records/:frid then GET round-trips a'
    + ' binding',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
        }, DEV_TOKEN);
        await PUT(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aEsGMmBEFaVdWihhHXwCbw/records/dCnpryxCNwuTnCrBBDIMOw', {
            id: 'dCnpryxCNwuTnCrBBDIMOw',
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: '2026-05-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const stored = await GET<{
            id: string;
            flow_id: string;
            record_id: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aEsGMmBEFaVdWihhHXwCbw/records/dCnpryxCNwuTnCrBBDIMOw'
            , DEV_TOKEN);
        assertStrictEquals(stored.flow_id, 'aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(stored.record_id, 'rbfHGatkwQzGZJVXKJEeyw');
    },
);

Deno.test(
    'DELETE organizations/:id/flows/:id/records/:frid removes the binding',
    async () => {
        const db = await freshDb();
        await PUT(db, TYPE, {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: '',
            position: 1,
            state: 'active',
        }, DEV_TOKEN);
        await PUT(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aEsGMmBEFaVdWihhHXwCbw/records/dCnpryxCNwuTnCrBBDIMOw', {
            id: 'dCnpryxCNwuTnCrBBDIMOw',
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: '2026-05-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await DELETE(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/records/dCnpryxCNwuTnCrBBDIMOw'
                , DEV_TOKEN,
        );
        await assertRejects(
            () => GET(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'aEsGMmBEFaVdWihhHXwCbw/records/'
                    + 'dCnpryxCNwuTnCrBBDIMOw', DEV_TOKEN,
            ),
        );
    },
);
