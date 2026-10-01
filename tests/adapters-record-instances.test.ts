import {
    assert,
    assertInstanceOf,
    assertNotMatch,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import type { RequestContext } from
    '../client/request-context.ts';
import { responseMessage } from './fixtures/response-message.ts';
import { inPageContext } from './in-page-facade.ts';
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
    return { db, ctx };
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
        const createdEtag = created.query('header.etag')
            .toText().slice(1, -1);
        assert(createdEtag.length > 0);

        // list embeds etag
        const list = await getRecordInstances(
            ctx(), TYPE_ID,
        );
        assertStrictEquals(list.length, 1);
        assertStrictEquals(list[0]!.id, INSTANCE_ID);
        assertStrictEquals(list[0]!.etag, createdEtag);
        assertStrictEquals(
            list[0]!.values.get(ATTR_ID), 'v0',
        );

        // detail header etag matches list
        const detail = await getRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assertStrictEquals(detail.instance.etag, createdEtag);
        assertStrictEquals(
            detail.instance.values.get(ATTR_ID), 'v0',
        );

        // patch latching the head
        const patched = await patchRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID, detail.read, {
                set: [
                    {
                        attributeId: ATTR_ID,
                        value: 'xDyDkxEPwtcNmJVknUHDsg',
                    },
                ],
            },
        );
        const patchedEtag = patched.query('header.etag')
            .toText().slice(1, -1);
        assertNotStrictEquals(patchedEtag, detail.instance.etag);

        // stale If-Match → 412 (no auto-retry)
        const err = await assertRejects(
            () => patchRecordInstance(
                ctx(), TYPE_ID, INSTANCE_ID,
                detail.read, {
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
        assertStrictEquals(fresh.instance.etag, patchedEtag);
        const retried = await patchRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID, fresh.read, {
                set: [
                    {
                        attributeId: ATTR_ID,
                        value: 'v2',
                    },
                ],
            },
        );
        const retriedEtag = retried.query('header.etag')
            .toText().slice(1, -1);
        assertNotStrictEquals(retriedEtag, fresh.instance.etag);

        const afterRetry = await getRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assertStrictEquals(
            afterRetry.instance.values.get(ATTR_ID), 'v2',
        );
        assertStrictEquals(afterRetry.instance.etag, retriedEtag);

        // history DESC: head first
        const history = await getRecordInstanceHistory(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
        assert(history.length >= 3);
        assertStrictEquals(history[0]!.etag, retriedEtag);
        assertStrictEquals(
            history[0]!.values.get(ATTR_ID), 'v2',
        );

        // delete → list empty; a retired instance's detail
        // answers 410
        await deleteRecordInstance(
            ctx(), TYPE_ID, INSTANCE_ID,
        );
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

// A list row carries its tag in the body until T30; a row
// whose tag is empty leaves nothing to latch and is refused,
// as a row with no tag is.
Deno.test(
    'getRecordInstances refuses a list row whose tag is empty',
    async () => {
        const ctx = {
            identity: { organization: 'AjdvjuECVZEgZoFajaIEkg' },
            GET: () => Promise.resolve(responseMessage([{
                id: INSTANCE_ID,
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_type_id: TYPE_ID,
                values: [],
                etag: '',
            }])),
        } as unknown as RequestContext;
        await assertRejects(
            () => getRecordInstances(ctx, TYPE_ID),
            Error,
            'carried no ETag',
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
