import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
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
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
    storedCollectionText,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const PROJECT_DRIFT_Z = generateIdentifier();
const EV_DRIFT_Z = generateIdentifier();
const PROJECT_DRIFT_A = generateIdentifier();
const EV_DRIFT_A = generateIdentifier();
const PROJECT_DRIFT_M = generateIdentifier();
const EV_DRIFT_M = generateIdentifier();
const MEMBER_B = generateIdentifier();
const PROJECT_DRIFT_AUTHORSHIP_CAVEAT = generateIdentifier();
const EV_DRIFT_AUTHORSHIP_CAVEAT = generateIdentifier();
const PROJECT_DRIFT_LIFECYCLE = generateIdentifier();
const EV_DRIFT_LIFECYCLE_GENESIS = generateIdentifier();
const PROJECT_DRIFT_CONVERSION = generateIdentifier();
const EV_DRIFT_CONVERSION_IDEA = generateIdentifier();

// Phase Final Task 2: projects(+project_flows+scores)
// dual-write stripped. This file no longer compares derive
// vs old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions
// and non-lexical live fixtures (byIdAscending must diverge
// from insertion order; never function-vs-function only).
const EV_DRIFT_CONVERSION_PROJECT = generateIdentifier();
const PROJECTID_GENESIS = generateIdentifier();
const PROJECTID_SKEWED = generateIdentifier();

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

function projectDocument(
    title: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
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
    };
}

// PUT response shape (documentWriteResponseSpec / G1):
// entity fields plus lifecycle-current trio.
function wireProjectPut(
    id: string,
    title: string,
    position = 1,
    organization = 'AjdvjuECVZEgZoFajaIEkg',
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

// GET projectEntityOf form: entity fields plus lifecycle-
// current trio (state ← event.state, state_at ← event.at,
// state_event_id ← event.id) — never the head body trio.
function wireProjectGet(
    id: string,
    title: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
    position = 1,
    organization = 'AjdvjuECVZEgZoFajaIEkg',
    overrides: Record<string, unknown> = {},
) {
    return {
        ...wireProjectPut(
            id, title, position, organization, overrides,
        ),
        state,
    };
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
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
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + organization + '/projects/',
                token,
            ),
        );
        assert.equal(res.status, 200);
        const prefix = '/organizations/'
            + organization + '/projects/';
        assert.equal(
            await res.text(),
            await storedCollectionText(db, prefix),
        );
        const derived = await deriveProjects(db, organization);
        assert.ok(derived.length > 0);
    }
});

test('per-project GET wire equals deriveProject for'
+ ' every seed', async () => {
    const db = await seededDb();
    for (const seed of SEEDED_PROJECTS) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', seed.organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + seed.organization
                    + '/projects/' + seed.id,
                token,
            ),
        );
        assert.equal(res.status, 200);
        const prefix = '/organizations/'
            + seed.organization + '/projects/';
        assert.equal(
            await res.text(),
            await storedPutBodyText(db, prefix, seed.id),
        );
        const derived = await deriveProject(
            db, seed.organization, seed.id,
        );
        if (seed.title !== undefined) {
            assert.equal(derived.title, seed.title);
            assert.equal(derived.position, seed.position);
        }
    }
});

test('a foreign-org project id 404s on GET and on derive',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_PROJECTS.find(
        (seed) => seed.organization === 'AjdvjuECVZEgZoFajaIEkg',
    )!;
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/BBjWJsjYIDkTRKIIPrzWRw/projects/' + foreign.id
                , token,
        ),
    );
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: projects/' + foreign.id,
    );
    await assert.rejects(
        () => deriveProject(db, 'BBjWJsjYIDkTRKIIPrzWRw', foreign.id),
        EntityNotFoundError,
    );
});

