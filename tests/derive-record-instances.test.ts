import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    formWritePair,
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

const ORGANIZATION = '1';
const TYPE_ID = 'rt-inst-1';
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
    const pair = await formWritePair({
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
        requesterIdentityId: 'current',
        requestAt,
        organization: ORGANIZATION,
        responseStatus: method === 'DELETE' ? 204 : 200,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

async function emptyDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// -- pure: revisionValuesOf ---------------------------------

test(
    'revisionValuesOf reads genesis set dialect',
    () => {
        const values = revisionValuesOf({
            set: [
                val('a', '1'),
                val('b', '2'),
            ],
        });
        assert.deepEqual(values, [
            val('a', '1'),
            val('b', '2'),
        ]);
    },
);

test(
    'revisionValuesOf reads revision values dialect',
    () => {
        const values = revisionValuesOf({
            values: [val('a', '1')],
        });
        assert.deepEqual(values, [val('a', '1')]);
    },
);

test(
    'revisionValuesOf prefers values over set',
    () => {
        const values = revisionValuesOf({
            values: [val('a', '1')],
            set: [val('b', '2')],
        });
        assert.deepEqual(values, [val('a', '1')]);
    },
);

// -- pure: mergeInstanceValues ------------------------------

test(
    'mergeInstanceValues applies set overwrites',
    () => {
        const merged = mergeInstanceValues(
            [val('a', '1'), val('b', '2')],
            { set: [val('a', '3')] },
        );
        assert.deepEqual(merged, [
            val('a', '3'),
            val('b', '2'),
        ]);
    },
);

test(
    'mergeInstanceValues clear removes attribute'
    + ' (ABSENT, not null/empty)',
    () => {
        const merged = mergeInstanceValues(
            [val('a', '3'), val('b', '2')],
            { clear: ['b'] },
        );
        assert.deepEqual(merged, [val('a', '3')]);
        assert.equal(
            merged.some((v) => v.attribute_id === 'b'),
            false,
        );
    },
);

test(
    'mergeInstanceValues clear of already-absent'
    + ' is a no-op',
    () => {
        const head = [val('a', '1')];
        const merged = mergeInstanceValues(
            head,
            { clear: ['z'] },
        );
        assert.deepEqual(merged, head);
    },
);

test(
    'mergeInstanceValues emits attribute_id-lex order',
    () => {
        const merged = mergeInstanceValues(
            [val('z', '1'), val('m', '2')],
            { set: [val('a', '3')] },
        );
        assert.deepEqual(
            merged.map((v) => v.attribute_id),
            ['a', 'm', 'z'],
        );
    },
);

test(
    'mergeInstanceValues applies set then clear',
    () => {
        const merged = mergeInstanceValues(
            [val('a', '1'), val('b', '2')],
            {
                set: [val('a', '3'), val('c', '9')],
                clear: ['b', 'c'],
            },
        );
        assert.deepEqual(merged, [val('a', '3')]);
    },
);

// -- prefix -------------------------------------------------

test(
    'instancesUriPrefix nests under type',
    () => {
        assert.equal(
            instancesUriPrefix(ORGANIZATION, TYPE_ID),
            '/organizations/1/record-types/rt-inst-1'
            + '/instances/',
        );
    },
);

// -- head / collection / revisions --------------------------

test(
    'deriveInstanceHead after genesis PUT only'
    + ' → full set as values',
    async () => {
        const db = await emptyDb();
        const pairId = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                set: [
                    val('a', '1'),
                    val('b', '2'),
                ],
            },
            '2026-01-01T00:00:00.000000Z',
        );
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert.deepEqual(head, {
            id: INST_A,
            pairId,
            values: [
                val('a', '1'),
                val('b', '2'),
            ],
        });
    },
);

test(
    'deriveInstanceHead after revision PUT'
    + ' → full state from NEW head (no fold)',
    async () => {
        const db = await emptyDb();
        const genesisId = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                set: [
                    val('a', '1'),
                    val('b', '2'),
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
                    val('b', '2'),
                ],
            },
            '2026-01-01T00:00:01.000000Z',
            genesisId,
        );
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert.deepEqual(head, {
            id: INST_A,
            pairId: revisionId,
            values: [
                val('a', '3'),
                val('b', '2'),
            ],
        });
    },
);

