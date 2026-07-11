import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { GET, GETWithResponseId, PUT } from '../api/api.ts';
import { jitteredBackoff } from
    '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Commit A: the facade plumbing that will carry the C6 retry
// loop's If-Response-ID echo (web-app/app/adapters/
// flow-mutations.ts) — additive and INERT today. No live route
// is locked-flipped yet (Task 3's own flip commit does that), so
// these tests pin the mechanism generically, against the
// already-wired 'ideas/:id' route.

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function ideaFields(title: string) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

function ideaPutBody(ideaId: string, title: string) {
    return {
        ...ideaFields(title),
        state: 'active',
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: 'ev-' + ideaId,
    };
}

test('PUT threads an arbitrary header field into the stored'
+ ' request message (a simple-class family never keys'
+ ' behavior off it — only the message carries it)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await PUT(
        db, 'ideas/idea-hdr-1',
        ideaPutBody('idea-hdr-1', 'Headers'), token,
        [['if-response-id', 'probe-value-123']],
    );
    const stored = (await db.requests.getAll())
        .find(r => r.uri_id === 'idea-hdr-1');
    assert.ok(stored, 'a request row was stored');
    assert.ok(
        stored!.message.includes('probe-value-123'),
        'the header value must reach the stored request'
        + ' message',
    );
});

test('PUT with no headerFields behaves exactly as before —'
+ ' the parameter is purely additive', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const written = await PUT<{ id: string; title: string }>(
        db, 'ideas/idea-hdr-2',
        ideaPutBody('idea-hdr-2', 'No Headers'), token,
    );
    assert.equal(written.title, 'No Headers');
});

test('GETWithResponseId returns the parsed body and an'
+ ' undefined responseId when the route carries no'
+ ' Response-ID header (every route today, pre-flip)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await PUT(
        db, 'ideas/idea-hdr-3',
        ideaPutBody('idea-hdr-3', 'Plain'), token,
    );
    const { body, responseId } =
        await GETWithResponseId<{
            id: string; title: string;
        }>(db, 'ideas/idea-hdr-3', token);
    assert.equal(body.title, 'Plain');
    assert.equal(responseId, undefined);
});

test('GETWithResponseId and GET agree on the body for the'
+ ' same resource (delegation, not a divergent read path)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await PUT(
        db, 'ideas/idea-hdr-4',
        ideaPutBody('idea-hdr-4', 'Agree'), token,
    );
    const viaGet = await GET<{ id: string; title: string }>(
        db, 'ideas/idea-hdr-4', token,
    );
    const { body: viaGetWithResponseId } =
        await GETWithResponseId<{
            id: string; title: string;
        }>(db, 'ideas/idea-hdr-4', token);
    assert.deepEqual(viaGetWithResponseId, viaGet);
});

test('jitteredBackoff waits base*2^(attempt-1) plus jitter'
+ ' (the C6 retry loop\'s pacing primitive)',
async (t) => {
    // BACKOFF_BASE_MS is 100; random fixed at 0 → delay
    // equals the base with no jitter added.
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(Math, 'random', () => 0);

    let resolved = false;
    const p = jitteredBackoff(2).then(() => {
        resolved = true;
    });
    // attempt 2 → base = 100 * 2^(2-1) = 200
    t.mock.timers.tick(199);
    await Promise.resolve();
    assert.equal(
        resolved, false,
        'must not resolve before the backoff delay',
    );
    t.mock.timers.tick(1);
    await p;
    assert.equal(resolved, true);
});
