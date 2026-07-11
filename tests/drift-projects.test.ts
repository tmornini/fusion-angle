import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from '../api/db.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
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

// Phase Final Task 2: projects(+project_flows+scores)
// dual-write stripped. This file no longer compares derive
// vs old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions
// and non-lexical live fixtures (byIdAscending must diverge
// from insertion order; never function-vs-function only).

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

function projectDocument(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
    position = 1,
) {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-04-01',
        target_end_date: '2026-07-01',
        estimated_cost: 100,
        actual_cost: 0,
        position,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

// Wire entity shape WRITE_RESPONSE_SPECS + projectEntityOf
// form (id first, organization_id, then entity fields).
function wireProject(
    id: string,
    title: string,
    position = 1,
    organization = '1',
    overrides: Record<string, unknown> = {},
) {
    return {
        id,
        organization_id: organization,
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-04-01',
        target_end_date: '2026-07-01',
        estimated_cost: 100,
        actual_cost: 0,
        position,
        ...overrides,
    };
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// Every seeded project's own id, paired with the org the seed
// actually stamped it into: buildProjects() (16 rows) all land
// on STARK_ORGANIZATION; the 17th is the org-2 override.
const SEEDED_PROJECTS = [
    ...buildProjects().map((project) => ({
        id: project.id,
        organization: STARK_ORGANIZATION,
        title: project.title,
        position: project.position,
    })),
    {
        id: secondOrganizationProjectId,
        organization: ORGANIZATION_TWO,
        title: undefined as string | undefined,
        position: undefined as number | undefined,
    },
];

test('seeded GET /projects wire equals deriveProjects'
+ ' per org', async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(
            db, req('GET', '/projects', token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveProjects(db, organization);
        assert.equal(wireText, JSON.stringify(derived));
        assert.ok(derived.length > 0);
    }
});

test('per-project GET wire equals deriveProject for'
+ ' every seed', async () => {
    const db = await seededDb();
    for (const seed of SEEDED_PROJECTS) {
        const token = await organizationToken(
            'current', seed.organization,
        );
        const res = await handleRequest(
            db, req('GET', '/projects/' + seed.id, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveProject(
            db, seed.organization, seed.id,
        );
        assert.equal(wireText, JSON.stringify(derived));
        if (seed.title !== undefined) {
            assert.equal(derived.title, seed.title);
            assert.equal(derived.position, seed.position);
        }
    }
});

test('a foreign-org project id 403s on GET and on derive',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_PROJECTS.find(
        (seed) => seed.organization === '1',
    )!;
    const token = await organizationToken('current', '2');
    const res = await handleRequest(
        db, req('GET', '/projects/' + foreign.id, token),
    );
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'forbidden: projects/' + foreign.id
        + ' belongs to a different organization',
    );
    await assert.rejects(
        () => deriveProject(db, '2', foreign.id),
        ForeignOrganizationError,
    );
});

// Live fixtures inserted NON-LEX (z, then a, then m) so
// byIdAscending collection order diverges from insertion.
test('GET /projects collection is wire byte-identical to a'
+ ' literal id-lex reconstruction after non-lex PUTs',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: 'project-drift-z',
            title: 'Zulu',
            at: '2026-07-01T00:00:00.000000Z',
            ev: 'ev-drift-z',
        },
        {
            id: 'project-drift-a',
            title: 'Alpha',
            at: '2026-07-01T00:00:01.000000Z',
            ev: 'ev-drift-a',
        },
        {
            id: 'project-drift-m',
            title: 'Mike',
            at: '2026-07-01T00:00:02.000000Z',
            ev: 'ev-drift-m',
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/projects/' + f.id, token,
            projectDocument(f.title, 'submitted', f.at, f.ev),
        ));
        assert.equal(put.status, 200);
        assert.deepEqual(
            await put.json(),
            wireProject(f.id, f.title),
        );
    }
    // id-lex expected order: a, m, z — NOT insertion order.
    const expectedAdded = [
        wireProject('project-drift-a', 'Alpha'),
        wireProject('project-drift-m', 'Mike'),
        wireProject('project-drift-z', 'Zulu'),
    ];
    const res = await handleRequest(
        db, req('GET', '/projects', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        row.id.startsWith('project-drift-'));
    assert.equal(
        JSON.stringify(added),
        JSON.stringify(expectedAdded),
    );
    for (const row of expectedAdded) {
        const single = await handleRequest(
            db, req('GET', '/projects/' + row.id, token),
        );
        assert.equal(single.status, 200);
        assert.equal(
            await single.text(), JSON.stringify(row),
        );
    }
});

