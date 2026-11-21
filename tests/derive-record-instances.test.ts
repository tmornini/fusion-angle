import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    runWrite,
    attemptFor,
    formWriteMessagePair,
} from '../api/message-pair.ts';
import {
    revisionValuesOf,
    mergeInstanceValues,
    deriveInstanceHead,
    deriveInstanceCollection,
    instancesUriPrefix,
    type InstanceValue,
} from '../api/derive-record-instances.ts';
import {
    selectVersionsAt,
} from '../api/head-reads.ts';
import { servedBodyOf } from '../api/served-response.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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
        responseBody: method === 'DELETE'
            ? undefined
            : body,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    )
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
    'deriveInstanceHead absent document → undefined',
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
    'instance versions: genesis + 2 patches'
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
        const versions = await selectVersionsAt(
            db,
            instancesUriPrefix(ORGANIZATION, TYPE_ID),
            INST_A,
            'stateless',
            'record_instances',
            { sees: 'whole' },
            () => Promise.reject(new Error('missing instance')),
        );
        assert(versions.kind === 'versions');
        const pairs = versions.pairs;
        const valuesOf = (index: number) => revisionValuesOf(
            servedBodyOf(pairs[index]!, { sees: 'whole' }),
        );
        assertStrictEquals(pairs.length, 3);
        assertStrictEquals(pairs[0]!.id, g0);
        assertEquals(valuesOf(0), [
            val('a', 'AjdvjuECVZEgZoFajaIEkg'),
            val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
        ]);
        assertStrictEquals(pairs[1]!.id, r1);
        assertEquals(valuesOf(1), [
            val('a', '3'),
            val('b', 'BBjWJsjYIDkTRKIIPrzWRw'),
        ]);
        assertStrictEquals(pairs[2]!.id, r2);
        assertEquals(valuesOf(2), [val('a', '3')]);
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert(head !== undefined);
        assertStrictEquals(
            pairs[pairs.length - 1]!.id,
            head!.messagePairId,
        );
        assertEquals(valuesOf(2), head!.values);
        assert(
            pairs[0]!.response_at <= pairs[1]!.response_at
            && pairs[1]!.response_at
                <= pairs[2]!.response_at,
        );
    },
);
