import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { ProjectEntity } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { organizationScopedAdapter } from
    '../api/db-organization-scoped.ts';
import { buildProjects } from '../api/mock-data/projects.ts';
import {
    secondOrganizationProjectId,
} from '../api/mock-data/seed-message-pairs.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    deriveProject,
    deriveProjects,
    deriveProjectStateHistory,
} from '../api/derive-projects.ts';

// The E10 drift check (Phase 3 Task 5): message-derived reads
// proven equal to the old-table-derived reads they will replace
// at the route (Task 6). NOTHING reads the pairs in production
// yet — this file alone gates that flip; it stays as a
// regression guard through Phase Final.

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Reads through the SAME org-scoped store the live route reads
// today (organizationScopedAdapter binds the fence the route's
// verified-token org resolves to).
function oldPlaneProjects(
    db: MemoryDbAdapter, organization: string,
): Promise<ProjectEntity[]> {
    return organizationScopedAdapter(db, organization)
        .projects.getAll();
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// Every seeded project's own id, paired with the org the seed
// actually stamped it into: buildProjects() (16 rows) all land
// on STARK_ORGANIZATION; the 17th is the org-2 override sharing
// secondOrganizationProjectId (seed-message-pairs.ts) — reused
// rather than a second literal.
const SEEDED_PROJECTS = [
    ...buildProjects().map((project) => ({
        id: project.id,
        organization: STARK_ORGANIZATION,
    })),
    {
        id: secondOrganizationProjectId,
        organization: ORGANIZATION_TWO,
    },
];

test('projects: message-derived equals old-table-derived',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const old = sortById(
            await oldPlaneProjects(db, organization),
        );
        const derived = await deriveProjects(db, organization);
        assert.deepEqual(derived, old);
    }
});

test('per-project getById parity across every seeded project',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_PROJECTS) {
        const derived = await deriveProject(
            db, organization, id,
        );
        const old = await organizationScopedAdapter(
            db, organization,
        ).projects.getById(id);
        assert.deepEqual(derived, old);
    }
});

test('a foreign-org id 404s the same way on both planes',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_PROJECTS.find(
        (seed) => seed.organization === '1',
    )!;
    const otherOrganization = '2';
    await assert.rejects(
        () => deriveProject(db, otherOrganization, foreign.id),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, otherOrganization)
            .projects.getById(foreign.id),
        EntityNotFoundError,
    );
});

test('state-history parity across every seeded project',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_PROJECTS) {
        const derived = await deriveProjectStateHistory(
            db, organization, id,
        );
        const old = await db.states.getAllFor(id);
        assert.deepEqual(derived, old);
    }
});

// The OP-level MEMBER_ID CAVEAT (postProjectDocumentOp,
// routes.ts) has no DERIVATION-layer counterpart:
// deriveProjectStateHistory's own dedup walks pairs in ARRIVAL
// order and keeps the FIRST occurrence of each distinct
// state_event_id. A regression that flipped it to keep-LAST
// would reattribute the derived event to the SECOND editor —
// silently, since every other case here uses one actor
// throughout. Mirrors the op-level scenario at the derivation
// layer: member A creates the project; member B resends the
// IDENTICAL trio under a different title; the derived history
// must still name member A, and must still equal the old-plane
// states row field-for-field.
test('derived history keeps the FIRST arrival\'s authorship'
+ ' on a same-trio resend by a different member', async () => {
    const db = await seededDb();
    await seedOrganizationMember(db, 'member-b');
    const tokenA = await organizationToken('current');
    const tokenB = await organizationToken('member-b');
    const projectId = 'project-drift-authorship-caveat';

    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, tokenA, {
            title: 'First',
            description: 'd',
            progress: 0,
            start_date: '2026-04-01',
            target_end_date: '2026-07-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
            state: 'submitted',
            state_at: '2026-04-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-authorship-caveat',
        },
    ));
    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, tokenB, {
            title: 'Second',
            description: 'd',
            progress: 0,
            start_date: '2026-04-01',
            target_end_date: '2026-07-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
            state: 'submitted',
            state_at: '2026-04-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-authorship-caveat',
        },
    ));

    const derived = await deriveProjectStateHistory(
        db, '1', projectId,
    );
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.member_id, 'current');

    const old = await db.states.getAllFor(projectId);
    assert.deepEqual(derived, old);
});

