import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import {
    formWriteMessagePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    revisionValuesOf,
    mergeInstanceValues,
    deriveInstanceHead,
    deriveInstanceCollection,
    deriveInstanceRevisions,
    instancesUriPrefix,
    type InstanceValue,
} from '../api/derive-record-instances.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

// Instance derive: full-state heads (R5 / Task 14).
// No fold. revisionValuesOf normalizes genesis {set} and
// revision {values}. mergeInstanceValues is pure write-side.

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = 'sleWPUnGznNnXLzcfFswjg';
const INST_A = 'inst-a';
const INST_B = 'inst-b';
const INST_C = 'inst-c';

const ROUTE_PATTERN =
    'organizations/:organization-id/record-types/'
    + ':record-type-id/instances/:instance-id';
const ROUTE_SEGMENTS = [
    'organizations', ':organization-id',
    'record-types', ':record-type-id',
    'instances', ':instance-id',
] as const;

function val(
    attributeId: string,
    value: string,
): InstanceValue {
    return {
        attribute_id: attributeId,
        value,
    };
}

function pathOf(instanceId: string): string {
    return '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_ID
        + '/instances/' + instanceId;
}

async function appendInstancePair(
    db: MemoryDbAdapter,
    instanceId: string,
    method: 'PUT' | 'DELETE',
    body: Record<string, unknown> | undefined,
    requestAt: string,
): Promise<string> {
    const messagePair = await formWriteMessagePair({
        method,
        pathname: pathOf(instanceId),
        routePattern: ROUTE_PATTERN,
        routeSegments: [...ROUTE_SEGMENTS],
        pathSegments: [
            'organizations', ORGANIZATION,
            'record-types', TYPE_ID,
            'instances', instanceId,
        ],
        headerFields: [],
        body: body ?? {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt,
        organization: ORGANIZATION,
        responseStatus: method === 'DELETE' ? 204 : 200,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
    return messagePair.id;
}

async function emptyDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// -- pure: revisionValuesOf ---------------------------------

Deno.test(
    'revisionValuesOf reads genesis set dialect',
    () => {
        const values = revisionValuesOf({
            set: [
                val('a', 'AjdvjuECVZEgZoFajaIEkg'),
                val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
            ],
        });
        assertEquals(values, [
            val('a', 'AjdvjuECVZEgZoFajaIEkg'),
            val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
        ]);
    },
);

Deno.test(
    'revisionValuesOf reads revision values dialect',
    () => {
        const values = revisionValuesOf({
            values: [val('a', 'AjdvjuECVZEgZoFajaIEkg')],
        });
        assertEquals(values, [val('a', 'AjdvjuECVZEgZoFajaIEkg')]);
    },
);

Deno.test(
    'revisionValuesOf prefers values over set',
    () => {
        const values = revisionValuesOf({
            values: [val('a', 'AjdvjuECVZEgZoFajaIEkg')],
            set: [val('b', 'BBjWJsjYIDkTRKIIPrzWRw')],
        });
        assertEquals(values, [val('a', 'AjdvjuECVZEgZoFajaIEkg')]);
    },
);

// -- pure: mergeInstanceValues ------------------------------

Deno.test(
    'mergeInstanceValues applies set overwrites',
    () => {
        const merged = mergeInstanceValues(
            [val('a', 'AjdvjuECVZEgZoFajaIEkg'), val('b'
                , 'BBjWJsjYIDkTRKIIPrzWRw')],
            { set: [val('a', '3')] },
        );
        assertEquals(merged, [
            val('a', '3'),
            val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
        ]);
    },
);

Deno.test(
    'mergeInstanceValues clear removes attribute'
    + ' (ABSENT, not null/empty)',
    () => {
        const merged = mergeInstanceValues(
            [val('a', '3'), val('b', 'BBjWJsjYIDkTRKIIPrzWRw')],
            { clear: ['b'] },
        );
        assertEquals(merged, [val('a', '3')]);
        assertStrictEquals(
            merged.some((v) => v.attribute_id === 'b'),
            false,
        );
    },
);

Deno.test(
    'mergeInstanceValues clear of already-absent'
    + ' is a no-op',
    () => {
        const head = [val('a', 'AjdvjuECVZEgZoFajaIEkg')];
        const merged = mergeInstanceValues(
            head,
            { clear: ['z'] },
        );
        assertEquals(merged, head);
    },
);

Deno.test(
    'mergeInstanceValues emits attribute_id-lex order',
    () => {
        const merged = mergeInstanceValues(
            [val('z', 'AjdvjuECVZEgZoFajaIEkg'), val('m'
                , 'BBjWJsjYIDkTRKIIPrzWRw')],
            { set: [val('a', '3')] },
        );
        assertEquals(
            merged.map((v) => v.attribute_id),
            ['a', 'm', 'z'],
        );
    },
);

Deno.test(
    'mergeInstanceValues applies set then clear',
    () => {
        const merged = mergeInstanceValues(
            [val('a', 'AjdvjuECVZEgZoFajaIEkg'), val('b'
                , 'BBjWJsjYIDkTRKIIPrzWRw')],
            {
                set: [val('a', '3'), val('c', '9')],
                clear: ['b', 'c'],
            },
        );
        assertEquals(merged, [val('a', '3')]);
    },
);

// -- prefix -------------------------------------------------

Deno.test(
    'instancesUriPrefix nests under type',
    () => {
        assertStrictEquals(
            instancesUriPrefix(ORGANIZATION, TYPE_ID),
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'sleWPUnGznNnXLzcfFswjg'
            + '/instances/',
        );
    },
);

// -- head / collection / revisions --------------------------

Deno.test(
    'deriveInstanceHead after genesis PUT only'
    + ' → full set as values',
    async () => {
        const db = await emptyDb();
        const messagePairId = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                set: [
                    val('a', 'AjdvjuECVZEgZoFajaIEkg'),
                    val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
                ],
            },
            '2026-01-01T00:00:00.000000Z',
        );
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assertEquals(head, {
            id: INST_A,
            messagePairId,
            values: [
                val('a', 'AjdvjuECVZEgZoFajaIEkg'),
                val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
            ],
        });
    },
);

Deno.test(
    'deriveInstanceHead after revision PUT'
    + ' → full state from NEW head (no fold)',
    async () => {
        const db = await emptyDb();
        await appendInstancePair(
            db, INST_A, 'PUT',
            {
                set: [
                    val('a', 'AjdvjuECVZEgZoFajaIEkg'),
                    val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
                ],
            },
            '2026-01-01T00:00:00.000000Z',
        );
        // Storage revision: full state under {values}, not
        // a delta. Writer already merged (Task 17); derive
        // reads the head pair alone.
        const revisionId = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                values: [
                    val('a', '3'),
                    val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
                ],
            },
            '2026-01-01T00:00:01.000000Z',
        );
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assertEquals(head, {
            id: INST_A,
            messagePairId: revisionId,
            values: [
                val('a', '3'),
                val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
            ],
        });
    },
);