// Live fixtures inserted NON-LEX (z, then a, then m) so
// oldest live head (at, id) is insertion, not id-lex.
test('GET /projects collection is oldest live head '
+ '(at, id) first after non-lex PUTs',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: PROJECT_DRIFT_Z,
            title: 'Zulu',
            at: '2026-07-01T00:00:00.000000Z',
            ev: EV_DRIFT_Z,
        },
        {
            id: PROJECT_DRIFT_A,
            title: 'Alpha',
            at: '2026-07-01T00:00:01.000000Z',
            ev: EV_DRIFT_A,
        },
        {
            id: PROJECT_DRIFT_M,
            title: 'Mike',
            at: '2026-07-01T00:00:02.000000Z',
            ev: EV_DRIFT_M,
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + f.id
                , token,
            projectDocument(f.title, 'submitted', f.at, f.ev),
        ));
        assert.equal(put.status, 201);
        assert.deepEqual(
            await put.json(),
            wireProjectGet(
                f.id, f.title, 'submitted', f.at, f.ev,
            ),
        );
    }
    const res = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            , token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        [
            PROJECT_DRIFT_Z,
            PROJECT_DRIFT_A,
            PROJECT_DRIFT_M,
        ].includes(row.id));
    assert.deepEqual(
        added.map((row) => row.id),
        [
            PROJECT_DRIFT_Z,
            PROJECT_DRIFT_A,
            PROJECT_DRIFT_M,
        ],
    );
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/';
    for (const row of added) {
        const single = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + '' + row.id, token),
        );
        assert.equal(single.status, 200);
        assert.equal(
            await single.text(),
            await storedPutBodyText(db, prefix, row.id),
        );
    }
});

test('derived history keeps the FIRST arrival\'s authorship'
+ ' on a same-trio resend by a different member', async () => {
    const db = await seededDb();
    await seedOrganizationMember(db, MEMBER_B);
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const tokenB = await organizationToken(MEMBER_B);
    const projectId = PROJECT_DRIFT_AUTHORSHIP_CAVEAT;

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , tokenA, {
            ...projectDocument(
                'First', 'submitted',
                '2026-04-01T00:00:00.000000Z',
                EV_DRIFT_AUTHORSHIP_CAVEAT,
            ),
        },
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , tokenB, {
            ...projectDocument(
                'Second', 'submitted',
                '2026-04-01T00:00:00.000000Z',
                EV_DRIFT_AUTHORSHIP_CAVEAT,
            ),
        },
    ));

    const derived = await deriveProjectStateHistory(
        db, 'AjdvjuECVZEgZoFajaIEkg', projectId,
    );
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');

    // Wire entity reflects the SECOND title; authorship of the
    // head event stays on member A; GET trio is the one event.
    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId, tokenA),
    );
    assert.equal(getRes.status, 200);
    assert.equal(
        await getRes.text(),
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        ),
    );
});

test('live-write case: create + edit + transition + delete',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = PROJECT_DRIFT_LIFECYCLE;

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token, {
            ...projectDocument(
                'Lifecycle Project', 'submitted',
                '2026-03-01T00:00:00.000000Z',
                EV_DRIFT_LIFECYCLE_GENESIS,
            ),
        },
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token, {
            title: 'Lifecycle Project Edited',
            description: 'd2',
            progress: 10,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 10,
            position: 2,
            state: 'submitted',
        },
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token, {
            title: 'Lifecycle Project Edited',
            description: 'd2',
            progress: 10,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 10,
            position: 2,
            state: 'under_review',
        },
    ));
    const beforeDelete = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId, token),
    );
    assert.equal(beforeDelete.status, 200);
    assert.equal(
        await beforeDelete.text(),
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        ),
    );
    const derivedBefore = await deriveProject(
        db, 'AjdvjuECVZEgZoFajaIEkg', projectId,
    );
    assert.equal(derivedBefore.state, 'under_review');

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token, {
            title: 'Lifecycle Project Edited',
            description: 'd2',
            progress: 10,
            start_date: '2026-03-01',
            target_end_date: '2026-06-01',
            estimated_cost: 200,
            actual_cost: 10,
            position: 2,
            state: 'deleted',
        },
    ));

    const deleted = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId, token),
    );
    assert.equal(deleted.status, 200);
    assert.equal(
        await deleted.text(),
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        ),
    );
    await assert.rejects(
        () => deriveProject(db, 'AjdvjuECVZEgZoFajaIEkg', projectId),
        EntityNotFoundError,
    );
    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            , token),
    );
    const list = await listRes.json() as { id: string }[];
    assert.equal(
        list.some((p) => p.id === projectId), true,
    );

    const derivedHistory = await deriveProjectStateHistory(
        db, 'AjdvjuECVZEgZoFajaIEkg', projectId,
    );
    // genesis + under_review + deleted (same-trio edit
    // does not add a second event)
    assert.equal(derivedHistory.length, 3);
});

