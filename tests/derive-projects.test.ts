import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveProject,
    deriveProjects,
    deriveProjectStateHistory,
} from '../api/derive-projects.ts';

// The projects sibling of tests/derive-ideas.test.ts: unit-level
// lifecycle-reduction guarantees that tests/drift-projects.test.ts
// (parity-against-old-plane only) does not exercise.

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

function projectDocument(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
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
        state_at: stateAt,
        state_event_id: stateEventId,
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
        'PUT', '/projects/' + id, token,
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
    'a clock-skewed transition does NOT displace genesis',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        // Genesis claims a LATER state_at than the skewed
        // transition below — exactly the clock-skew scenario the
        // (state_at, id) reduction must resist.
        await putProject(
            db, token, 'project-drv-skew', 'Genesis Title',
            'submitted', '2026-06-01T00:00:00.000000Z',
            'ev-drv-skew-genesis',
        );
        const res = await putProject(
            db, token, 'project-drv-skew', 'Skewed Title',
            'deleted', '2020-01-01T00:00:00.000000Z',
            'ev-drv-skew-later',
        );
        assert.equal(res.status, 200);

        // Genesis must still win the lifecycle reduction: the
        // project stays visible despite the later-arriving
        // 'deleted' transition, because that transition's OWN
        // state_at is older than genesis's.
        const derived = await deriveProject(
            db, STARK_ORGANIZATION, 'project-drv-skew',
        );
        // Arrival order still governs the entity's OTHER fields —
        // the two reductions are independent.
        assert.equal(derived.title, 'Skewed Title');
        const projects = await deriveProjects(
            db, STARK_ORGANIZATION,
        );
        assert.equal(
            projects.some(
                (project) => project.id === 'project-drv-skew',
            ),
            true,
        );

        const history = await deriveProjectStateHistory(
            db, STARK_ORGANIZATION, 'project-drv-skew',
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
                    entity_id: 'project-drv-skew',
                    state: 'deleted',
                    at: '2020-01-01T00:00:00.000000Z',
                },
                {
                    id: 'ev-drv-skew-genesis',
                    entity_id: 'project-drv-skew',
                    state: 'submitted',
                    at: '2026-06-01T00:00:00.000000Z',
                },
            ],
        );
    },
);
