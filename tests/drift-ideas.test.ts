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
import { buildIdeas } from '../api/mock-data/ideas.ts';
import { assignOrganization } from
    '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveIdeaSubmissions,
} from '../api/derive-ideas.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    assertPartsAreHeads,
    partBodiesOf,
    partsOf,
    storedPutBodyText,
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

const IDEA_DRIFT_Z = generateIdentifier();
const IDEA_DRIFT_A = generateIdentifier();
const IDEA_DRIFT_M = generateIdentifier();
const IDEA_DRIFT_SUBMISSION_PARITY = generateIdentifier();
const IDEA_DRIFT_CONVERSION_PROMOTED = generateIdentifier();
const PROJECT_DRIFT_CONVERSION_PROMOTED = generateIdentifier();
const EV_DRIFT_CONVERSION_PROMOTED = generateIdentifier();
const EV_DRIFT_CONVERSION_PROJECT = generateIdentifier();

// Phase Final Task 2: ideas(+idea_submissions) dual-write
// stripped. This file no longer compares derive vs old-table
// oracles — the row plane is empty after seed. Coverage
// re-homes to wire-byte handleRequest assertions and
// non-lexical live fixtures (oldest live head (at, id)
// first; insertion diverges from id-lex).

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

function ideaDocument(title: string, state: string, position = 1) {
    return {
        title,
        position,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state,
    };
}

// PUT response shape (documentWriteResponseSpec / G1):
// entity fields only.
function wireIdeaPut(
    id: string,
    title: string,
    position = 1,
    organization = 'AjdvjuECVZEgZoFajaIEkg',
) {
    return {
        id,
        organization_id: organization,
        title,
        position,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

// GET ideaEntityOf form: entity fields plus the head body's
// own state.
function wireIdeaGet(
    id: string,
    title: string,
    state: string,
    position = 1,
    organization = 'AjdvjuECVZEgZoFajaIEkg',
) {
    return {
        ...wireIdeaPut(id, title, position, organization),
        state,
    };
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

const SEEDED_IDEAS = buildIdeas().map((idea, index) => ({
    id: idea.id,
    organization: assignOrganization(index),
    title: idea.title,
    position: idea.position,
    problem_statement: idea.problem_statement,
    target_users: idea.target_users,
    proposed_solution: idea.proposed_solution,
    expected_outcome: idea.expected_outcome,
    success_metrics: idea.success_metrics,
}));

Deno.test('seeded GET /ideas wire equals stored live PUT bodies',
async () => {
    const db = await seededDb();
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + organization + '/ideas/',
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        await assertPartsAreHeads(
            db, await partsOf(res), { sees: 'whole' },
        );
    }
});

Deno.test('per-idea GET wire equals the stored PUT body',
async () => {
    const db = await seededDb();
    for (const seed of SEEDED_IDEAS) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', seed.organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + seed.organization
                    + '/ideas/' + seed.id,
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        const prefix = '/organizations/'
            + seed.organization + '/ideas/';
        const text = await res.text();
        assertStrictEquals(
            text,
            await storedPutBodyText(db, prefix, seed.id),
        );
        const parsed = JSON.parse(text) as {
            title: string; position: number;
        };
        assertStrictEquals(parsed.title, seed.title);
        assertStrictEquals(parsed.position, seed.position);
    }
});

Deno.test('a foreign-org idea id 404s on GET',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_IDEAS.find(
        (seed) => seed.organization === 'AjdvjuECVZEgZoFajaIEkg',
    )!;
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/BBjWJsjYIDkTRKIIPrzWRw/ideas/' + foreign.id
                , token,
        ),
    );
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: ideas/' + foreign.id,
    );
});

