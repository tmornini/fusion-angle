import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
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
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
    storedCollectionText,
} from './http-fixtures.ts';

// Phase Final Task 2: ideas(+idea_submissions) dual-write
// stripped. This file no longer compares derive vs old-table
// oracles — the row plane is empty after seed. Coverage
// re-homes to wire-byte handleRequest assertions and
// non-lexical live fixtures (oldest live head (at, id)
// first; insertion diverges from id-lex).

const BASE = 'http://localhost';

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

function ideaDocument(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
    position = 1,
) {
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
// entity fields plus lifecycle-current trio.
function wireIdeaPut(
    id: string,
    title: string,
    position = 1,
    organization = '1',
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

// GET ideaEntityOf form: entity fields plus lifecycle-current
// trio (state ← event.state, state_at ← event.at,
// state_event_id ← event.id) — never the head body trio.
function wireIdeaGet(
    id: string,
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
    position = 1,
    organization = '1',
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

test('seeded GET /ideas wire equals stored live PUT bodies',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + organization + '/ideas/',
                token,
            ),
        );
        assert.equal(res.status, 200);
        const prefix = '/organizations/'
            + organization + '/ideas/';
        assert.equal(
            await res.text(),
            await storedCollectionText(db, prefix),
        );
        const derived = await deriveIdeas(db, organization);
        assert.ok(derived.length > 0);
    }
});

test('per-idea GET wire equals the stored PUT body',
async () => {
    const db = await seededDb();
    for (const seed of SEEDED_IDEAS) {
        const token = await organizationToken(
            'current', seed.organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + seed.organization
                    + '/ideas/' + seed.id,
                token,
            ),
        );
        assert.equal(res.status, 200);
        const prefix = '/organizations/'
            + seed.organization + '/ideas/';
        assert.equal(
            await res.text(),
            await storedPutBodyText(db, prefix, seed.id),
        );
        const derived = await deriveIdea(
            db, seed.organization, seed.id,
        );
        assert.equal(derived.title, seed.title);
        assert.equal(derived.position, seed.position);
    }
});

test('a foreign-org idea id 404s on GET and on derive',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_IDEAS.find(
        (seed) => seed.organization === '1',
    )!;
    const token = await organizationToken('current', '2');
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/2/ideas/' + foreign.id, token,
        ),
    );
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: ideas/' + foreign.id,
    );
    await assert.rejects(
        () => deriveIdea(db, '2', foreign.id),
        EntityNotFoundError,
    );
});

// Live fixtures inserted NON-LEX (z, then a, then m) so
// oldest live head (at, id) is insertion, not id-lex.
test('GET /ideas is oldest live head (at, id) first; '
+ 'bodies equal GET /organizations/:id/ideas/:id (minus Date)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: 'idea-drift-z',
            title: 'Zulu',
            at: '2026-07-01T00:00:00.000000Z',
            ev: 'ev-drift-z',
        },
        {
            id: 'idea-drift-a',
            title: 'Alpha',
            at: '2026-07-01T00:00:01.000000Z',
            ev: 'ev-drift-a',
        },
        {
            id: 'idea-drift-m',
            title: 'Mike',
            at: '2026-07-01T00:00:02.000000Z',
            ev: 'ev-drift-m',
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/organizations/1/ideas/' + f.id, token,
            ideaDocument(f.title, 'active', f.at, f.ev),
        ));
        assert.equal(put.status, 201);
        // PUT response is canonicalJson (sorted keys) from
        // the stored pair; values match WRITE_RESPONSE_SPECS.
        assert.deepEqual(
            await put.json(),
            wireIdeaGet(f.id, f.title, 'active', f.at, f.ev),
        );
    }
    // Oldest live head (at, id): z, a, m — insertion, not
    // id-lex a, m, z. Bodies equal stored PUT (Task 19).
    const res = await handleRequest(
        db, req('GET', '/organizations/1/ideas/', token),
    );
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('Date'));
    assert.equal(res.headers.get('ETag'), null);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        row.id.startsWith('idea-drift-'));
    assert.deepEqual(
        added.map((row) => row.id),
        ['idea-drift-z', 'idea-drift-a', 'idea-drift-m'],
    );
    const prefix = '/organizations/1/ideas/';
    for (const row of added) {
        const single = await handleRequest(
            db, req('GET', '/organizations/1/ideas/' + row.id, token),
        );
        assert.equal(single.status, 200);
        assert.equal(
            await single.text(),
            await storedPutBodyText(db, prefix, row.id),
        );
        assert.deepEqual(
            JSON.parse(await storedPutBodyText(
                db, prefix, row.id,
            )),
            row,
        );
    }
});