Deno.test(
    'deriveInstanceHead when DELETE is last'
    + ' → undefined',
    async () => {
        const db = await emptyDb();
        await appendInstancePair(
            db, INST_A, 'PUT',
            { set: [val('a', 'AjdvjuECVZEgZoFajaIEkg')] },
            '2026-01-01T00:00:00.000000Z',
        );
        await appendInstancePair(
            db, INST_A, 'DELETE',
            {},
            '2026-01-01T00:00:02.000000Z',
        );
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assertStrictEquals(head, undefined);
    },
);

Deno.test(
    'deriveInstanceHead absent address → undefined',
    async () => {
        const db = await emptyDb();
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, 'no-such',
        );
        assertStrictEquals(head, undefined);
    },
);

Deno.test(
    'deriveInstanceCollection: two live + one'
    + ' tombstoned → two rows, id-lex',
    async () => {
        const db = await emptyDb();
        // INST_C, INST_A live; INST_B tombstoned. Insert out
        // of id order so the derive sort is load-bearing.
        await appendInstancePair(
            db, INST_C, 'PUT',
            { set: [val('x', 'c')] },
            '2026-01-01T00:00:00.000000Z',
        );
        await appendInstancePair(
            db, INST_B, 'PUT',
            { set: [val('x', 'b')] },
            '2026-01-01T00:00:01.000000Z',
        );
        await appendInstancePair(
            db, INST_A, 'PUT',
            { set: [val('x', 'a')] },
            '2026-01-01T00:00:02.000000Z',
        );
        await appendInstancePair(
            db, INST_B, 'DELETE',
            {},
            '2026-01-01T00:00:03.000000Z',
        );
        const rows = await deriveInstanceCollection(
            db, ORGANIZATION, TYPE_ID,
        );
        assertEquals(
            rows.map((r) => r.id),
            [INST_A, INST_C],
        );
        assertEquals(rows[0]!.values, [val('x', 'a')]);
        assertEquals(rows[1]!.values, [val('x', 'c')]);
    },
);