// Live fixtures inserted NON-LEX (z, then a, then m) so
// oldest live head (at, id) is insertion, not id-lex.
Deno.test('GET /ideas is oldest live head (at, id) first; '
+ 'bodies equal GET /organizations/:id/ideas/:id (minus Date)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: IDEA_DRIFT_Z,
            title: 'Zulu',
        },
        {
            id: IDEA_DRIFT_A,
            title: 'Alpha',
        },
        {
            id: IDEA_DRIFT_M,
            title: 'Mike',
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + f.id
                , token,
            ideaDocument(f.title, 'active'),
        ));
        assertStrictEquals(put.status, 201);
        // PUT response is canonicalJson (sorted keys) from
        // the stored pair; values match WRITE_RESPONSE_SPECS.
        assertEquals(
            await put.json(),
            wireIdeaGet(f.id, f.title, 'active'),
        );
    }
    // Oldest live head (at, id): z, a, m — insertion, not
    // id-lex a, m, z. Bodies equal stored PUT (Task 19).
    const res = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', token),
    );
    assertStrictEquals(res.status, 200);
    assert(res.headers.get('Date'));
    assertStrictEquals(res.headers.get('ETag'), null);
    const list = await partBodiesOf<{ id: string }>(res);
    const added = list.filter((row) =>
        [
            IDEA_DRIFT_Z, IDEA_DRIFT_A, IDEA_DRIFT_M,
        ].includes(row.id));
    assertEquals(
        added.map((row) => row.id),
        [IDEA_DRIFT_Z, IDEA_DRIFT_A, IDEA_DRIFT_M],
    );
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    for (const row of added) {
        const single = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + row.id, token),
        );
        assertStrictEquals(single.status, 200);
        assertStrictEquals(
            await single.text(),
            await storedPutBodyText(db, prefix, row.id),
        );
        assertEquals(
            JSON.parse(await storedPutBodyText(
                db, prefix, row.id,
            )),
            row,
        );
    }
});

Deno.test('submission PUT/GET wire matches literal reconstruction',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = IDEA_DRIFT_SUBMISSION_PARITY;
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Submission Parity', 'active'),
    ));
    const subBody = {
        idea_id: ideaId,
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: '2026-02-01T00:00:01.000000Z',
    };
    const putRes = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/submissions/uUxVMlhmrrgaNuqzpdGCUw',
        token, subBody,
    ));
    assertStrictEquals(putRes.status, 201);
    // derive / GET insertion order (id, idea_id, member_id, at).
    const expectedSub = {
        id: 'uUxVMlhmrrgaNuqzpdGCUw',
        idea_id: ideaId,
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: '2026-02-01T00:00:01.000000Z',
    };
    // PUT response is canonicalJson (sorted keys); values match.
    assertEquals(await putRes.json(), expectedSub);
    const listRes = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/submissions/', token,
    ));
    assertStrictEquals(listRes.status, 200);
    assertStrictEquals(
        await listRes.text(),
        JSON.stringify([expectedSub]),
    );
    const derived = await deriveIdeaSubmissions(
        db, 'AjdvjuECVZEgZoFajaIEkg', ideaId,
    );
    assertEquals(derived, [expectedSub]);
});

Deno.test('seeded idea submissions: derive non-empty for every'
+ ' seeded idea, per org', async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_IDEAS) {
        const derived = await deriveIdeaSubmissions(
            db, organization, id,
        );
        assert(
            derived.length > 0,
            'seeded submission missing for ' + id,
        );
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const res = await handleRequest(db, req(
            'GET',
            '/organizations/' + organization
                + '/ideas/' + id + '/submissions/',
            token,
        ));
        assertStrictEquals(res.status, 200);
        assertStrictEquals(
            await res.text(), JSON.stringify(derived),
        );
    }
});

Deno.test('live-write lifecycle: create + edit + transition +'
+ ' delete', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = generateIdentifier();

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Lifecycle Idea', 'active'),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Lifecycle Idea Edited', 'active', 2),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Lifecycle Idea Edited', 'in_review', 2),
    ));
    const beforeDelete = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + ideaId, token),
    );
    assertStrictEquals(beforeDelete.status, 200);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    assertStrictEquals(
        await beforeDelete.text(),
        await storedPutBodyText(db, prefix, ideaId),
    );

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Lifecycle Idea Edited', 'deleted', 2),
    ));

    // A state-deleted head is Gone (spec §5).
    const afterDelete = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + ideaId, token),
    );
    assertStrictEquals(afterDelete.status, 410);
    await afterDelete.body?.cancel();
    await assertRejects(
        () => getDocument(
            db, 'ideas', 'AjdvjuECVZEgZoFajaIEkg', ideaId,
        ),
        EntityNotFoundError,
    );
    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', token),
    );
    const list = await partBodiesOf<{ id: string }>(listRes);
    assertStrictEquals(
        list.some((idea) => idea.id === ideaId), false,
    );
});

