import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
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
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb() {
    const db = memoryDbAdapter();
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
        assert.equal(res.status, 201);
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
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const stateRes = await handleRequest(db, req(
            'GET', '/ideas/idea-1/versions',
            DEV_TOKEN,
        ));
        const history = await stateRes.json() as {
            state: string;
            member_id: string;
            at: string;
        }[];
        assert.equal(history.length, 1);
        const current = history[0]!;
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
    'a genesis PUT ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane genesis PUT.
    // Phase Final Stage B: states table retired.
        const res = await handleRequest(db, req(
            'PUT', '/ideas/idea-survives', DEV_TOKEN,
            {
                ...ideaFields('Survives'),
                state: 'active',
                state_at: '2099-01-02T00:00:00.000000Z',
                state_event_id: 'ev-x',
            },
        ));
        assert.equal(res.status, 201);
        const getRes = await handleRequest(db, req(
            'GET', '/ideas/idea-survives', DEV_TOKEN,
        ));
        assert.equal(getRes.status, 200);
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
        assert.equal(first.status, 201);
        const second = await handleRequest(db, req(
            'PUT', '/ideas/idea-retry', DEV_TOKEN, body,
        ));
        assert.equal(second.status, 201);
        assert.equal(
            second.headers.get('Response-ID'),
            first.headers.get('Response-ID'),
        );
        const { deriveIdeaStateHistory } = await import(
            '../api/derive-ideas.ts'
        );
        const events = await deriveIdeaStateHistory(
            db, '1', 'idea-retry',
        );
        assert.equal(events.length, 1);
        assert.equal((await db.requests.getAll()).length, 3);
        assert.equal((await db.responses.getAll()).length, 3);
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
        // seedRootAdmin only (org + membership); no write pair.
        assert.equal((await db.requests.getAll()).length, 2);
    },
);
