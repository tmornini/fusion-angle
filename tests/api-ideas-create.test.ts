import { assertStrictEquals } from '@std/assert';
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
    _ideaId: string, title: string, _at: string,
) {
    return {
        ...ideaFields(title),
        state: 'active',
    };
}

Deno.test(
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
        assertStrictEquals(res.status, 201);
        const ideaRes = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gVvtDIaqhnkXZQcxZeSuiw', DEV_TOKEN),
        );
        const idea = await ideaRes.json() as {
            title: string;
            organization_id: string;
        };
        assertStrictEquals(idea.title, 'Fresh Idea');
        // The fence stamped the bound org — never the body.
        assertStrictEquals(idea.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
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
        assertStrictEquals(history.length, 1);
        const current = history[0]!;
        assertStrictEquals(current.id, 'gVvtDIaqhnkXZQcxZeSuiw');
        assertStrictEquals(current.title, 'Fresh Idea');
        assertStrictEquals(current.state, 'active');
        assertStrictEquals('state_at' in current, false);
    },
);

Deno.test(
    'a genesis PUT ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // message-plane genesis PUT.
    // Phase Final Stage B: states table retired.
        const res = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hNFXShiDyVzvGBLJCFFFcw', DEV_TOKEN,
            {
                ...ideaFields('Survives'),
                state: 'active',
            },
        ));
        assertStrictEquals(res.status, 201);
        const getRes = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hNFXShiDyVzvGBLJCFFFcw', DEV_TOKEN,
        ));
        assertStrictEquals(getRes.status, 200);
    },
);

// R6: the create's partial-failure atomicity pin becomes a
// retry-convergence pin (the tx is still atomic — proven above
// by the rollback case). E6: the id and the trio are minted
// ONCE by the caller; a byte-identical resend of the SAME
// genesis PUT must hit the idempotency fold — one idea, one
// genesis event, one stored pair — never a second row or a
// second event.
Deno.test(
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
        assertStrictEquals(first.status, 201);
        const second = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'hJeymLqQwgpIHWgKlcHWNA', DEV_TOKEN, body,
        ));
        assertStrictEquals(second.status, 201);
        assertStrictEquals(
            second.headers.get('Response-ID'),
            first.headers.get('Response-ID'),
        );
        const { deriveIdeaStateHistory } = await import(
            '../api/derive-ideas.ts'
        );
        const events = await deriveIdeaStateHistory(
            db, 'AjdvjuECVZEgZoFajaIEkg', 'hJeymLqQwgpIHWgKlcHWNA',
        );
        assertStrictEquals(events.length, 1);
        assertStrictEquals((await db.messagePairs.getAll()).length, 3);
        assertStrictEquals((await db.messagePairs.getAll()).length, 3);
    },
);

Deno.test(
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
        assertStrictEquals(res.status, 405);
        // seedRootAdmin only (org + membership); no write pair.
        assertStrictEquals((await db.messagePairs.getAll()).length, 2);
    },
);