test('derived history keeps the FIRST arrival\'s authorship'
+ ' on a same-trio resend by a different member', async () => {
    const db = await seededDb();
    await seedOrganizationMember(db, 'member-b');
    const tokenA = await organizationToken('current');
    const tokenB = await organizationToken('member-b');
    const projectId = 'project-drift-authorship-caveat';

    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, tokenA, {
            ...projectDocument(
                'First', 'submitted',
                '2026-04-01T00:00:00.000000Z',
                'ev-drift-authorship-caveat',
            ),
        },
    ));
    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, tokenB, {
            ...projectDocument(
                'Second', 'submitted',
                '2026-04-01T00:00:00.000000Z',
                'ev-drift-authorship-caveat',
            ),
        },
    ));

    const derived = await deriveProjectStateHistory(
        db, '1', projectId,
    );
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.member_id, 'current');

    // Wire entity reflects the SECOND title; authorship of the
    // head event stays on member A.
    const getRes = await handleRequest(
        db, req('GET', '/projects/' + projectId, tokenA),
    );
    assert.equal(getRes.status, 200);
    assert.equal(
        await getRes.text(),
        JSON.stringify(wireProject(projectId, 'Second')),
    );
});

test('live-write case: create + edit + transition + delete',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = 'project-drift-lifecycle';

    await handleRequest(db, req(
        'PUT', '/projects/' + projectId, token, {
            ...projectDocument(
                'Lifecycle Project', 'submitted',
                '2026-03-01T00:00:00.000000Z',
                'ev-drift-lifecycle-genesis',
            ),
        },
    ));
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
    const beforeDelete = await handleRequest(
        db, req('GET', '/projects/' + projectId, token),
    );
    assert.equal(beforeDelete.status, 200);
    const beforeWire = await beforeDelete.json() as {
        title: string;
        progress: number;
    };
    assert.equal(beforeWire.title, 'Lifecycle Project Edited');
    assert.equal(beforeWire.progress, 10);
    const derivedBefore = await deriveProject(
        db, '1', projectId,
    );
    assert.equal(
        JSON.stringify(beforeWire),
        JSON.stringify(derivedBefore),
    );

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

    const deleted = await handleRequest(
        db, req('GET', '/projects/' + projectId, token),
    );
    assert.equal(deleted.status, 404);
    await assert.rejects(
        () => deriveProject(db, '1', projectId),
        EntityNotFoundError,
    );
    const listRes = await handleRequest(
        db, req('GET', '/projects', token),
    );
    const list = await listRes.json() as { id: string }[];
    assert.equal(
        list.some((p) => p.id === projectId), false,
    );

    const derivedHistory = await deriveProjectStateHistory(
        db, '1', projectId,
    );
    // genesis + under_review + deleted (same-trio edit
    // does not add a second event)
    assert.equal(derivedHistory.length, 3);
});

test('live conversion case: a converted idea\'s project'
+ ' is wire-visible like a PUT-born one', async () => {
    const db = await seededDb();
    const token = await organizationToken('current');
    const projectId = 'project-drift-conversion';

    const conv = await handleRequest(db, req(
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
    assert.equal(conv.status, 204);

    const getRes = await handleRequest(
        db, req('GET', '/projects/' + projectId, token),
    );
    assert.equal(getRes.status, 200);
    const wireText = await getRes.text();
    const wire = JSON.parse(wireText) as { title: string };
    assert.equal(wire.title, 'Converted Project');
    const derived = await deriveProject(db, '1', projectId);
    assert.equal(wireText, JSON.stringify(derived));

    const listRes = await handleRequest(
        db, req('GET', '/projects', token),
    );
    const list = await listRes.json() as { id: string }[];
    assert.ok(list.some((p) => p.id === projectId));

    const derivedHistory = await deriveProjectStateHistory(
        db, '1', projectId,
    );
    assert.equal(derivedHistory.length, 1);
    assert.equal(derivedHistory[0]!.state, 'submitted');
});