Deno.test('live approve then convert: the idea reads'
+ ' promoted', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = IDEA_DRIFT_CONVERSION_PROMOTED;
    const projectId = PROJECT_DRIFT_CONVERSION_PROMOTED;

    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Approve Then Convert', 'active'),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('Approve Then Convert', 'approved'),
    ));
    const ideaHead = await db.messagePairs.getHeadPair(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', ideaId,
    );
    const convert = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/conversion',
        token,
        headers: { 'If-Match': '"' + ideaHead!.id + '"' },
        body: {
            projectId,
            project: {
                title: 'Converted Project',
                description: 'done when X',
                progress: 0,
                start_date: '2026-06-01',
                target_end_date: '2026-09-01',
                estimated_cost: 100,
                actual_cost: 0,
                position: 1,
            },
            idea: {
                title: 'Approve Then Convert',
                position: 1,
                problem_statement: 'p',
                target_users: 't',
                proposed_solution: 's',
                expected_outcome: 'o',
                success_metrics: 'm',
            },
            ideaStateEventId: EV_DRIFT_CONVERSION_PROMOTED,
            ideaState: 'promoted',
            projectStateEventId: EV_DRIFT_CONVERSION_PROJECT,
            projectState: 'submitted',
            ideaStateAt: '2026-06-03T00:00:00.000000Z',
            projectStateAt: '2026-06-03T00:00:01.000000Z',
            baselines: [],
        },
    }));
    assertStrictEquals(convert.status, 200);
    assertEquals(
        await convert.json(),
        JSON.parse(await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', ideaId,
        )),
    );

    const document = await getDocument(
        db, 'ideas', 'AjdvjuECVZEgZoFajaIEkg', ideaId,
    ) as { state: string };
    assertStrictEquals(document.state, 'promoted');
    // Entity GET streams the stored PUT (conversion document).
    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + ideaId, token),
    );
    assertStrictEquals(getRes.status, 200);
    assertStrictEquals(
        await getRes.text(),
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', ideaId,
        ),
    );
});

// The conversion body the four latch pins below send: an
// approved idea promoted into a fresh project, no baselines.
function conversionBody(title: string): Record<string, unknown> {
    return {
        projectId: generateIdentifier(),
        project: {
            title: 'Converted ' + title,
            description: 'done when X',
            progress: 0,
            start_date: '2026-06-01',
            target_end_date: '2026-09-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
        },
        idea: {
            title,
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
        },
        ideaStateEventId: generateIdentifier(),
        ideaState: 'promoted',
        projectStateEventId: generateIdentifier(),
        projectState: 'submitted',
        ideaStateAt: '2026-06-03T00:00:00.000000Z',
        projectStateAt: '2026-06-03T00:00:01.000000Z',
        baselines: [],
    };
}

const IDEAS = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';

async function approvedIdea(
    db: MemoryDbAdapter,
    token: string,
    title: string,
): Promise<{ id: string, etag: string }> {
    const id = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', IDEAS + id, token, ideaDocument(title, 'approved'),
    ));
    await res.body?.cancel();
    const etag = res.headers.get('etag');
    assert(etag !== null);
    return { id, etag };
}

function conversionRequest(
    ideaId: string,
    token: string,
    body: Record<string, unknown>,
    etag?: string,
): Request {
    return apiRequest({
        method: 'POST',
        path: IDEAS + ideaId + '/conversion',
        token,
        body,
        ...(etag !== undefined
            ? { headers: { 'If-Match': etag } }
            : {}),
    });
}

Deno.test('a conversion without If-Match is 428', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const idea = await approvedIdea(db, token, 'Untagged');
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, conversionRequest(
        idea.id, token, conversionBody('Untagged'),
    ));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a conversion answers the idea\'s state', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const idea = await approvedIdea(db, token, 'Answered');
    const res = await handleRequest(db, conversionRequest(
        idea.id, token, conversionBody('Answered'), idea.etag,
    ));
    assertStrictEquals(res.status, 200);
    const head = await db.messagePairs.getHeadPair(
        IDEAS, idea.id,
    );
    assert(head !== null);
    assertStrictEquals(res.headers.get('etag'), '"' + head.id + '"');
    const state = await res.json() as { state: string };
    assertEquals(
        state,
        JSON.parse(await storedPutBodyText(db, IDEAS, idea.id)),
    );
    assertStrictEquals(state.state, 'promoted');
});

Deno.test('a conversion of a missing idea is 404', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const missing = generateIdentifier();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, conversionRequest(
        missing, token, conversionBody('Missing'),
        '"' + generateIdentifier() + '"',
    ));
    assertStrictEquals(res.status, 404);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    assertStrictEquals(
        await db.messagePairs.getHeadPair(IDEAS, missing), null,
    );
});

Deno.test('a stale conversion tag is 412', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const idea = await approvedIdea(db, token, 'Stale');
    const edited = await handleRequest(db, req(
        'PUT', IDEAS + idea.id, token,
        ideaDocument('Stale', 'approved', 2),
    ));
    assertStrictEquals(edited.status, 200);
    await edited.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, conversionRequest(
        idea.id, token, conversionBody('Stale'), idea.etag,
    ));
    assertStrictEquals(res.status, 412);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