test('derived history keeps the FIRST arrival\'s authorship'
+ ' on a same-trio resend by a different member', async () => {
    const db = await seededDb();
    await seedOrganizationMember(db, 'member-b');
    const tokenA = await organizationToken('current');
    const tokenB = await organizationToken('member-b');
    const ideaId = 'idea-drift-authorship-caveat';

    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, tokenA, {
            ...ideaDocument(
                'First', 'active',
                '2026-04-01T00:00:00.000000Z',
                'ev-drift-authorship-caveat',
            ),
        },
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, tokenB, {
            ...ideaDocument(
                'Second', 'active',
                '2026-04-01T00:00:00.000000Z',
                'ev-drift-authorship-caveat',
            ),
        },
    ));

    const derived = await deriveIdeaStateHistory(
        db, '1', ideaId,
    );
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.member_id, 'current');

    // Wire entity reflects the SECOND title; authorship of the
    // head event stays on member A. GET streams the stored PUT.
    const getRes = await handleRequest(
        db, req('GET', '/organizations/1/ideas/' + ideaId, tokenA),
    );
    assert.equal(getRes.status, 200);
    assert.equal(
        await getRes.text(),
        await storedPutBodyText(
            db, '/organizations/1/ideas/', ideaId,
        ),
    );
});

test('submission PUT/GET wire matches literal reconstruction',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-submission-parity';
    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Submission Parity', 'active',
            '2026-02-01T00:00:00.000000Z',
            'ev-drift-submission-parity',
        ),
    ));
    const subBody = {
        idea_id: ideaId,
        member_id: 'current',
        at: '2026-02-01T00:00:01.000000Z',
    };
    const putRes = await handleRequest(db, req(
        'PUT',
        '/organizations/1/ideas/' + ideaId + '/submissions/sub-drift-1',
        token, subBody,
    ));
    assert.equal(putRes.status, 201);
    // derive / GET insertion order (id, idea_id, member_id, at).
    const expectedSub = {
        id: 'sub-drift-1',
        idea_id: ideaId,
        member_id: 'current',
        at: '2026-02-01T00:00:01.000000Z',
    };
    // PUT response is canonicalJson (sorted keys); values match.
    assert.deepEqual(await putRes.json(), expectedSub);
    const listRes = await handleRequest(db, req(
        'GET', '/organizations/1/ideas/' + ideaId + '/submissions/', token,
    ));
    assert.equal(listRes.status, 200);
    assert.equal(
        await listRes.text(),
        JSON.stringify([expectedSub]),
    );
    const derived = await deriveIdeaSubmissions(
        db, '1', ideaId,
    );
    assert.deepEqual(derived, [expectedSub]);
});

test('seeded idea submissions: derive non-empty for every'
+ ' seeded idea, per org', async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_IDEAS) {
        const derived = await deriveIdeaSubmissions(
            db, organization, id,
        );
        assert.ok(
            derived.length > 0,
            'seeded submission missing for ' + id,
        );
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(db, req(
            'GET',
            '/organizations/' + organization
                + '/ideas/' + id + '/submissions/',
            token,
        ));
        assert.equal(res.status, 200);
        assert.equal(
            await res.text(), JSON.stringify(derived),
        );
    }
});

