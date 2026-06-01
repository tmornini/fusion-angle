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
    seedCurrentWorker,
    seedHumanWorker,
} from './worker-fixtures.ts';

// ── Create variant ──────

test(
    'POST records-multi-put create writes the'
    + ' record, initial state event, and'
    + ' attributes in one operation',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await POST(db, 'records-multi-put', {
            kind: 'create',
            id: 'rec-1',
            record: {
                name: 'Quarterly Renewals',
                description: 'Customer pricing',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
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
        });
        const record = await GET<{
            id: string;
            name: string;
        }>(db, 'records/rec-1');
        assert.equal(record.name, 'Quarterly Renewals');
        const current = await GET<{
            state: string;
        }>(db, 'entity-states/rec-1');
        assert.equal(current.state, 'active');
        const attrs = await GET<unknown[]>(
            db, 'record-attributes',
        );
        assert.equal(attrs.length, 1);
    },
);

test(
    'POST records-multi-put create with empty'
    + ' attributes still writes the record and'
    + ' state event',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await POST(db, 'records-multi-put', {
            kind: 'create',
            id: 'rec-2',
            record: {
                name: 'Empty',
                description: '',
                position: 2,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'ev-2',
        });
        const record = await GET<{ name: string }>(
            db, 'records/rec-2',
        );
        assert.equal(record.name, 'Empty');
        const current = await GET<{
            state: string;
            worker_id: string;
        }>(db, 'entity-states/rec-2');
        assert.equal(current.state, 'active');
        assert.equal(
            current.worker_id, 'current',
        );
    },
);

// ── Edit variant ──────

test(
    'POST records-multi-put edit updates the'
    + ' record fields without touching state',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await POST(db, 'records-multi-put', {
            kind: 'create',
            id: 'rec-1',
            record: {
                name: 'Before',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        });
        await POST(db, 'records-multi-put', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                name: 'After',
                description: 'updated',
                position: 1,
            },
            attributes: [],
            removedAttributeIds: [],
        });
        const record = await GET<{
            name: string;
            description: string;
        }>(db, 'records/rec-1');
        assert.equal(record.name, 'After');
        assert.equal(
            record.description, 'updated',
        );
        const history = await GET<unknown[]>(
            db, 'entity-states/rec-1/history',
        );
        assert.equal(
            history.length, 1,
            'edit must not emit a state event',
        );
    },
);

test(
    'POST records-multi-put edit removes'
    + ' attributes by id and adds new ones',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await POST(db, 'records-multi-put', {
            kind: 'create',
            id: 'rec-1',
            record: {
                name: 'R',
                description: '',
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
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        });
        await POST(db, 'records-multi-put', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                name: 'R',
                description: '',
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
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            removedAttributeIds: ['a-old'],
        });
        const all = await GET<{
            id: string;
            name: string;
        }[]>(db, 'record-attributes');
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'a-new');
        assert.equal(all[0]!.name, 'New');
    },
);

test(
    'POST records-multi-put edit updates an'
    + ' existing attribute by upsert',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await POST(db, 'records-multi-put', {
            kind: 'create',
            id: 'rec-1',
            record: {
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
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
        });
        await POST(db, 'records-multi-put', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
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
        });
        const stored = await GET<{
            name: string;
            attribute_type: string;
        }>(db, 'record-attributes/a-1');
        assert.equal(stored.name, 'Renamed');
        assert.equal(
            stored.attribute_type, 'number',
        );
    },
);

// ── Failure modes ──────

test(
    'POST records-multi-put rejects an empty'
    + ' attribute name',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await assert.rejects(
            () => POST(db, 'records-multi-put', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'a-1',
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
            }),
            /must be non-empty/,
        );
    },
);

test(
    'POST records-multi-put rejects an'
    + ' attribute whose record_id does not'
    + ' match the top-level id',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await assert.rejects(
            () => POST(db, 'records-multi-put', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'a-1',
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
            }),
            /record_id must match top-level id/,
        );
    },
);

test(
    'POST records-multi-put rejects an unknown'
    + ' kind discriminator',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await assert.rejects(
            () => POST(db, 'records-multi-put', {
                kind: 'destroy',
                id: 'rec-1',
                record: {
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            }),
            /RecordMultiPutBody kind/,
        );
    },
);

test(
    'POST records-multi-put rejects an invalid'
    + ' initialState',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await assert.rejects(
            () => POST(db, 'records-multi-put', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'pending',
                initialStateEventId: 'ev-1',
            }),
            /expected RecordState/,
        );
    },
);

test(
    'POST records-multi-put rejects a body with'
    + ' an unexpected key',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await assert.rejects(
            () => POST(db, 'records-multi-put', {
                kind: 'create',
                id: 'rec-1',
                record: {
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
                initialStateEventId: 'ev-1',
                extra: 'forbidden',
            }),
            /unexpected key/,
        );
    },
);

test(
    'POST records-multi-put rejects a body with'
    + ' a missing required key',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedCurrentWorker(db);
        await assert.rejects(
            () => POST(db, 'records-multi-put', {
                kind: 'edit',
                id: 'rec-1',
                record: {
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            }),
            /missing required key/,
        );
    },
);
