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
// SAME genesis-capable document PUT organizations/:id/ideas/:id Task 2 built
// —
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
    };
}

test(
    'a genesis PUT writes the idea row and its initial'
    + ' state event in one operation',
    async () => {
        const db = await freshDb();
        const res = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gVvtDIaqhnkXZQcxZeSuiw', DEV_TOKEN,
            // Far-future timestamp forces a distinct, verifiable
            // at value so the test can confirm the caller's time
            // was threaded to the event — not a server nowUtc().
            ideaGenesisBody(
                'gVvtDIaqhnkXZQcxZeSuiw', 'Fresh Idea',
                '2099-01-01T00:00:00.000000Z',
            ),
        ));
        assert.equal(res.status, 201);
        const ideaRes = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gVvtDIaqhnkXZQcxZeSuiw', DEV_TOKEN),
        );
        const idea = await ideaRes.json() as {
            title: string;
            organization_id: string;
        };
        assert.equal(idea.title, 'Fresh Idea');
        // The fence stamped the bound org — never the body.
        assert.equal(idea.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const stateRes = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gVvtDIaqhnkXZQcxZeSuiw/versions/',
            DEV_TOKEN,
        ));
        const history = await stateRes.json() as {
            id: string;
            title: string;
            state: string;
        }[];
        assert.equal(history.length, 1);
        const current = history[0]!;
        assert.equal(current.id, 'gVvtDIaqhnkXZQcxZeSuiw');
        assert.equal(current.title, 'Fresh Idea');
        assert.equal(current.state, 'active');
        assert.equal('state_at' in current, false);
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
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hNFXShiDyVzvGBLJCFFFcw', DEV_TOKEN,
            {
                ...ideaFields('Survives'),
                state: 'active',
            },
        ));
        assert.equal(res.status, 201);
        const getRes = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hNFXShiDyVzvGBLJCFFFcw', DEV_TOKEN,
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
            'hJeymLqQwgpIHWgKlcHWNA', 'Retried',
            '2026-01-01T00:00:00.000000Z',
        );
        const first = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hJeymLqQwgpIHWgKlcHWNA', DEV_TOKEN, body,
        ));
        assert.equal(first.status, 201);
        const second = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hJeymLqQwgpIHWgKlcHWNA', DEV_TOKEN, body,
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
            db, 'AjdvjuECVZEgZoFajaIEkg', 'hJeymLqQwgpIHWgKlcHWNA',
        );
        assert.equal(events.length, 1);
        assert.equal((await db.pairs.getAll()).length, 3);
        assert.equal((await db.pairs.getAll()).length, 3);
    },
);

test(
    'POST /ideas now answers like any other method-absent'
    + ' route',
    async () => {
        const db = await freshDb();
        const res = await handleRequest(db, req(
            'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', DEV_TOKEN,
            ideaGenesisBody(
                'idea-405', 'Should Not Create',
                '2026-01-01T00:00:00.000000Z',
            ),
        ));
        assert.equal(res.status, 405);
        // seedRootAdmin only (org + membership); no write pair.
        assert.equal((await db.pairs.getAll()).length, 2);
    },
);