Deno.test(
    'deriveInstanceRevisions: genesis + 2 patches'
    + ' → 3 full-state ASC; last == head',
    async () => {
        const db = await emptyDb();
        const g0 = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                set: [
                    val('a', 'AjdvjuECVZEgZoFajaIEkg'),
                    val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
                ],
            },
            '2026-01-01T00:00:00.000000Z',
        );
        const r1 = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                values: [
                    val('a', '3'),
                    val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
                ],
            },
            '2026-01-01T00:00:01.000000Z',
        );
        const r2 = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                values: [val('a', '3')],
            },
            '2026-01-01T00:00:02.000000Z',
        );
        const revisions = await deriveInstanceRevisions(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assertStrictEquals(revisions.length, 3);
        assertStrictEquals(revisions[0]!.messagePairId, g0);
        assertEquals(revisions[0]!.values, [
            val('a', 'AjdvjuECVZEgZoFajaIEkg'),
            val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
        ]);
        assertStrictEquals(
            revisions[1]!.messagePairId, r1,
        );
        assertEquals(revisions[1]!.values, [
            val('a', '3'),
            val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
        ]);
        assertStrictEquals(revisions[2]!.messagePairId, r2);
        assertEquals(revisions[2]!.values, [
            val('a', '3'),
        ]);
        // ASC by (at, id); index last matches live head.
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert(head !== undefined);
        assertStrictEquals(
            revisions[revisions.length - 1]!.messagePairId,
            head!.messagePairId,
        );
        assertEquals(
            revisions[revisions.length - 1]!.values,
            head!.values,
        );
        // Strict ASC timestamps.
        assert(
            revisions[0]!.at <= revisions[1]!.at
            && revisions[1]!.at <= revisions[2]!.at,
        );
    },
);

Deno.test(
    'deriveInstanceRevisions empty when tombstoned',
    async () => {
        const db = await emptyDb();
        await appendInstancePair(
            db, INST_A, 'PUT',
            { set: [val('a', 'AjdvjuECVZEgZoFajaIEkg')] },
            '2026-01-01T00:00:00.000000Z',
        );
        await appendInstancePair(
            db, INST_A, 'DELETE',
            {},
            '2026-01-01T00:00:01.000000Z',
        );
        const revisions = await deriveInstanceRevisions(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assertEquals(revisions, []);
    },
);

Deno.test(
    'deriveInstanceRevisions empty when absent',
    async () => {
        const db = await emptyDb();
        const revisions = await deriveInstanceRevisions(
            db, ORGANIZATION, TYPE_ID, 'no-such',
        );
        assertEquals(revisions, []);
    },
);
