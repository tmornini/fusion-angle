import { test } from 'node:test';
import { deriveRecordStateHistory } from
    '../api/derive-records.ts';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    getRecord,
    getRecordModel,
    getRecords,
    putRecord,
    postRecordChange,
    postRecordStateChange,
} from '../web-app/app/adapters/records.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

test(
    'postRecordChange create writes the row and'
    + ' the initial state event',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
        // Lifecycle-current trio is stamped on the GET row.
        assert.equal(stored.state, 'active');
    },
);

test(
    'postRecordChange create writes attributes'
    + ' alongside the record',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
                    options: [],
                    constraints: [],
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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
            state: 'active',
            stateAt: '2026-01-02T00:00:00.000000Z',
            stateEventId: 'ev-rec-1-b',
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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        });
        // Echo the create's own known head from the GET row
        // trio — never a fresh mint (RecordChangeEdit).
        const head = await getRecordModel(ctx, 'rec-1');
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
                    options: [],
                    constraints: [],
                },
            ],
            state: head.stateValue(),
            stateAt: head.stateAtValue(),
            stateEventId: head.stateEventIdValue(),
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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
        const rec2 = await getRecord(ctx, 'rec-2');
        await postRecordStateChange(
            ctx, rec2, 'deleted',
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
    + ' without changing non-lifecycle entity fields'
    + ' on GET',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
        const before = await getRecord(ctx, 'rec-1');
        await postRecordStateChange(
            ctx, before, 'archived',
        );
        const after = await getRecord(ctx, 'rec-1');
        // Entity content fields unchanged; GET trio advances
        // to the transition event (lifecycle-current stamp).
        assert.equal(after.name, before.name);
        assert.equal(after.description, 'orig');
        assert.equal(after.position, before.position);
        assert.equal(after.state, 'archived');
        assert.notEqual(
            after.state_event_id, before.state_event_id,
        );
        const model = await getRecordModel(
            ctx, 'rec-1',
        );
        assert.equal(model.stateValue(), 'archived');
        const events = await deriveRecordStateHistory(db, '1', 'rec-1');
        assert.equal(
            after.state_event_id, events.at(-1)?.id,
        );
        assert.equal(
            after.state_at, events.at(-1)?.at,
        );
    },
);

// getRecordState (the retired per-entity history reader) is
// deleted — production-dead. Its throws-on-absence force
// re-homes onto getRecordModel: a missing record is a GET
// miss (Not found), not a dual-plane "no state event".
test(
    'getRecordModel rejects a missing record',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await assert.rejects(
            () => getRecordModel(ctx, 'rec-missing'),
            /Not found/,
        );
    },
);

// Former adapters-state-events pin: bulk record lifecycle
// is the GET-stamped row collection — an idea with an
// overlapping alphabet value must not appear as a record.
test(
    'getRecords excludes a same-valued idea',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        await postRecordChange(ctx, 'r1', {
            kind: 'create',
            record: {
                name: 'R',
                description: 'd',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        await ctx.PUT('ideas/i1', {
            title: 'I',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'archived',
            state_at: '2026-01-01T00:00:01.000000Z',
            state_event_id: 'ev-i1',
        });
        const rows = await getRecords(ctx);
        const ids = rows.map(
            r => r.record.idForLink(),
        );
        assert.ok(ids.includes('r1'));
        assert.ok(
            !ids.includes('i1'),
            'idea must not leak into records',
        );
    },
);

test(
    'state events for records land in the unified'
    + ' states log',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
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
        const rec1 = await getRecord(ctx, 'rec-1');
        await postRecordStateChange(
            ctx, rec1, 'archived',
        );
        const events = await deriveRecordStateHistory(db, '1',
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
