import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    jsonArrayField,
} from '../api/types.ts';
import {
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// ── Create variant ──────

test(
    'POST records create writes the'
    + ' record, initial state event, and'
    + ' attributes in one operation',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'records', {
            kind: 'create',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'Quarterly Renewals',
                description: 'Customer pricing',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
                    organization_id: '1',
                    record_id: 'rec-1',
                    name: 'Monthly Fee',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        }, DEV_TOKEN);
        const record = await GET<{
            id: string;
            name: string;
        }>(db, 'records/rec-1', DEV_TOKEN);
        assert.equal(record.name, 'Quarterly Renewals');
        const current = await GET<{
            state: string;
        }>(db, 'entity-states/rec-1', DEV_TOKEN);
        assert.equal(current.state, 'active');
        const attrs = await GET<unknown[]>(
            db, 'record-attributes', DEV_TOKEN,
        );
        assert.equal(attrs.length, 1);
    },
);

test(
    'POST records create with empty'
    + ' attributes still writes the record and'
    + ' state event',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'records', {
            kind: 'create',
            id: 'rec-2',
            record: {
                organization_id: '1',
                name: 'Empty',
                description: '',
                position: 2,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'ev-2',
        }, DEV_TOKEN);
        const record = await GET<{ name: string }>(
            db, 'records/rec-2', DEV_TOKEN,
        );
        assert.equal(record.name, 'Empty');
        const current = await GET<{
            state: string;
            member_id: string;
        }>(db, 'entity-states/rec-2', DEV_TOKEN);
        assert.equal(current.state, 'active');
        assert.equal(
            current.member_id, 'current',
        );
    },
);

// ── Edit variant ──────

test(
    'POST records edit updates the'
    + ' record fields without touching state',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'records', {
            kind: 'create',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'Before',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        }, DEV_TOKEN);
        await POST(db, 'records', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'After',
                description: 'updated',
                position: 1,
            },
            attributes: [],
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const record = await GET<{
            name: string;
            description: string;
        }>(db, 'records/rec-1', DEV_TOKEN);
        assert.equal(record.name, 'After');
        assert.equal(
            record.description, 'updated',
        );
        const history = await GET<unknown[]>(
            db, 'entity-states/rec-1/history', DEV_TOKEN,
        );
        assert.equal(
            history.length, 1,
            'edit must not emit a state event',
        );
    },
);

test(
    'POST records edit removes'
    + ' attributes by id and adds new ones',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'records', {
            kind: 'create',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-old',
                    organization_id: '1',
                    record_id: 'rec-1',
                    name: 'Old',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        }, DEV_TOKEN);
        await POST(db, 'records', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-new',
                    organization_id: '1',
                    record_id: 'rec-1',
                    name: 'New',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            removedAttributeIds: ['a-old'],
        }, DEV_TOKEN);
        const all = await GET<{
            id: string;
            name: string;
        }[]>(db, 'record-attributes', DEV_TOKEN);
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'a-new');
        assert.equal(all[0]!.name, 'New');
    },
);

test(
    'POST records edit updates an'
    + ' existing attribute by upsert',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'records', {
            kind: 'create',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
                    organization_id: '1',
                    record_id: 'rec-1',
                    name: 'Initial',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        }, DEV_TOKEN);
        await POST(db, 'records', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
                    organization_id: '1',
                    record_id: 'rec-1',
                    name: 'Renamed',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const stored = await GET<{
            name: string;
            attribute_type: string;
        }>(db, 'record-attributes/a-1', DEV_TOKEN);
        assert.equal(stored.name, 'Renamed');
        assert.equal(
            stored.attribute_type, 'number',
        );
    },
);

// ── Failure modes ──────

test(
    'POST records rejects an empty'
    + ' attribute name',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'a-1',
                        organization_id: '1',
                        record_id: 'rec-1',
                        name: '',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: jsonArrayField(
                            [],
                        ),
                        constraints: jsonArrayField(
                            [],
                        ),
                    },
                ],
                initialState: 'active',
                initialStateEventId: 'ev-1',
            }, DEV_TOKEN),
            /must be non-empty/,
        );
    },
);

test(
    'POST records rejects an'
    + ' attribute whose record_id does not'
    + ' match the top-level id',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'a-1',
                        organization_id: '1',
                        record_id: 'rec-other',
                        name: 'X',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: jsonArrayField(
                            [],
                        ),
                        constraints: jsonArrayField(
                            [],
                        ),
                    },
                ],
                initialState: 'active',
                initialStateEventId: 'ev-1',
            }, DEV_TOKEN),
            /record_id must match top-level id/,
        );
    },
);

test(
    'POST records rejects an unknown'
    + ' kind discriminator',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'destroy',
                id: 'rec-1',
                record: {
                    organization_id: '1',
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
    'POST records rejects an invalid'
    + ' initialState',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'pending',
                initialStateEventId: 'ev-1',
            }, DEV_TOKEN),
            /expected RecordState/,
        );
    },
);

test(
    'POST records rejects a body with'
    + ' an unexpected key',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
                initialStateEventId: 'ev-1',
                extra: 'forbidden',
            }, DEV_TOKEN),
            /unexpected key/,
        );
    },
);

test(
    'POST records rejects a body with'
    + ' a missing required key',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'edit',
                id: 'rec-1',
                record: {
                    organization_id: '1',
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
    'POST records create rolls back the'
    + ' record when its initial state event conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's
        // initialStateEventId. postEvent re-puts that id with
        // a conflicting payload mid-tx (LedgerImmutability),
        // so the record write must roll back with it.
        await db.states.put('ev-x', {
            entity_id: 'other',
            state: 'active',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'create',
                id: 'rec-rollback',
                record: {
                    organization_id: '1',
                    name: 'Doomed', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
                initialStateEventId: 'ev-x',
            }, DEV_TOKEN),
        );
        await assert.rejects(
            () => GET(
                db, 'records/rec-rollback', DEV_TOKEN,
            ),
        );
    },
);