test(
    'deriveInstanceHead when DELETE is last'
    + ' → undefined',
    async () => {
        const db = await emptyDb();
        const genesisId = await appendInstancePair(
            db, INST_A, 'PUT',
            { set: [val('a', '1')] },
            '2026-01-01T00:00:00.000000Z',
        );
        await appendInstancePair(
            db, INST_A, 'DELETE',
            {},
            '2026-01-01T00:00:02.000000Z',
            genesisId,
        );
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert.equal(head, undefined);
    },
);

test(
    'deriveInstanceHead absent address → undefined',
    async () => {
        const db = await emptyDb();
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, 'no-such',
        );
        assert.equal(head, undefined);
    },
);

test(
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
        const bId = await appendInstancePair(
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
            bId,
        );
        const rows = await deriveInstanceCollection(
            db, ORGANIZATION, TYPE_ID,
        );
        assert.deepEqual(
            rows.map((r) => r.id),
            [INST_A, INST_C],
        );
        assert.deepEqual(rows[0]!.values, [val('x', 'a')]);
        assert.deepEqual(rows[1]!.values, [val('x', 'c')]);
    },
);

test(
    'deriveInstanceRevisions: genesis + 2 patches'
    + ' → 3 full-state ASC; last == head',
    async () => {
        const db = await emptyDb();
        const g0 = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                set: [
                    val('a', '1'),
                    val('b', '2'),
                ],
            },
            '2026-01-01T00:00:00.000000Z',
        );
        const r1 = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                values: [
                    val('a', '3'),
                    val('b', '2'),
                ],
            },
            '2026-01-01T00:00:01.000000Z',
            g0,
        );
        const r2 = await appendInstancePair(
            db, INST_A, 'PUT',
            {
                values: [val('a', '3')],
            },
            '2026-01-01T00:00:02.000000Z',
            r1,
        );
        const revisions = await deriveInstanceRevisions(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert.equal(revisions.length, 3);
        assert.equal(revisions[0]!.pairId, g0);
        assert.deepEqual(revisions[0]!.values, [
            val('a', '1'),
            val('b', '2'),
        ]);
        assert.equal(revisions[1]!.pairId, r1);
        assert.deepEqual(revisions[1]!.values, [
            val('a', '3'),
            val('b', '2'),
        ]);
        assert.equal(revisions[2]!.pairId, r2);
        assert.deepEqual(revisions[2]!.values, [
            val('a', '3'),
        ]);
        // ASC by (at, id); index last matches live head.
        const head = await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert.ok(head !== undefined);
        assert.equal(
            revisions[revisions.length - 1]!.pairId,
            head!.pairId,
        );
        assert.deepEqual(
            revisions[revisions.length - 1]!.values,
            head!.values,
        );
        // Strict ASC timestamps.
        assert.ok(
            revisions[0]!.at <= revisions[1]!.at
            && revisions[1]!.at <= revisions[2]!.at,
        );
    },
);

test(
    'deriveInstanceRevisions empty when tombstoned',
    async () => {
        const db = await emptyDb();
        const g0 = await appendInstancePair(
            db, INST_A, 'PUT',
            { set: [val('a', '1')] },
            '2026-01-01T00:00:00.000000Z',
        );
        await appendInstancePair(
            db, INST_A, 'DELETE',
            {},
            '2026-01-01T00:00:01.000000Z',
            g0,
        );
        const revisions = await deriveInstanceRevisions(
            db, ORGANIZATION, TYPE_ID, INST_A,
        );
        assert.deepEqual(revisions, []);
    },
);

test(
    'deriveInstanceRevisions empty when absent',
    async () => {
        const db = await emptyDb();
        const revisions = await deriveInstanceRevisions(
            db, ORGANIZATION, TYPE_ID, 'no-such',
        );
        assert.deepEqual(revisions, []);
    },
);
