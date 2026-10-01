import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertNotMatch,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    postRecordChange,
} from '../client/records.ts';
import {
    getRecordInstances,
    getRecordInstance,
    putRecordInstance,
    patchRecordInstance,
    deleteRecordInstance,
    getRecordInstanceHistory,
} from '../client/record-instances.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../shared/http-errors.ts';
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
    const token = await organizationToken();
    // One context is one operation. The instance
    // revision join still keys a write's sibling by
    // operation-id, so each call mints its own.
    const ctx = () => inPageContext(db, token);
    await postRecordChange(ctx(), TYPE_ID, {
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
    return { db, token, ctx };
}

Deno.test(
    'instance create → list → patch → 412 → retry →'
    + ' delete → history',
    async () => {
        const { ctx } = await seededCtx();

        // create
        const created = await putRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID, [
                {
                    attributeId: ATTR_ID,
                    value: 'v0',
                },
            ],
        );
        const createdEtag = created.message
            .query('header.etag').toText();
        assert(createdEtag.length > 0);

        // each list row keeps its part, whose etag line
        // names the head
        const list = await getRecordInstances(
            ctx(), TYPE_ID,
        );
        assertStrictEquals(list.length, 1);
        assertStrictEquals(list[0]!.id, INSTANCE_ID);
        assertStrictEquals(
            list[0]!.message.query('header.etag').toText(),
            createdEtag,
        );
        assertStrictEquals(
            list[0]!.values.get(ATTR_ID), 'v0',
        );

        // detail header etag matches list
        const detail = await getRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assertStrictEquals(
            detail.message.query('header.etag').toText(),
            createdEtag,
        );
        assertStrictEquals(
            detail.values.get(ATTR_ID), 'v0',
        );

        // patch latching the head
        const patched = await patchRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID, detail.message, {
                set: [
                    {
                        attributeId: ATTR_ID,
                        value: 'xDyDkxEPwtcNmJVknUHDsg',
                    },
                ],
            },
        );
        const patchedEtag = patched.query('header.etag')
            .toText();
        assertNotStrictEquals(
            patchedEtag,
            detail.message.query('header.etag').toText(),
        );

        // stale If-Match → 412 (no auto-retry)
        const err = await assertRejects(
            () => patchRecordInstance(
                ctx(), TYPE_ID, INSTANCE_ID,
                detail.message, {
                    set: [
                        {
                            attributeId: ATTR_ID,
                            value: 'stale',
                        },
                    ],
                },
            ),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, HTTP_PRECONDITION_FAILED);

        // re-read → retry latching the fresh head
        const fresh = await getRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assertStrictEquals(
            fresh.message.query('header.etag').toText(),
            patchedEtag,
        );
        const retried = await patchRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID, fresh.message, {
                set: [
                    {
                        attributeId: ATTR_ID,
                        value: 'v2',
                    },
                ],
            },
        );
        const retriedEtag = retried.query('header.etag')
            .toText();
        assertNotStrictEquals(
            retriedEtag,
            fresh.message.query('header.etag').toText(),
        );

        const afterRetry = await getRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assertStrictEquals(
            afterRetry.values.get(ATTR_ID), 'v2',
        );
        assertStrictEquals(
            afterRetry.message.query('header.etag').toText(),
            retriedEtag,
        );

        // history DESC: head first
        const history = await getRecordInstanceHistory(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assert(history.length >= 3);
        assertStrictEquals(
            '"' + history[0]!.etag + '"', retriedEtag,
        );
        assertStrictEquals(
            history[0]!.values.get(ATTR_ID), 'v2',
        );

        // delete → list empty; a retired instance's detail
        // answers 410
        await deleteRecordInstance(ctx(), afterRetry);
        const afterDelete = await getRecordInstances(
            ctx(), TYPE_ID,
        );
        assertStrictEquals(afterDelete.length, 0);
        await assertRejects(
            () => getRecordInstance(
                ctx(), TYPE_ID, INSTANCE_ID,
            ),
            Error,
            'Gone',
        );
    },
);

Deno.test(
    'deleteRecordInstance latches the row it was handed',
    async () => {
        const { db, token, ctx } = await seededCtx();
        await putRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
            [{ attributeId: ATTR_ID, value: 'v0' }],
        );
        const { ctx: recorded, sent } =
            recordedContext(db, token);
        const [held] = await getRecordInstances(
            recorded, TYPE_ID,
        );
        assert(held !== undefined, 'the list holds the row');
        sent.length = 0;
        await deleteRecordInstance(recorded, held);
        assertEquals(
            sent.map((r) => [r.method, r.ifMatch]),
            [['DELETE', held.message.query('header.etag').toText()]],
        );
    },
);

Deno.test(
    'InstanceHistoryWire has no version; etag is'
    + ' not 64-hex',
    () => {
        const src = Deno.readTextFileSync(
            'client/record-instances.ts',
        );
        const start = src.indexOf(
            'interface InstanceHistoryWire',
        );
        assert(start >= 0);
        const wire = src.slice(
            start,
            src.indexOf('function instancesPath'),
        );
        assertNotMatch(wire, /\bversion\b/);
        assertNotMatch(src, /64-hex/);
    },
);
