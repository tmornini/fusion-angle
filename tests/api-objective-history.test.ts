import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// GET objectives/versions — Phase A5 collection history.
// Org-prefix scoped bulk StateEntity rows (no field_values),
// (at, id) DESC overall. Always 200 array. Route order is
// load-bearing: literal `history` must win over
// objectives/:id.

const BASE = 'http://localhost';

interface HistoryEvent {
    id: string;
    entity_id: string;
    state: string;
    member_id: string;
    at: string;
}

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

function objectiveBody(
    state: string,
    stateAt: string,
    stateEventId: string,
) {
    return {
        position: 1,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

async function putObjective(
    db: MemoryDbAdapter,
    id: string,
    token: string,
    state: string,
    stateAt: string,
    eventSuffix: string,
): Promise<void> {
    const res = await handleRequest(
        db,
        req(
            'PUT',
            '/objectives/' + id,
            token,
            objectiveBody(
                state, stateAt, id + '-' + eventSuffix,
            ),
        ),
    );
    assert.equal(res.status, 201);
}

test(
    'GET objectives/versions: archive/reactivate/re-archive'
    + ' keeps both archived events; (at, id) DESC',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const id = 'obj-coll-hist-1';

        await putObjective(
            db, id, DEV_TOKEN, 'active',
            '2026-04-01T00:00:00.000000Z', 'ev1',
        );
        await putObjective(
            db, id, DEV_TOKEN, 'archived',
            '2026-04-02T00:00:00.000000Z', 'ev2',
        );
        await putObjective(
            db, id, DEV_TOKEN, 'active',
            '2026-04-03T00:00:00.000000Z', 'ev3',
        );
        await putObjective(
            db, id, DEV_TOKEN, 'archived',
            '2026-04-04T00:00:00.000000Z', 'ev4',
        );

        const res = await handleRequest(
            db,
            req('GET', '/objectives/versions', DEV_TOKEN),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.ok(Array.isArray(rows));

        const forEntity = rows.filter(
            (row) => row.entity_id === id,
        );
        assert.equal(forEntity.length, 4);
        const archived = forEntity.filter(
            (row) => row.state === 'archived',
        );
        assert.equal(archived.length, 2);
        assert.deepEqual(
            archived.map((row) => row.id).sort(),
            [id + '-ev2', id + '-ev4'],
        );
        // Strict DESC on (at, id) overall.
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1]!;
            const cur = rows[i]!;
            const ordered =
                prev.at > cur.at
                || (prev.at === cur.at && prev.id > cur.id);
            assert.ok(
                ordered,
                'collection history must be (at, id) DESC',
            );
        }
        // Index 0 is current (second archive).
        assert.equal(forEntity[0]!.id, id + '-ev4');
        assert.equal(forEntity[0]!.state, 'archived');
    },
);

test(
    'GET objectives/versions: literal history wins over'
    + ' :id; real id still resolves entity; empty → 200 []',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const id = 'obj-coll-hist-route';
        await putObjective(
            db, id, DEV_TOKEN, 'active',
            '2026-04-01T00:00:00.000000Z', 'ev1',
        );

        const collection = await handleRequest(
            db,
            req('GET', '/objectives/versions', DEV_TOKEN),
        );
        assert.equal(collection.status, 200);
        const rows =
            await collection.json() as HistoryEvent[];
        assert.ok(Array.isArray(rows));
        assert.ok(
            rows.some((row) => row.entity_id === id),
        );
        // Not a document miss / not treated as :id=history.
        for (const row of rows) {
            assert.equal(typeof row.entity_id, 'string');
            assert.equal(typeof row.state, 'string');
            assert.equal(
                'field_values' in row, false,
                'trio collection emits StateEntity only',
            );
        }

        // objectives/:id still resolves a real document.
        const entity = await handleRequest(
            db,
            req('GET', '/objectives/' + id, DEV_TOKEN),
        );
        assert.equal(entity.status, 200);
        const body = await entity.json() as { id: string };
        assert.equal(body.id, id);

        // Empty org always 200 [].
        const emptyDb = memoryDbAdapter();
        await seedAdminSchema(emptyDb);
        const empty = await handleRequest(
            emptyDb,
            req('GET', '/objectives/versions', DEV_TOKEN),
        );
        assert.equal(empty.status, 200);
        assert.deepEqual(await empty.json(), []);
    },
);

test(
    'GET objectives/versions org isolation: org B rows'
    + ' absent',
    async () => {
        const db = await seededMockDb();

        const starkId = 'obj-coll-hist-stark';
        const twoId = 'obj-coll-hist-two';
        const tokenTwo = await organizationToken(
            'current', ORGANIZATION_TWO,
        );

        await putObjective(
            db, starkId, DEV_TOKEN, 'active',
            '2026-04-01T00:00:00.000000Z', 'ev1',
        );
        await putObjective(
            db, twoId, tokenTwo, 'active',
            '2026-04-01T00:00:00.000000Z', 'ev1',
        );

        const starkRes = await handleRequest(
            db,
            req('GET', '/objectives/versions', DEV_TOKEN),
        );
        assert.equal(starkRes.status, 200);
        const starkRows =
            await starkRes.json() as HistoryEvent[];
        const starkEntityIds = new Set(
            starkRows.map((row) => row.entity_id),
        );
        assert.ok(starkEntityIds.has(starkId));
        assert.equal(starkEntityIds.has(twoId), false);

        const twoRes = await handleRequest(
            db,
            req('GET', '/objectives/versions', tokenTwo),
        );
        assert.equal(twoRes.status, 200);
        const twoRows =
            await twoRes.json() as HistoryEvent[];
        const twoEntityIds = new Set(
            twoRows.map((row) => row.entity_id),
        );
        assert.ok(twoEntityIds.has(twoId));
        assert.equal(twoEntityIds.has(starkId), false);
    },
);