test('live conversion case: a converted idea\'s project'
+ ' is wire-visible like a PUT-born one', async () => {
    const db = await seededDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const projectId = PROJECT_DRIFT_CONVERSION;

    const conv = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/gnLzxboxuTEQxNBCqOvRRw/'
            + 'conversion',
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
            ideaStateEventId: EV_DRIFT_CONVERSION_IDEA,
            ideaState: 'promoted',
            projectStateEventId: EV_DRIFT_CONVERSION_PROJECT,
            projectState: 'submitted',
            ideaStateAt: '2026-05-01T00:00:00.000000Z',
            projectStateAt: '2026-05-01T00:00:01.000000Z',
            baselines: [],
        },
    ));
    assert.equal(conv.status, 201);

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId, token),
    );
    assert.equal(getRes.status, 200);
    const wireText = await getRes.text();
    const wire = JSON.parse(wireText) as { title: string };
    assert.equal(wire.title, 'Converted Project');
    const derived = await deriveProject(db, 'AjdvjuECVZEgZoFajaIEkg'
        , projectId);
    assert.equal(
        wireText,
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        ),
    );

    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            , token),
    );
    const list = await listRes.json() as { id: string }[];
    assert.ok(list.some((p) => p.id === projectId));

    const derivedHistory = await deriveProjectStateHistory(
        db, 'AjdvjuECVZEgZoFajaIEkg', projectId,
    );
    assert.equal(derivedHistory.length, 1);
    assert.equal(derivedHistory[0]!.state, 'submitted');
    // GET trio is the lifecycle-current genesis event.
    assert.equal(derived.state, 'submitted');
});

// case-7d mirror for projects GET: a clock-skewed later
// arrival whose state_at sorts BELOW genesis does NOT
// displace genesis as lifecycle-current. Head body fields
// (title) may reflect the later arrival; the GET trio must
// stay genesis.
test('GET project trio is lifecycle-current under clock skew'
+ ' (genesis-wins-under-skew, case 7d)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = generateIdentifier();
    const genesisAt = '2026-05-01T00:00:00.000000Z';
    const genesisEv = PROJECTID_GENESIS;
    const skewedAt = '2020-01-01T00:00:00.000000Z';
    const skewedEv = PROJECTID_SKEWED;

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token,
        projectDocument(
            'Genesis Title', 'submitted',
            genesisAt, genesisEv,
        ),
    ));
    assert.equal(genesis.status, 201);

    // Later arrival, earlier state_at, different state + title.
    const skewed = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token,
        projectDocument(
            'Skewed Title', 'under_review',
            skewedAt, skewedEv,
        ),
    ));
    assert.equal(skewed.status, 201);

    const expected = wireProjectGet(
        projectId, 'Skewed Title', 'under_review',
        genesisAt, genesisEv,
    );
    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId, token),
    );
    assert.equal(getRes.status, 200);
    assert.deepEqual(await getRes.json(), expected);
    assert.deepEqual(
        JSON.parse(await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        )),
        expected,
    );

    const derived = await deriveProject(db, 'AjdvjuECVZEgZoFajaIEkg'
        , projectId);
    assert.equal(
        JSON.stringify(derived), JSON.stringify(expected),
    );
    assert.equal(derived.title, 'Skewed Title');
    assert.equal(derived.state, 'under_review');

    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            , token),
    );
    assert.equal(listRes.status, 200);
    const list = await listRes.json() as { id: string }[];
    assert.ok(list.some((row) => row.id === projectId));
});
