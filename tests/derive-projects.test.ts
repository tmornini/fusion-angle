import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveProjects,
    deriveProjectStateHistory,
} from '../api/derive-projects.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// The projects sibling of tests/derive-ideas.test.ts: unit-level
// lifecycle-reduction guarantees that tests/drift-projects.test.ts
// (parity-against-old-plane only) does not exercise.

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

function projectDocument(
    title: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
): Record<string, unknown> {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-04-01',
        target_end_date: '2026-07-01',
        estimated_cost: 100,
        actual_cost: 0,
        position: 1,
        state,
    };
}

function putProject(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id, token,
        projectDocument(title, state, stateAt, stateEventId),
    ));
}

// Mirrors derive-ideas.test.ts's "a clock-skewed transition does
// NOT displace genesis". Genesis-wins-under-skew is a load-bearing
// guarantee of currentProjectState's (state_at, id) reduction
// (api/derive-projects.ts) — no case in drift-projects.test.ts
// exercises a genuine arrival-order-vs-state_at divergence, so an
// arrival-order regression would pass every existing case there
// silently.
test(
    'a later deleted PUT tombs the project',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const projectId = generateIdentifier();
        await putProject(
            db, token, projectId, 'Genesis Title',
            'submitted', '2026-06-01T00:00:00.000000Z',
            generateIdentifier(),
        );
        const res = await putProject(
            db, token, projectId, 'Tomb Title',
            'deleted', '2020-01-01T00:00:00.000000Z',
            generateIdentifier(),
        );
        assert.equal(res.status, 201);
        const projects = await deriveProjects(
            db, STARK_ORGANIZATION,
        );
        assert.equal(
            projects.some(
                (project) => project.id === projectId,
            ),
            false,
        );
        const history = await deriveProjectStateHistory(
            db, STARK_ORGANIZATION, projectId,
        );
        assert.deepEqual(
            history.map((entry) => entry.state),
            ['submitted', 'deleted'],
        );
    },
);
