import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

// Phase 2 Task 3 (R1, Decision 7): create dissolved into the
// SAME genesis-capable document PUT ideas/:id Task 2 built —
// genesis is head-presence-defined, "the first document
// version." The composed POST /ideas retired; it now 405s like
// any other method-absent route (self-review requirement).

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

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The idea body OMITS organization_id — the org fence stamps
// it from the verified token before the store validates.
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

// The genesis case of the document PUT (Decision 7): the SAME
// shape an edit or transition carries — entity fields plus the
// lifecycle trio. There is no separate "create body" shape.
function ideaGenesisBody(
    ideaId: string, title: string, at: string,
) {
    return {
        ...ideaFields(title),
        state: 'active',
        state_at: at,
        state_event_id: 'ev-' + ideaId,
    };
}

test(
    'a genesis PUT writes the idea row and its initial'
    + ' state event in one operation',
    async () => {
        const db = await freshDb();
        const res = await handleRequest(db, req(
            'PUT', '/ideas/idea-1', DEV_TOKEN,
            // Far-future timestamp forces a distinct, verifiable
            // at value so the test can confirm the caller's time
            // was threaded to the event — not a server nowUtc().
            ideaGenesisBody(
                'idea-1', 'Fresh Idea',
                '2099-01-01T00:00:00.000000Z',
            ),
        ));
        assert.equal(res.status, 200);
        const ideaRes = await handleRequest(
            db, req('GET', '/ideas/idea-1', DEV_TOKEN),
        );
        const idea = await ideaRes.json() as {
            title: string;
            organization_id: string;
        };
        assert.equal(idea.title, 'Fresh Idea');
        // The fence stamped the bound org — never the body.
        assert.equal(idea.organization_id, '1');
        const stateRes = await handleRequest(db, req(
            'GET', '/entity-states/idea-1', DEV_TOKEN,
        ));
        const current = await stateRes.json() as {
            state: string;
            member_id: string;
            at: string;
        };
        assert.equal(current.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(current.member_id, 'current');
        // The event carries the caller-supplied at, not server
        // time.
        assert.equal(
            current.at, '2099-01-01T00:00:00.000000Z',
        );
    },
);

test(
    'a genesis PUT rolls back the idea row when its'
    + ' initial state event conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's
        // state_event_id. postEvent re-puts that id with a
        // conflicting payload mid-tx (LedgerImmutability), so
        // the idea write must roll back with it.
        await db.states.put('ev-x', {
            entity_id: 'other',
            state: 'active',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        const res = await handleRequest(db, req(
            'PUT', '/ideas/idea-rollback', DEV_TOKEN,
            {
                ...ideaFields('Doomed'),
                state: 'active',
                state_at: '2099-01-02T00:00:00.000000Z',
                state_event_id: 'ev-x',
            },
        ));
        assert.equal(res.status, 409);
        const getRes = await handleRequest(db, req(
            'GET', '/ideas/idea-rollback', DEV_TOKEN,
        ));
        assert.equal(getRes.status, 404);
    },
);

// R6: the create's partial-failure atomicity pin becomes a
// retry-convergence pin (the tx is still atomic — proven above
// by the rollback case). E6: the id and the trio are minted
// ONCE by the caller; a byte-identical resend of the SAME
// genesis PUT must hit the idempotency fold — one idea, one
// genesis event, one stored pair — never a second row or a
// second event.
test(
    'a byte-identical resend of a genesis PUT converges:'
    + ' one idea, one genesis event, one pair',
    async () => {
        const db = await freshDb();
        const body = ideaGenesisBody(
            'idea-retry', 'Retried',
            '2026-01-01T00:00:00.000000Z',
        );
        const first = await handleRequest(db, req(
            'PUT', '/ideas/idea-retry', DEV_TOKEN, body,
        ));
        assert.equal(first.status, 200);
        const second = await handleRequest(db, req(
            'PUT', '/ideas/idea-retry', DEV_TOKEN, body,
        ));
        assert.equal(second.status, 200);
        assert.equal(
            second.headers.get('Response-ID'),
            first.headers.get('Response-ID'),
        );
        const events = await db.states.getAllFor('idea-retry');
        assert.equal(events.length, 1);
        assert.equal((await db.requests.getAll()).length, 1);
        assert.equal((await db.responses.getAll()).length, 1);
    },
);

test(
    'POST /ideas now answers like any other method-absent'
    + ' route',
    async () => {
        const db = await freshDb();
        const res = await handleRequest(db, req(
            'POST', '/ideas', DEV_TOKEN,
            ideaGenesisBody(
                'idea-405', 'Should Not Create',
                '2026-01-01T00:00:00.000000Z',
            ),
        ));
        assert.equal(res.status, 405);
        assert.equal((await db.requests.getAll()).length, 0);
    },
);