test('live-write lifecycle: create + edit + transition +'
+ ' delete, wire and derive agree', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-lifecycle';

    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea', 'active',
            '2026-03-01T00:00:00.000000Z',
            'ev-drift-lifecycle-genesis',
        ),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea Edited', 'active',
            '2026-03-01T00:00:00.000000Z',
            'ev-drift-lifecycle-genesis',
            2,
        ),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea Edited', 'in_review',
            '2026-03-02T00:00:00.000000Z',
            'ev-drift-lifecycle-review',
            2,
        ),
    ));
    const beforeDelete = await handleRequest(
        db, req('GET', '/organizations/1/ideas/' + ideaId, token),
    );
    assert.equal(beforeDelete.status, 200);
    const prefix = '/organizations/1/ideas/';
    assert.equal(
        await beforeDelete.text(),
        await storedPutBodyText(db, prefix, ideaId),
    );

    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea Edited', 'deleted',
            '2026-03-03T00:00:00.000000Z',
            'ev-drift-lifecycle-deleted',
            2,
        ),
    ));

    // Trio-deleted is still a live PUT head. GET streams it.
    // Derive still 404s the deleted state.
    const afterDelete = await handleRequest(
        db, req('GET', '/organizations/1/ideas/' + ideaId, token),
    );
    assert.equal(afterDelete.status, 200);
    assert.equal(
        await afterDelete.text(),
        await storedPutBodyText(db, prefix, ideaId),
    );
    await assert.rejects(
        () => deriveIdea(db, '1', ideaId),
        EntityNotFoundError,
    );
    const listRes = await handleRequest(
        db, req('GET', '/organizations/1/ideas/', token),
    );
    const list = await listRes.json() as { id: string }[];
    assert.equal(
        list.some((idea) => idea.id === ideaId), true,
    );

    const derivedHistory = await deriveIdeaStateHistory(
        db, '1', ideaId,
    );
    assert.equal(derivedHistory.length, 3);
});

test('live approve then convert: derived idea history'
+ ' includes \'promoted\'', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-conversion-promoted';
    const projectId = 'project-drift-conversion-promoted';

    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Approve Then Convert', 'active',
            '2026-06-01T00:00:00.000000Z',
            'ev-drift-conversion-active',
        ),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Approve Then Convert', 'approved',
            '2026-06-02T00:00:00.000000Z',
            'ev-drift-conversion-approved',
        ),
    ));
    const convert = await handleRequest(db, req(
        'POST', '/organizations/1/ideas/' + ideaId + '/conversion', token, {
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
            ideaStateEventId: 'ev-drift-conversion-promoted',
            ideaState: 'promoted',
            projectStateEventId: 'ev-drift-conversion-project',
            projectState: 'submitted',
            ideaStateAt: '2026-06-03T00:00:00.000000Z',
            projectStateAt: '2026-06-03T00:00:01.000000Z',
            baselines: [],
        },
    ));
    assert.equal(convert.status, 201);

    const derived = await deriveIdeaStateHistory(
        db, '1', ideaId,
    );
    assert.equal(derived.length, 3);
    assert.ok(
        derived.some((event) => event.state === 'promoted'),
    );
    // Entity GET streams the stored PUT (conversion document).
    const getRes = await handleRequest(
        db, req('GET', '/organizations/1/ideas/' + ideaId, token),
    );
    assert.equal(getRes.status, 200);
    assert.equal(
        await getRes.text(),
        await storedPutBodyText(
            db, '/organizations/1/ideas/', ideaId,
        ),
    );
});

// case-7d mirror for ideas GET: a clock-skewed later arrival
// whose state_at sorts BELOW genesis does NOT displace genesis
// as lifecycle-current. Head body fields (title) may reflect
// the later arrival; the GET trio must stay genesis.
test('GET idea trio is lifecycle-current under clock skew'
+ ' (genesis-wins-under-skew, case 7d)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-skew-1';
    const genesisAt = '2026-05-01T00:00:00.000000Z';
    const genesisEv = ideaId + '-genesis';
    const skewedAt = '2020-01-01T00:00:00.000000Z';
    const skewedEv = ideaId + '-skewed';

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Genesis Title', 'active', genesisAt, genesisEv,
        ),
    ));
    assert.equal(genesis.status, 201);

    // Later arrival, earlier state_at, different state + title.
    const skewed = await handleRequest(db, req(
        'PUT', '/organizations/1/ideas/' + ideaId, token,
        ideaDocument(
            'Skewed Title', 'in_review', skewedAt, skewedEv,
        ),
    ));
    assert.equal(skewed.status, 201);

    const getRes = await handleRequest(
        db, req('GET', '/organizations/1/ideas/' + ideaId, token),
    );
    assert.equal(getRes.status, 200);
    const prefix = '/organizations/1/ideas/';
    const expected = wireIdeaGet(
        ideaId, 'Skewed Title', 'in_review', genesisAt,
        genesisEv,
    );
    assert.deepEqual(await getRes.json(), expected);
    assert.deepEqual(
        JSON.parse(await storedPutBodyText(db, prefix, ideaId)),
        expected,
    );
    const derived = await deriveIdea(db, '1', ideaId);
    assert.equal(
        JSON.stringify(derived), JSON.stringify(expected),
    );
    assert.equal(derived.title, 'Skewed Title');
    assert.equal(derived.state, 'in_review');
});