test('live-write case: create + edit + transition + delete, '
+ 're-compared on both planes', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = 'project-drift-lifecycle';

    // Create.
    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, token, {
            title: 'Lifecycle Project',
            description: 'd',
            progress: 0,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 0,
            position: 1,
            state: 'submitted',
            state_at: '2026-03-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-genesis',
        },
    ));
    // Edit — same trio, different fields.
    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, token, {
            title: 'Lifecycle Project Edited',
            description: 'd2',
            progress: 10,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 10,
            position: 2,
            state: 'submitted',
            state_at: '2026-03-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-genesis',
        },
    ));
    // Transition.
    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, token, {
            title: 'Lifecycle Project Edited',
            description: 'd2',
            progress: 10,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 10,
            position: 2,
            state: 'under_review',
            state_at: '2026-03-02T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-review',
        },
    ));
    const oldBeforeDelete = await organizationScopedAdapter(
        db, '1',
    ).projects.getById(projectId);
    const derivedBeforeDelete = await deriveProject(
        db, '1', projectId,
    );
    assert.deepEqual(derivedBeforeDelete, oldBeforeDelete);

    // Delete (a transition to 'deleted' — projects has no
    // DELETE route).
    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, token, {
            title: 'Lifecycle Project Edited',
            description: 'd2',
            progress: 10,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 10,
            position: 2,
            state: 'deleted',
            state_at: '2026-03-03T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-deleted',
        },
    ));

    await assert.rejects(
        () => deriveProject(db, '1', projectId),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, '1')
            .projects.getById(projectId),
        EntityNotFoundError,
    );
    const derivedList = await deriveProjects(db, '1');
    assert.equal(
        derivedList.some((p) => p.id === projectId), false,
    );
    const oldList = await oldPlaneProjects(db, '1');
    assert.equal(
        oldList.some((p) => p.id === projectId), false,
    );

    const derivedHistory = await deriveProjectStateHistory(
        db, '1', projectId,
    );
    const oldHistory = await db.states.getAllFor(projectId);
    assert.deepEqual(derivedHistory, oldHistory);
    assert.equal(derivedHistory.length, 3);
});

// The Task 4 proof at the derivation layer: a conversion-born
// project derives IDENTICALLY to a PUT-born one, since Task 4's
// synthesized document pair is byte-indistinguishable from a
// live PUT /projects/:id's own pair — so this module needs no
// conversion special case anywhere. 'current' is a member of
// BOTH orgs (seeded admin in org '1' AND '2'), so
// organizationToken('current') is used — never the raw
// DEV_TOKEN a flat token's implicit org resolution would leave
// ambiguous. Body shape mirrors ONLY the field values
// tests/api-idea-conversion.test.ts's projectFields/ideaFields
// fixtures use — those helpers are file-local there, so the
// shape is reproduced rather than imported.
test('live conversion case: a converted idea\'s project'
+ ' derives identically to a PUT-born one', async () => {
    const db = await seededDb();
    const token = await organizationToken('current');
    const projectId = 'project-drift-conversion';

    await handleRequest(db, req(
        'POST',
        '/ideas/idea-drift-conversion-source/conversion',
        token,
        {
            projectId,
            project: {
                title: 'Converted Project',
                description: 'done when X',
                progress: 0,
                start_date: '2026-04-01',
                target_end_date: '2026-07-01',
                estimated_cost: 100,
                actual_cost: 0,
                position: 1,
            },
            idea: {
                title: 'Source Idea',
                position: 1,
                problem_statement: 'p',
                target_users: 't',
                proposed_solution: 's',
                expected_outcome: 'o',
                success_metrics: 'm',
            },
            ideaStateEventId: 'ev-drift-conversion-idea',
            ideaState: 'promoted',
            projectStateEventId: 'ev-drift-conversion-project',
            projectState: 'submitted',
            ideaStateAt: '2026-05-01T00:00:00.000000Z',
            projectStateAt: '2026-05-01T00:00:01.000000Z',
            baselines: [],
        },
    ));

    const derived = await deriveProject(db, '1', projectId);
    const old = await organizationScopedAdapter(db, '1')
        .projects.getById(projectId);
    assert.deepEqual(derived, old);

    const derivedList = await deriveProjects(db, '1');
    assert.ok(derivedList.some((p) => p.id === projectId));

    const derivedHistory = await deriveProjectStateHistory(
        db, '1', projectId,
    );
    const oldHistory = await db.states.getAllFor(projectId);
    assert.deepEqual(derivedHistory, oldHistory);
});
