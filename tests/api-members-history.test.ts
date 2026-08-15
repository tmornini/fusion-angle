import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// GET members/:id/versions — Phase A4 of states-URI
// elimination. Re-homes the api-actor-from-token authorship
// covenant: PUT members/:id archive stamps actor as
// member_id on the history event. Global-family miss posture:
// empty → EntityNotFoundError('members', id) → 404 (not
// missedReadError). Wire: StateEntity (at, id) DESC.

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

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function assertDesc(rows: HistoryEvent[]): void {
    for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]!;
        const cur = rows[i]!;
        const ordered =
            prev.at > cur.at
            || (prev.at === cur.at && prev.id > cur.id);
        assert.ok(
            ordered,
            'history must be (at, id) DESC',
        );
    }
}

test(
    'GET members/:id/versions: archive authored by token',
    async () => {
        const db = await freshDb();
        await seedHumanMember(db, 'current', 'Demo');
        const put = await handleRequest(
            db,
            req(
                'PUT',
                '/members/current',
                DEV_TOKEN,
                {
                    type: 'human',
                    state: 'archived',
                    state_at: '2026-01-02T00:00:00.000000Z',
                    state_event_id: 'ev-1',
                },
            ),
        );
        assert.equal(put.status, 201);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/members/current/versions',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.ok(rows.length >= 2, 'genesis + archive');
        assertDesc(rows);
        assert.equal(rows[0]!.id, 'ev-1');
        assert.equal(rows[0]!.state, 'archived');
        assert.equal(rows[0]!.entity_id, 'current');
        assert.equal(rows[0]!.member_id, 'current');
        const archive = rows.find(e => e.id === 'ev-1');
        assert.ok(archive, 'archive event missing');
        assert.equal(archive!.member_id, 'current');
    },
);

test(
    'GET members/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/members/no-such-member/versions',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: members/no-such-member',
        );
    },
);
