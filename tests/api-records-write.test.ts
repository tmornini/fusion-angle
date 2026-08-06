import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

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
        await POST(db, 'organizations/1/record-types', {
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
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const record = await GET<{
            id: string;
            name: string;
        }>(db, 'organizations/1/record-types/rec-1', DEV_TOKEN);
        assert.equal(record.name, 'Quarterly Renewals');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /history.
        const history = await GET<{
            state: string;
        }[]>(db, 'organizations/1/record-types/rec-1/history', DEV_TOKEN);
        assert.equal(history.length, 1);
        assert.equal(history[0]!.state, 'active');
        const attrs = await GET<unknown[]>(
            db, 'organizations/1/record-types/rec-1/attributes', DEV_TOKEN,
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
        await POST(db, 'organizations/1/record-types', {
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
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const record = await GET<{ name: string }>(
            db, 'organizations/1/record-types/rec-2', DEV_TOKEN,
        );
        assert.equal(record.name, 'Empty');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7).
        const history = await GET<{
            state: string;
            member_id: string;
        }[]>(db, 'organizations/1/record-types/rec-2/history', DEV_TOKEN);
        assert.equal(history.length, 1);
        assert.equal(history[0]!.state, 'active');
        assert.equal(
            history[0]!.member_id, 'current',
        );
    },
);

// ── Edit variant ──────

test(
    'POST nested record-types edit updates the'
    + ' record fields without touching state',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/1/record-types', {
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
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'organizations/1/record-types', {
            kind: 'edit',
            id: 'rec-1',
            record: {
                organization_id: '1',
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
            state_at: '2025-01-01T00:00:00.000000Z',
            state_event_id: 'ev-1',
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const record = await GET<{
            name: string;
            description: string;
        }>(db, 'organizations/1/record-types/rec-1', DEV_TOKEN);
        assert.equal(record.name, 'After');
        assert.equal(
            record.description, 'updated',
        );
        const history = await GET<unknown[]>(
            db, 'organizations/1/record-types/rec-1/history', DEV_TOKEN,
        );
        assert.equal(
            history.length, 1,
            'edit must not emit a state event',
        );
    },
);

test(
    'POST nested record-types edit removes'
    + ' attributes by id and adds new ones',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/1/record-types', {
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
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'organizations/1/record-types', {
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
                    options: [],
                    constraints: [],
                },
            ],
            // Echoed from the create's own known head above.
            state: 'active',
            state_at: '2025-01-01T00:00:00.000000Z',
            state_event_id: 'ev-1',
            removedAttributeIds: ['a-old'],
        }, DEV_TOKEN);
        const all = await GET<{
            id: string;
            name: string;
        }[]>(db, 'organizations/1/record-types/rec-1/attributes', DEV_TOKEN);
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'a-new');
        assert.equal(all[0]!.name, 'New');
    },
);

test(
    'POST nested record-types edit updates an'
    + ' existing attribute by upsert',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/1/record-types', {
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
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'organizations/1/record-types', {
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
                    options: [],
                    constraints: [],
                },
            ],
            // Echoed from the create's own known head above.
            state: 'active',
            state_at: '2025-01-01T00:00:00.000000Z',
            state_event_id: 'ev-1',
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const stored = await GET<{
            name: string;
            attribute_type: string;
        }>(
            db,
            'organizations/1/record-types/rec-1'
            + '/attributes/a-1',
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
            () => POST(db, 'organizations/1/record-types', {
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
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
                initialStateEventId: 'ev-1',
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
            () => POST(db, 'organizations/1/record-types', {
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
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
                initialStateEventId: 'ev-1',
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
            () => POST(db, 'organizations/1/record-types', {
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
    'POST nested record-types rejects an invalid'
    + ' initialState',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assert.rejects(
            () => POST(db, 'organizations/1/record-types', {
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
            () => POST(db, 'organizations/1/record-types', {
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
            () => POST(db, 'organizations/1/record-types', {
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
    'POST nested record-types create threads caller'
    + ' initialStateAt to the initial state event',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/1/record-types', {
            kind: 'create',
            id: 'rec-at',
            record: {
                organization_id: '1',
                name: 'Timed Record',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'ev-at',
            // Far-future timestamp forces a distinct, verifiable
            // at value so the test can confirm the caller's time
            // was threaded to the event — not a server nowUtc().
            initialStateAt:
                '2099-07-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7).
        const history = await GET<{
            state: string;
            member_id: string;
            at: string;
        }[]>(db, 'organizations/1/record-types/rec-at/history', DEV_TOKEN);
        assert.equal(history.length, 1);
        const current = history[0]!;
        assert.equal(current.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(current.member_id, 'current');
        // The event carries the caller-supplied at, not server time.
        assert.equal(
            current.at,
            '2099-07-01T00:00:00.000000Z',
        );
    },
);

test(
    'POST nested record-types create ignores a raw colliding states'
    + ' row (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane create.
    // Phase Final Stage B: states table retired.
        await POST(db, 'organizations/1/record-types', {
            kind: 'create',
            id: 'rec-survives',
            record: {
                organization_id: '1',
                name: 'Survives', description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'ev-x',
            initialStateAt:
                '2099-07-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const rec = await GET<{ id: string }>(
            db, 'organizations/1/record-types/rec-survives', DEV_TOKEN,
        );
        assert.equal(rec.id, 'rec-survives');
    },
);
