import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
import type { Id } from '../shared/types.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import { buildProjects } from '../api/mock-data/projects.ts';
import {
    secondOrganizationProjectId,
} from '../api/mock-data/seed-message-pairs.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    storedPutBodyText,
    storedCollectionText,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const READER: Id = 'XXZruirZyAOoRpNxaDnpSA';

function wiringOf(family: string): DocumentFamilyWiring {
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) {
        throw new Error('no wiring registered for ' + family);
    }
    return wiring;
}

function getDocument(
    db: DbAdapter, family: string, organization: Id, id: Id,
): Promise<unknown> {
    return documentGetHandler(wiringOf(family))(
        db, [organization, id], READER, organization, [],
    );
}

async function versionsOf(
    db: MemoryDbAdapter, token: string,
    family: string, id: string,
): Promise<{ state: string; member_id: string }[]> {
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/' + family
            + '/' + id + '/versions/',
        token,
    ));
    assertStrictEquals(res.status, 200);
    return await res.json() as {
        state: string; member_id: string;
    }[];
}

const PROJECT_DRIFT_Z = generateIdentifier();
const PROJECT_DRIFT_A = generateIdentifier();
const PROJECT_DRIFT_M = generateIdentifier();
const PROJECT_DRIFT_LIFECYCLE = generateIdentifier();
const PROJECT_DRIFT_CONVERSION = generateIdentifier();
const EV_DRIFT_CONVERSION_IDEA = generateIdentifier();

// Phase Final Task 2: projects(+project_flows+scores)
// dual-write stripped. This file no longer compares derive
// vs old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions
// and non-lexical live fixtures (byIdAscending must diverge
// from insertion order; never function-vs-function only).
const EV_DRIFT_CONVERSION_PROJECT = generateIdentifier();

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
    });
}

function projectDocument(title: string, state: string, position = 1) {
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
// entity fields only.
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

// GET projectEntityOf form: entity fields plus the head
// body's own state.
function wireProjectGet(
    id: string,
    title: string,
    state: string,
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

Deno.test('seeded GET /projects wire equals stored live'
+ ' PUT bodies', async () => {
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
        assertStrictEquals(res.status, 200);
        const prefix = '/organizations/'
            + organization + '/projects/';
        assertStrictEquals(
            await res.text(),
            await storedCollectionText(db, prefix),
        );
    }
});

Deno.test('per-project GET wire equals the stored PUT'
+ ' body', async () => {
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
        assertStrictEquals(res.status, 200);
        const prefix = '/organizations/'
            + seed.organization + '/projects/';
        const text = await res.text();
        assertStrictEquals(
            text,
            await storedPutBodyText(db, prefix, seed.id),
        );
        if (seed.title !== undefined) {
            const parsed = JSON.parse(text) as {
                title: string; position: number;
            };
            assertStrictEquals(parsed.title, seed.title);
            assertStrictEquals(parsed.position, seed.position);
        }
    }
});

Deno.test('a foreign-org project id 404s on GET',
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
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: projects/' + foreign.id,
    );
});

// Live fixtures inserted NON-LEX (z, then a, then m) so
// oldest live head (at, id) is insertion, not id-lex.
Deno.test('GET /projects collection is oldest live head '
+ '(at, id) first after non-lex PUTs',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: PROJECT_DRIFT_Z,
            title: 'Zulu',
        },
        {
            id: PROJECT_DRIFT_A,
            title: 'Alpha',
        },
        {
            id: PROJECT_DRIFT_M,
            title: 'Mike',
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + f.id
                , token,
            projectDocument(f.title, 'submitted'),
        ));
        assertStrictEquals(put.status, 201);
        assertEquals(
            await put.json(),
            wireProjectGet(f.id, f.title, 'submitted'),
        );
    }
    const res = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            , token),
    );
    assertStrictEquals(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        [
            PROJECT_DRIFT_Z,
            PROJECT_DRIFT_A,
            PROJECT_DRIFT_M,
        ].includes(row.id));
    assertEquals(
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
        assertStrictEquals(single.status, 200);
        assertStrictEquals(
            await single.text(),
            await storedPutBodyText(db, prefix, row.id),
        );
    }
});

Deno.test('live-write case: create + edit + transition + delete',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = PROJECT_DRIFT_LIFECYCLE;

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            , token, {
            ...projectDocument('Lifecycle Project', 'submitted'),
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
    assertStrictEquals(beforeDelete.status, 200);
    const beforeText = await beforeDelete.text();
    assertStrictEquals(
        beforeText,
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        ),
    );
    const beforeDocument = await getDocument(
        db, 'projects', 'AjdvjuECVZEgZoFajaIEkg', projectId,
    );
    assertEquals(beforeDocument, JSON.parse(beforeText));
    assertStrictEquals(
        (beforeDocument as { state: string }).state, 'under_review',
    );

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
    assertStrictEquals(deleted.status, 200);
    assertStrictEquals(
        await deleted.text(),
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/', projectId,
        ),
    );
    await assertRejects(
        () => getDocument(
            db, 'projects', 'AjdvjuECVZEgZoFajaIEkg', projectId,
        ),
        EntityNotFoundError,
    );
    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            , token),
    );
    const list = await listRes.json() as { id: string }[];
    assertStrictEquals(
        list.some((p) => p.id === projectId), true,
    );
});

Deno.test('live conversion case: a converted idea\'s project'
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
    assertStrictEquals(conv.status, 201);

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId, token),
    );
    assertStrictEquals(getRes.status, 200);
    const wireText = await getRes.text();
    const wire = JSON.parse(wireText) as { title: string };
    assertStrictEquals(wire.title, 'Converted Project');
    const document = await getDocument(
        db, 'projects', 'AjdvjuECVZEgZoFajaIEkg', projectId,
    );
    assertEquals(document, JSON.parse(wireText));
    assertStrictEquals(
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
    assert(list.some((p) => p.id === projectId));

    const versions = await versionsOf(
        db, token, 'projects', projectId,
    );
    assertStrictEquals(versions.length, 1);
    assertStrictEquals(versions[0]!.state, 'submitted');
});
