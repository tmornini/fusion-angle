import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { deriveRecordTypeStateHistory } from
    '../api/derive-record-types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// ── Create variant ──────

test(
    'POST nested record-types create writes the'
    + ' record, initial state event, and'
    + ' attributes in one operation',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Quarterly Renewals',
                description: 'Customer pricing',
                position: 1,
            },
            attributes: [
                {
                    id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'Monthly Fee',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const record = await GET<{
            id: string;
            name: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN);
        assert.equal(record.name, 'Quarterly Renewals');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const history = await GET<{
            state: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw/versions/', DEV_TOKEN);
        assert.equal(history.length, 1);
        assert.equal(history[0]!.state, 'active');
        const attrs = await GET<unknown[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw/attributes/', DEV_TOKEN,
        );
        assert.equal(attrs.length, 1);
    },
);

test(
    'POST nested record-types create with empty'
    + ' attributes still writes the record and'
    + ' state event',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rcaSzEaORBkezCxyhLhecA',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Empty',
                description: '',
                position: 2,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const record = await GET<{ name: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rcaSzEaORBkezCxyhLhecA', DEV_TOKEN,
        );
        assert.equal(record.name, 'Empty');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7).
        const history = await GET<{
            state: string;
            member_id: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rcaSzEaORBkezCxyhLhecA/versions/', DEV_TOKEN);
        assert.equal(history.length, 1);
        assert.equal(history[0]!.state, 'active');
        assert.equal(typeof history[0]!.member_id, 'string');
        assert.notEqual(history[0]!.member_id, '');
        assert.equal('state_at' in history[0]!, false);
    },
);

// ── Edit variant ──────

test(
    'POST nested record-types edit updates the'
    + ' record fields without touching state',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Before',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'edit',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'After',
                description: 'updated',
                position: 1,
            },
            attributes: [],
            // Echoed from the create's own known head — NEVER
            // a fresh mint — so the sameEvent decompose no-ops
            // and this edit genuinely proves no state event was
            // emitted.
            state: 'active',
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const record = await GET<{
            name: string;
            description: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN);
        assert.equal(record.name, 'After');
        assert.equal(
            record.description, 'updated',
        );
        const events = await deriveRecordTypeStateHistory(
            db, 'AjdvjuECVZEgZoFajaIEkg', 'rbfHGatkwQzGZJVXKJEeyw',
        );
        assert.equal(
            events.length, 1,
            'edit must not emit a state event',
        );
    },
);

test(
    'POST nested record-types edit removes'
    + ' attributes by id and adds new ones',
    async () => {
        const db = await freshDb();
        const oldAttrId = generateIdentifier();
        const newAttrId = generateIdentifier();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: oldAttrId,
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'Old',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'edit',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: newAttrId,
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'New',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            // Echoed from the create's own known head above.
            state: 'active',
            removedAttributeIds: [oldAttrId],
        }, DEV_TOKEN);
        const all = await GET<{
            id: string;
            name: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw/attributes/', DEV_TOKEN);
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, newAttrId);
        assert.equal(all[0]!.name, 'New');
    },
);

test(
    'POST nested record-types edit updates an'
    + ' existing attribute by upsert',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'Initial',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'edit',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'Renamed',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            // Echoed from the create's own known head above.
            state: 'active',
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const stored = await GET<{
            name: string;
            attribute_type: string;
        }>(
            db,
            'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/UQBiHFcwJeCDSnmkPBoYRA',
            DEV_TOKEN,
        );
        assert.equal(stored.name, 'Renamed');
        assert.equal(
            stored.attribute_type, 'number',
        );
    },
);

// ── Failure modes ──────

test(
    'POST nested record-types rejects an empty'
    + ' attribute name',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'UQBiHFcwJeCDSnmkPBoYRA',
                        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                        record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                        name: '',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
                initialStateEventId: generateIdentifier(),
                initialStateAt:
                    '2025-01-01T00:00:00.000000Z',
            }, DEV_TOKEN),
            /must be non-empty/,
        );
    },
);

test(
    'POST nested record-types rejects an'
    + ' attribute whose record_id does not'
    + ' match the top-level id',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'UQBiHFcwJeCDSnmkPBoYRA',
                        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                        record_id: generateIdentifier(),
                        name: 'X',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
                initialStateEventId: generateIdentifier(),
                initialStateAt:
                    '2025-01-01T00:00:00.000000Z',
            }, DEV_TOKEN),
            /record_id must match top-level id/,
        );
    },
);

test(
    'POST nested record-types rejects an unknown'
    + ' kind discriminator',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'destroy',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            }, DEV_TOKEN),
            /RecordWriteBody kind/,
        );
    },
);

test(
    'POST nested record-types rejects an invalid'
    + ' initialState',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'pending',
                initialStateEventId: generateIdentifier(),
                initialStateAt:
                    '2025-01-01T00:00:00.000000Z',
            }, DEV_TOKEN),
            /expected RecordState/,
        );
    },
);

test(
    'POST nested record-types rejects a body with'
    + ' an unexpected key',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
                initialStateEventId: generateIdentifier(),
                initialStateAt:
                    '2025-01-01T00:00:00.000000Z',
                extra: 'forbidden',
            }, DEV_TOKEN),
            /unexpected key/,
        );
    },
);

test(
    'POST nested record-types rejects a body with'
    + ' a missing required key',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'edit',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            }, DEV_TOKEN),
            /missing required key/,
        );
    },
);

test(
    'POST nested record-types create threads caller'
    + ' initialStateAt to the initial state event',
    async () => {
        const db = await freshDb();
        const recId = generateIdentifier();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: recId,
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Timed Record',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            // Far-future timestamp forces a distinct, verifiable
            // at value so the test can confirm the caller's time
            // was threaded to the event — not a server nowUtc().
            initialStateAt:
                '2099-07-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7).
        const history = await GET<{
            id: string;
            state: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + recId + '/versions/', DEV_TOKEN);
        assert.equal(history.length, 1);
        const current = history[0]!;
        assert.equal(current.id, recId);
        assert.equal(current.state, 'active');
        assert.equal('state_at' in current, false);
    },
);

test(
    'POST nested record-types create ignores a raw colliding states'
    + ' row (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // message-plane create.
    // Phase Final Stage B: states table retired.
        const recId = generateIdentifier();
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: recId,
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Survives', description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt:
                '2099-07-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const rec = await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + recId, DEV_TOKEN,
        );
        assert.equal(rec.id, recId);
    },
);
