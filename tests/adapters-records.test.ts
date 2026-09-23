import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
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
import { generateIdentifier } from
    '../shared/identifier.ts';

Deno.test(
    'postRecordChange create writes the row and'
    + ' the initial state event',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        await postRecordChange(ctx, 'rbfHGatkwQzGZJVXKJEeyw', {
            kind: 'create',
            record: {
                name: 'Customer',
                description: 'A customer record',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        const stored = await getRecord(ctx, 'rbfHGatkwQzGZJVXKJEeyw');
        assertStrictEquals(stored.id, 'rbfHGatkwQzGZJVXKJEeyw');
        assertStrictEquals(stored.name, 'Customer');
        assertStrictEquals(stored.state, 'active');
    },
);

Deno.test(
    'postRecordChange create writes attributes'
    + ' alongside the record',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        await postRecordChange(ctx, 'rbfHGatkwQzGZJVXKJEeyw', {
            kind: 'create',
            record: {
                name: 'Q',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
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
        >(
            'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/',
        );
        assertStrictEquals(attrs.length, 1);
        assertStrictEquals(attrs[0]!.name, 'Fee');
    },
);

Deno.test(
    'putRecord overwrites an existing row',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        await postRecordChange(ctx, 'rbfHGatkwQzGZJVXKJEeyw', {
            kind: 'create',
            record: {
                name: 'A',
                description: 'first',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        await putRecord(ctx, 'rbfHGatkwQzGZJVXKJEeyw', {
            name: 'B',
            description: 'second',
            position: 1,
            state: 'active',
        });
        const stored = await getRecord(ctx, 'rbfHGatkwQzGZJVXKJEeyw');
        assertStrictEquals(stored.name, 'B');
        assertStrictEquals(stored.description, 'second');
    },
);

Deno.test(
    'postRecordChange edit of an unchanged'
    + ' record stores nothing',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const recordId = 'rbfHGatkwQzGZJVXKJEeyw';
        const oldAttrId = generateIdentifier();
        const newAttrId = generateIdentifier();
        await postRecordChange(ctx, recordId, {
            kind: 'create',
            record: {
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: oldAttrId,
                    record_id: recordId,
                    name: 'Old',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        });
        // Echo the create's own known head. The new
        // attribute and the removal are siblings of
        // that match, so the statement stores nothing.
        const head = await getRecordModel(ctx, recordId);
        const before =
            (await db.messagePairs.getAll()).length;
        await postRecordChange(ctx, recordId, {
            kind: 'edit',
            record: {
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: newAttrId,
                    record_id: recordId,
                    name: 'New',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            state: head.stateValue(),
            removedAttributeIds: [oldAttrId],
        });
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before,
        );
        const after = await getRecord(ctx, recordId);
        assertStrictEquals(after.name, 'R');
        assertStrictEquals(after.description, '');
        assertStrictEquals(
            after.state, head.stateValue(),
        );
        const attrs = await ctx.GET<
            { id: string; name: string }[]
        >(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/record-types/' + recordId
                + '/attributes/',
        );
        assertStrictEquals(attrs.length, 1);
        assertStrictEquals(attrs[0]!.id, oldAttrId);
        assertStrictEquals(attrs[0]!.name, 'Old');
    },
);

Deno.test(
    'getRecords excludes records whose latest'
    + ' state event is deleted',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        await postRecordChange(ctx, 'rbfHGatkwQzGZJVXKJEeyw', {
            kind: 'create',
            record: {
                name: 'Keep',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        await postRecordChange(ctx, 'rcaSzEaORBkezCxyhLhecA', {
            kind: 'create',
            record: {
                name: 'Drop',
                description: '',
                position: 2,
            },
            attributes: [],
            initialState: 'active',
        });
        const rec2 = await getRecord(ctx, 'rcaSzEaORBkezCxyhLhecA');
        await postRecordStateChange(
            ctx, rec2, 'deleted',
        );
        const records = await getRecords(ctx);
        const ids = records
            .map(r => r.record.idForLink())
            .sort();
        assertEquals(ids, ['rbfHGatkwQzGZJVXKJEeyw']);
    },
);

Deno.test(
    'postRecordStateChange changes state without'
    + ' changing entity fields on GET',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        await postRecordChange(ctx, 'rbfHGatkwQzGZJVXKJEeyw', {
            kind: 'create',
            record: {
                name: 'X',
                description: 'orig',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        const before = await getRecord(ctx, 'rbfHGatkwQzGZJVXKJEeyw');
        await postRecordStateChange(
            ctx, before, 'archived',
        );
        const after = await getRecord(ctx, 'rbfHGatkwQzGZJVXKJEeyw');
        // Entity content fields unchanged; GET state advances
        // to the transition event (lifecycle-current stamp).
        assertStrictEquals(after.name, before.name);
        assertStrictEquals(after.description, 'orig');
        assertStrictEquals(after.position, before.position);
        assertStrictEquals(after.state, 'archived');
        const model = await getRecordModel(
            ctx, 'rbfHGatkwQzGZJVXKJEeyw',
        );
        assertStrictEquals(model.stateValue(), 'archived');
    },
);

// getRecordState (the retired per-entity history reader) is
// deleted — production-dead. Its throws-on-absence force
// re-homes onto getRecordModel: a missing record is a GET
// miss (Not found), not a dual-plane "no state event".
Deno.test(
    'getRecordModel rejects a missing record',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await assertRejects(
            () => getRecordModel(ctx, generateIdentifier()),
            Error,
            'Not found',
        );
    },
);

// Former adapters-state-events pin: bulk record lifecycle
// is the GET-stamped row collection — an idea with an
// overlapping alphabet value must not appear as a record.
Deno.test(
    'getRecords excludes a same-valued idea',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        await postRecordChange(ctx, 'rOEPOcVMQdJiiiMuiiEhlg', {
            kind: 'create',
            record: {
                name: 'R',
                description: 'd',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        });
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'fndCYAsXazdzMUlEGMNIZw', {
            title: 'I',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'archived',
        });
        const rows = await getRecords(ctx);
        const ids = rows.map(
            r => r.record.idForLink(),
        );
        assert(ids.includes('rOEPOcVMQdJiiiMuiiEhlg'));
        assert(
            !ids.includes('fndCYAsXazdzMUlEGMNIZw'),
            'idea must not leak into records',
        );
    },
);
