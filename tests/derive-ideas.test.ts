import { test } from 'node:test';
import { deriveStatesFor } from
    '../api/derive-states.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveIdea,
    deriveIdeas,
    deriveIdeaStateHistory,
} from '../api/derive-ideas.ts';

const BASE = 'http://localhost';
const STARK_ORGANIZATION = '1';

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
    await postMockDataLoad(db);
    return db;
}

function ideaDocument(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

function putIdea(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument(title, state, stateAt, stateEventId),
    ));
}

test('a created idea derives', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const res = await putIdea(
        db, token, 'idea-drv-created', 'Fresh Idea', 'active',
        '2026-02-01T00:00:00.000000Z', 'ev-drv-created',
    );
    assert.equal(res.status, 200);
    const derived = await deriveIdea(
        db, STARK_ORGANIZATION, 'idea-drv-created',
    );
    assert.deepEqual(derived, {
        id: 'idea-drv-created',
        organization_id: STARK_ORGANIZATION,
        title: 'Fresh Idea',
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    });
});

test('an edited idea derives the edit body', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    await putIdea(
        db, token, 'idea-drv-edited', 'Before Edit', 'active',
        '2026-02-01T00:00:00.000000Z', 'ev-drv-edited',
    );
    // Same trio (state/state_at/state_event_id unchanged) — the
    // MEMBER_ID CAVEAT edit shape: only the entity fields move.
    const res = await putIdea(
        db, token, 'idea-drv-edited', 'After Edit', 'active',
        '2026-02-01T00:00:00.000000Z', 'ev-drv-edited',
    );
    assert.equal(res.status, 200);
    const derived = await deriveIdea(
        db, STARK_ORGANIZATION, 'idea-drv-edited',
    );
    assert.equal(derived.title, 'After Edit');
    // The unchanged trio replays the SAME event, not a new one —
    // still one row in the derived history.
    const history = await deriveIdeaStateHistory(
        db, STARK_ORGANIZATION, 'idea-drv-edited',
    );
    assert.equal(history.length, 1);
});

test(
    'a deleted idea disappears from the list and 404s by id',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        await putIdea(
            db, token, 'idea-drv-deleted', 'Doomed', 'active',
            '2026-02-01T00:00:00.000000Z', 'ev-drv-deleted-genesis',
        );
        const res = await putIdea(
            db, token, 'idea-drv-deleted', 'Doomed', 'deleted',
            '2026-02-02T00:00:00.000000Z', 'ev-drv-deleted-tomb',
        );
        assert.equal(res.status, 200);

        const ideas = await deriveIdeas(db, STARK_ORGANIZATION);
        assert.equal(
            ideas.some((idea) => idea.id === 'idea-drv-deleted'),
            false,
        );
        await assert.rejects(
            () => deriveIdea(
                db, STARK_ORGANIZATION, 'idea-drv-deleted',
            ),
            EntityNotFoundError,
        );
    },
);

test(
    'a clock-skewed transition does NOT displace genesis',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        // Genesis claims a LATER state_at than the skewed
        // transition below — exactly the clock-skew scenario the
        // (state_at, id) reduction must resist.
        await putIdea(
            db, token, 'idea-drv-skew', 'Genesis Title', 'active',
            '2026-06-01T00:00:00.000000Z', 'ev-drv-skew-genesis',
        );
        const res = await putIdea(
            db, token, 'idea-drv-skew', 'Skewed Title', 'deleted',
            '2020-01-01T00:00:00.000000Z', 'ev-drv-skew-later',
        );
        assert.equal(res.status, 200);

        // Genesis must still win the lifecycle reduction: the
        // idea stays visible despite the later-arriving 'deleted'
        // transition, because that transition's OWN state_at is
        // older than genesis's.
        const derived = await deriveIdea(
            db, STARK_ORGANIZATION, 'idea-drv-skew',
        );
        // Arrival order still governs the entity's OTHER fields —
        // the two reductions are independent.
        assert.equal(derived.title, 'Skewed Title');
        const ideas = await deriveIdeas(db, STARK_ORGANIZATION);
        assert.equal(
            ideas.some((idea) => idea.id === 'idea-drv-skew'),
            true,
        );

        const history = await deriveIdeaStateHistory(
            db, STARK_ORGANIZATION, 'idea-drv-skew',
        );
        // Order- AND content-sensitive: (state_at, id)
        // ascending — the SAME order store-state.ts's
        // getAllForIn returns. The later-ARRIVED but earlier-
        // STAMPED 'deleted' event sorts FIRST; genesis SECOND.
        assert.deepEqual(
            history.map((entry) => ({
                id: entry.id,
                entity_id: entry.entity_id,
                state: entry.state,
                at: entry.at,
            })),
            [
                {
                    id: 'ev-drv-skew-later',
                    entity_id: 'idea-drv-skew',
                    state: 'deleted',
                    at: '2020-01-01T00:00:00.000000Z',
                },
                {
                    id: 'ev-drv-skew-genesis',
                    entity_id: 'idea-drv-skew',
                    state: 'active',
                    at: '2026-06-01T00:00:00.000000Z',
                },
            ],
        );
    },
);

test('ordering is id-lex', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ids = [
        'zz-order-idea', 'aa-order-idea', 'mm-order-idea',
    ];
    for (const id of ids) {
        await putIdea(
            db, token, id, 'Order ' + id, 'active',
            '2026-02-01T00:00:00.000000Z', 'ev-' + id,
        );
    }
    const derived = await deriveIdeas(db, STARK_ORGANIZATION);
    const observed = derived
        .map((idea) => idea.id)
        .filter((id) => ids.includes(id));
    assert.deepEqual(observed, [...ids].sort());
});

test(
    'the synthesized genesis equals the actual states genesis '
    + 'row field-for-field',
    async () => {
        const db = await seededDb();
        // A seeded idea (org '1' by assignOrganization(0)) whose
        // ONLY event is its own creation — no post-genesis
        // transitions in the mock data.
        const ideaId = 'eT5xdKjzLDmuRn3r7XMX4R';
        const derivedHistory = await deriveIdeaStateHistory(
            db, STARK_ORGANIZATION, ideaId,
        );
        const oldHistory = await deriveStatesFor(db, '1', ideaId);
        assert.deepEqual(derivedHistory, oldHistory);
    },
);
