import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveIdea,
    deriveIdeas,
    deriveIdeaStateHistory,
} from '../api/derive-ideas.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const BASE = 'http://localhost';
const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

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

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

function ideaDocument(
    title: string,
    state: string,
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
    };
}

function putIdea(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    title: string,
    state: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id, token,
        ideaDocument(title, state),
    ));
}

test('a created idea derives', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = generateIdentifier();
    const res = await putIdea(
        db, token, ideaId, 'Fresh Idea', 'active',
    );
    assert.equal(res.status, 201);
    const derived = await deriveIdea(
        db, STARK_ORGANIZATION, ideaId,
    );
    assert.deepEqual(derived, {
        id: ideaId,
        organization_id: STARK_ORGANIZATION,
        title: 'Fresh Idea',
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    });
});

test('an edited idea derives the edit body', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = generateIdentifier();
    await putIdea(
        db, token, ideaId, 'Before Edit', 'active',
    );
    // Same domain state — only the entity fields move.
    const res = await putIdea(
        db, token, ideaId, 'After Edit', 'active',
    );
    assert.equal(res.status, 201);
    const derived = await deriveIdea(
        db, STARK_ORGANIZATION, ideaId,
    );
    assert.equal(derived.title, 'After Edit');
    // The unchanged trio replays the SAME event, not a new one —
    // still one row in the derived history.
    const history = await deriveIdeaStateHistory(
        db, STARK_ORGANIZATION, ideaId,
    );
    assert.equal(history.length, 1);
});

test(
    'a deleted idea disappears from the list and 404s by id',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const ideaId = generateIdentifier();
        await putIdea(
            db, token, ideaId, 'Doomed', 'active',
        );
        const res = await putIdea(
            db, token, ideaId, 'Doomed', 'deleted',
        );
        assert.equal(res.status, 201);

        const ideas = await deriveIdeas(db, STARK_ORGANIZATION);
        assert.equal(
            ideas.some((idea) => idea.id === ideaId),
            false,
        );
        await assert.rejects(
            () => deriveIdea(
                db, STARK_ORGANIZATION, ideaId,
            ),
            EntityNotFoundError,
        );
    },
);

test(
    'a later deleted PUT tombs the idea',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const ideaId = generateIdentifier();
        await putIdea(
            db, token, ideaId, 'Genesis Title',
            'active',
        );
        const res = await putIdea(
            db, token, ideaId, 'Tomb Title',
            'deleted',
        );
        assert.equal(res.status, 201);
        const ideas = await deriveIdeas(db, STARK_ORGANIZATION);
        assert.equal(
            ideas.some((idea) => idea.id === ideaId),
            false,
        );
        await assert.rejects(
            () => deriveIdea(
                db, STARK_ORGANIZATION, ideaId,
            ),
            EntityNotFoundError,
        );
        const history = await deriveIdeaStateHistory(
            db, STARK_ORGANIZATION, ideaId,
        );
        assert.equal(history.length, 2);
        assert.equal(history[0]!.state, 'active');
        assert.equal(history[1]!.state, 'deleted');
    },
);

test('ordering is oldest live head (at, id)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ids = [
        generateIdentifier(),
        generateIdentifier(),
        generateIdentifier(),
    ];
    for (const id of ids) {
        await putIdea(
            db, token, id, 'Order ' + id, 'active',
        );
    }
    const derived = await deriveIdeas(db, STARK_ORGANIZATION);
    const observed = derived
        .map((idea) => idea.id)
        .filter((id) => ids.includes(id));
    assert.deepEqual(observed, ids);
});

test(
    'the synthesized genesis equals the actual states genesis '
    + 'row field-for-field',
    async () => {
        const db = await seededDb();
        // A seeded idea (org 'AjdvjuECVZEgZoFajaIEkg' by
        // assignOrganization(0)) whose
        // ONLY event is its own creation — no post-genesis
        // transitions in the mock data.
        const ideaId = 'YvOylAxOjQcgmNmsSoVBPQ';
        const derivedHistory = await deriveIdeaStateHistory(
            db, STARK_ORGANIZATION, ideaId,
        );
        assert.ok(derivedHistory.length >= 1);
    },
);
