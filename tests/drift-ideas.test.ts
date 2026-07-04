import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { IdeaEntity } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { organizationScopedAdapter } from
    '../api/db-organization-scoped.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import { assignOrganization } from
    '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    deriveIdea,
    deriveIdeas,
    deriveIdeaSubmissions,
    deriveIdeaStateHistory,
} from '../api/derive-ideas.ts';

// The E10 drift check (Phase 2 Task 4): message-derived reads
// proven equal to the old-table-derived reads they will replace
// at the route (Task 5). NOTHING reads the pairs in production
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
function oldPlaneIdeas(
    db: MemoryDbAdapter, organization: string,
): Promise<IdeaEntity[]> {
    return organizationScopedAdapter(db, organization)
        .ideas.getAll();
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// Every seeded idea's own id, paired with the org
// assignOrganization(index) actually stamped it into — the SAME
// partition seed-message-pairs.ts's buildMockDataInvocations
// uses.
const SEEDED_IDEAS = buildIdeas().map((idea, index) => ({
    id: idea.id,
    organization: assignOrganization(index),
}));

test('ideas: message-derived equals old-table-derived',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const old = sortById(
            await oldPlaneIdeas(db, organization),
        );
        const derived = await deriveIdeas(db, organization);
        assert.deepEqual(derived, old);
    }
});

test('per-idea getById parity across every seeded idea',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_IDEAS) {
        const derived = await deriveIdea(db, organization, id);
        const old = await organizationScopedAdapter(
            db, organization,
        ).ideas.getById(id);
        assert.deepEqual(derived, old);
    }
});

test('a foreign-org id 404s the same way on both planes',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_IDEAS.find(
        (seed) => seed.organization === '1',
    )!;
    const otherOrganization = '2';
    await assert.rejects(
        () => deriveIdea(db, otherOrganization, foreign.id),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, otherOrganization)
            .ideas.getById(foreign.id),
        EntityNotFoundError,
    );
});

test('state-history parity across every seeded idea',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_IDEAS) {
        const derived = await deriveIdeaStateHistory(
            db, organization, id,
        );
        const old = await db.states.getAllFor(id);
        assert.deepEqual(derived, old);
    }
});

// The OP-level MEMBER_ID CAVEAT (api-idea-document.test.ts) has
// no DERIVATION-layer counterpart: deriveIdeaStateHistory's own
// dedup (ideaLifecycleEvents, api/derive-ideas.ts) walks pairs in
// ARRIVAL order and keeps the FIRST occurrence of each distinct
// state_event_id. A regression that flipped it to keep-LAST
// would reattribute the derived event to the SECOND editor —
// silently, since every other case here uses one actor
// throughout. Mirrors the op-level scenario at the derivation
// layer: member A creates the idea; member B resends the
// IDENTICAL trio under a different title; the derived history
// must still name member A, and must still equal the old-plane
// states row field-for-field.
test('derived history keeps the FIRST arrival\'s authorship'
+ ' on a same-trio resend by a different member', async () => {
    const db = await seededDb();
    await seedOrganizationMember(db, 'member-b');
    const tokenA = await organizationToken('current');
    const tokenB = await organizationToken('member-b');
    const ideaId = 'idea-drift-authorship-caveat';

    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, tokenA, {
            title: 'First',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: '2026-04-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-authorship-caveat',
        },
    ));
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, tokenB, {
            title: 'Second',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: '2026-04-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-authorship-caveat',
        },
    ));

    const derived = await deriveIdeaStateHistory(
        db, '1', ideaId,
    );
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.member_id, 'current');

    const old = await db.states.getAllFor(ideaId);
    assert.deepEqual(derived, old);
});

test('submissions parity for a live-written submission',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-submission-parity';
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            title: 'Submission Parity',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: '2026-02-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-submission-parity',
        },
    ));
    const res = await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId + '/submissions/sub-drift-1',
        token, {
            idea_id: ideaId,
            member_id: 'current',
            at: '2026-02-01T00:00:01.000000Z',
        },
    ));
    assert.equal(res.status, 200);
    const derived = await deriveIdeaSubmissions(
        db, '1', ideaId,
    );
    const old = await organizationScopedAdapter(db, '1')
        .ideaSubmissions.getAllWhere('idea_id', ideaId);
    assert.deepEqual(derived, sortById(old));
});

// GAP CLOSED (Phase 2 Task 4b): the 11 seeded ideas' submissions
// (api/mock-data.ts, buildIdeaSubmissions) now form their
// message pair through postIdeaSubmissionOp exactly as a
// live PUT does (api/mock-data/seed-message-pairs.ts's
// ideaSubmissionSeedBody), so every seeded submission is fully
// derivable — no seed-only exception remains for this family.
test('seeded idea submissions: message-derived equals'
+ ' old-table-derived, for every seeded idea, per org',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_IDEAS) {
        const old = sortById(
            await organizationScopedAdapter(db, organization)
                .ideaSubmissions.getAllWhere('idea_id', id),
        );
        assert.ok(old.length > 0);
        const derived = await deriveIdeaSubmissions(
            db, organization, id,
        );
        assert.deepEqual(derived, old);
    }
});

test('live-write case: create + edit + transition + delete, '
+ 're-compared on both planes', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-lifecycle';

    // Create.
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            title: 'Lifecycle Idea',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: '2026-03-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-genesis',
        },
    ));
    // Edit — same trio, different fields.
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            title: 'Lifecycle Idea Edited',
            position: 2,
            problem_statement: 'p2',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: '2026-03-01T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-genesis',
        },
    ));
    // Transition.
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            title: 'Lifecycle Idea Edited',
            position: 2,
            problem_statement: 'p2',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'in_review',
            state_at: '2026-03-02T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-review',
        },
    ));
    const oldBeforeDelete = await organizationScopedAdapter(
        db, '1',
    ).ideas.getById(ideaId);
    const derivedBeforeDelete = await deriveIdea(
        db, '1', ideaId,
    );
    assert.deepEqual(derivedBeforeDelete, oldBeforeDelete);

    // Delete (a transition to 'deleted' — ideas has no DELETE
    // route).
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            title: 'Lifecycle Idea Edited',
            position: 2,
            problem_statement: 'p2',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'deleted',
            state_at: '2026-03-03T00:00:00.000000Z',
            state_event_id: 'ev-drift-lifecycle-deleted',
        },
    ));

    await assert.rejects(
        () => deriveIdea(db, '1', ideaId),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, '1')
            .ideas.getById(ideaId),
        EntityNotFoundError,
    );
    const derivedList = await deriveIdeas(db, '1');
    assert.equal(
        derivedList.some((idea) => idea.id === ideaId), false,
    );
    const oldList = await oldPlaneIdeas(db, '1');
    assert.equal(
        oldList.some((idea) => idea.id === ideaId), false,
    );

    const derivedHistory = await deriveIdeaStateHistory(
        db, '1', ideaId,
    );
    const oldHistory = await db.states.getAllFor(ideaId);
    assert.deepEqual(derivedHistory, oldHistory);
    assert.equal(derivedHistory.length, 3);
});
