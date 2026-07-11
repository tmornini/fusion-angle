import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../api/types.ts';
import { deriveObjectiveStateHistory } from
    '../api/derive-objectives.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

// Objectives' own state-history reduction (states-address
// retirement): unit-level trio walk + echo dedup, and the
// deriveStatesFor union leg that serves GET /entity-states/:id/
// history. Uses seedAdminSchema (not postMockDataLoad) so the
// suite stays self-contained; seeded genesis lives in
// mock-data/drift pins. Writes go through the live gate.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('deriveObjectiveStateHistory returns the trio walk in'
+ ' (state_at, id) order with echo dedup', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'obj-derive-1';
    const genesisAt = nowUtc();
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 1, state: 'active',
            state_at: genesisAt, state_event_id: id + '-ev1',
        },
    ));
    const archiveAt = nowUtc();
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 1, state: 'archived',
            state_at: archiveAt, state_event_id: id + '-ev2',
        },
    ));
    // a byte-identical echo of ev2 (drag-reorder style
    // re-put) must NOT mint a third event
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 2, state: 'archived',
            state_at: archiveAt, state_event_id: id + '-ev2',
        },
    ));
    const history = await deriveObjectiveStateHistory(
        db, STARK_ORGANIZATION, id,
    );
    assert.deepEqual(
        history.map((r) => [r.id, r.state]),
        [[id + '-ev1', 'active'], [id + '-ev2', 'archived']],
    );
});

test('GET /entity-states/:id/history carries the objective'
+ ' trio rows (deriveStatesFor union)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'obj-derive-history-1';
    const genesisAt = nowUtc();
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 1, state: 'active',
            state_at: genesisAt, state_event_id: id + '-ev1',
        },
    ));
    const archiveAt = nowUtc();
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 1, state: 'archived',
            state_at: archiveAt, state_event_id: id + '-ev2',
        },
    ));
    const res = await handleRequest(db, req(
        'GET', '/entity-states/' + id + '/history', token,
    ));
    assert.equal(res.status, 200);
    const rows = JSON.parse(await res.text());
    assert.equal(rows.length, 2);
});
