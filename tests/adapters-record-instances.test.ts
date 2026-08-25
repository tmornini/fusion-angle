import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    postRecordChange,
} from '../web-app/app/adapters/records.ts';
import {
    getRecordInstances,
    getRecordInstance,
    putRecordInstance,
    patchRecordInstance,
    deleteRecordInstance,
    getRecordInstanceHistory,
} from '../web-app/app/adapters/record-instances.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../api/http-errors.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Adapter instances surface (Task 21): create → list →
// patch(with etag) → 412-on-stale → re-read → retry →
// delete → history. Nested under org record-types.

const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();

async function seededCtx() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    await postRecordChange(ctx, TYPE_ID, {
        kind: 'create',
        record: {
            name: 'Rental',
            description: '',
            position: 1,
        },
        attributes: [
            {
                id: ATTR_ID,
                record_id: TYPE_ID,
                name: 'Title',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
            },
        ],
        initialState: 'active',
    });
    return { db, ctx };
}

test(
    'instance create → list → patch → 412 → retry →'
    + ' delete → history',
    async () => {
        const { ctx } = await seededCtx();

        // create
        const created = await putRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID, [
                {
                    attributeId: ATTR_ID,
                    value: 'v0',
                },
            ],
        );
        assert.ok(created.etag.length > 0);

        // list embeds etag
        const list = await getRecordInstances(
            ctx, TYPE_ID,
        );
        assert.equal(list.length, 1);
        assert.equal(list[0]!.id, INSTANCE_ID);
        assert.equal(list[0]!.etag, created.etag);
        assert.equal(
            list[0]!.values.get(ATTR_ID), 'v0',
        );

        // detail header etag matches list
        const detail = await getRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID,
        );
        assert.equal(detail.etag, created.etag);
        assert.equal(
            detail.values.get(ATTR_ID), 'v0',
        );

        // patch with etag
        const patched = await patchRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID, detail.etag, {
                set: [
                    {
                        attributeId: ATTR_ID,
                        value: 'xDyDkxEPwtcNmJVknUHDsg',
                    },
                ],
            },
        );
        assert.notEqual(patched.etag, detail.etag);

        // stale If-Match → 412 (no auto-retry)
        await assert.rejects(
            () => patchRecordInstance(
                ctx, TYPE_ID, INSTANCE_ID,
                detail.etag, {
                    set: [
                        {
                            attributeId: ATTR_ID,
                            value: 'stale',
                        },
                    ],
                },
            ),
            (err: unknown) => {
                assert.ok(err instanceof RequestError);
                assert.equal(
                    err.status,
                    HTTP_PRECONDITION_FAILED,
                );
                return true;
            },
        );

        // re-read → retry with fresh etag
        const fresh = await getRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID,
        );
        assert.equal(fresh.etag, patched.etag);
        const retried = await patchRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID, fresh.etag, {
                set: [
                    {
                        attributeId: ATTR_ID,
                        value: 'v2',
                    },
                ],
            },
        );
        assert.notEqual(retried.etag, fresh.etag);

        const afterRetry = await getRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID,
        );
        assert.equal(
            afterRetry.values.get(ATTR_ID), 'v2',
        );
        assert.equal(afterRetry.etag, retried.etag);

        // history DESC: head first
        const history = await getRecordInstanceHistory(
            ctx, TYPE_ID, INSTANCE_ID,
        );
        assert.ok(history.length >= 3);
        assert.equal(history[0]!.etag, retried.etag);
        assert.equal(
            history[0]!.values.get(ATTR_ID), 'v2',
        );

        // delete → list empty; detail 404
        await deleteRecordInstance(
            ctx, TYPE_ID, INSTANCE_ID,
        );
        const afterDelete = await getRecordInstances(
            ctx, TYPE_ID,
        );
        assert.equal(afterDelete.length, 0);
        await assert.rejects(
            () => getRecordInstance(
                ctx, TYPE_ID, INSTANCE_ID,
            ),
            /Not found/,
        );
    },
);

test(
    'InstanceHistoryWire has no version; etag is'
    + ' not 64-hex',
    () => {
        const src = readFileSync(
            'web-app/app/adapters/record-instances.ts',
            'utf8',
        );
        const start = src.indexOf(
            'interface InstanceHistoryWire',
        );
        assert.ok(start >= 0);
        const wire = src.slice(
            start,
            src.indexOf('function instancesPath'),
        );
        assert.doesNotMatch(wire, /\bversion\b/);
        assert.doesNotMatch(src, /64-hex/);
    },
);
