import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from '../api/db.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
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

// Phase Final Task 2: ideas(+idea_submissions) dual-write
// stripped. This file no longer compares derive vs old-table
// oracles — the row plane is empty after seed. Coverage
// re-homes to wire-byte handleRequest assertions and
// non-lexical live fixtures (drift-identity-tokens
// craftsmanship: byIdAscending must diverge from insertion
// order; never function-vs-function only).

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
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

// PUT response shape (documentWriteResponseSpec successBody):
// entity fields only — no lifecycle trio on the write wire.
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
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await postMockDataLoad(db);
    return db;
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

test('seeded GET /ideas wire equals deriveIdeas per org',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(
            db, req('GET', '/ideas', token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveIdeas(db, organization);
        assert.equal(wireText, JSON.stringify(derived));
        assert.ok(derived.length > 0);
    }
});

test('per-idea GET wire equals deriveIdea for every seed',
async () => {
    const db = await seededDb();
    for (const seed of SEEDED_IDEAS) {
        const token = await organizationToken(
            'current', seed.organization,
        );
        const res = await handleRequest(
            db, req('GET', '/ideas/' + seed.id, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveIdea(
            db, seed.organization, seed.id,
        );
        assert.equal(wireText, JSON.stringify(derived));
        assert.equal(derived.title, seed.title);
        assert.equal(derived.position, seed.position);
    }
});

test('a foreign-org idea id 403s on GET and on derive',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_IDEAS.find(
        (seed) => seed.organization === '1',
    )!;
    const token = await organizationToken('current', '2');
    const res = await handleRequest(
        db, req('GET', '/ideas/' + foreign.id, token),
    );
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'forbidden: ideas/' + foreign.id
        + ' belongs to a different organization',
    );
    await assert.rejects(
        () => deriveIdea(db, '2', foreign.id),
        ForeignOrganizationError,
    );
});

// Live fixtures inserted NON-LEX (z, then a, then m) so
// byIdAscending collection order diverges from insertion.
test('GET /ideas collection is wire byte-identical to a'
+ ' literal id-lex reconstruction after non-lex PUTs',
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
            'PUT', '/ideas/' + f.id, token,
            ideaDocument(f.title, 'active', f.at, f.ev),
        ));
        assert.equal(put.status, 200);
        // PUT response is canonicalJson (sorted keys) from
        // the stored pair; values match WRITE_RESPONSE_SPECS.
        assert.deepEqual(
            await put.json(),
            wireIdeaPut(f.id, f.title),
        );
    }
    // id-lex expected order: a, m, z — NOT insertion order.
    const expectedAdded = [
        wireIdeaGet(
            'idea-drift-a', 'Alpha', 'active',
            '2026-07-01T00:00:01.000000Z', 'ev-drift-a',
        ),
        wireIdeaGet(
            'idea-drift-m', 'Mike', 'active',
            '2026-07-01T00:00:02.000000Z', 'ev-drift-m',
        ),
        wireIdeaGet(
            'idea-drift-z', 'Zulu', 'active',
            '2026-07-01T00:00:00.000000Z', 'ev-drift-z',
        ),
    ];
    const res = await handleRequest(
        db, req('GET', '/ideas', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        row.id.startsWith('idea-drift-'));
    assert.equal(
        JSON.stringify(added),
        JSON.stringify(expectedAdded),
    );
    for (const row of expectedAdded) {
        const single = await handleRequest(
            db, req('GET', '/ideas/' + row.id, token),
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
    const ideaId = 'idea-drift-authorship-caveat';

    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, tokenA, {
            ...ideaDocument(
                'First', 'active',
                '2026-04-01T00:00:00.000000Z',
                'ev-drift-authorship-caveat',
            ),
        },
    ));
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, tokenB, {
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
    // head event stays on member A; GET trio is the one event.
    const getRes = await handleRequest(
        db, req('GET', '/ideas/' + ideaId, tokenA),
    );
    assert.equal(getRes.status, 200);
    assert.equal(
        await getRes.text(),
        JSON.stringify(wireIdeaGet(
            ideaId, 'Second', 'active',
            '2026-04-01T00:00:00.000000Z',
            'ev-drift-authorship-caveat',
        )),
    );
});

test('submission PUT/GET wire matches literal reconstruction',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = 'idea-drift-submission-parity';
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
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
        '/ideas/' + ideaId + '/submissions/sub-drift-1',
        token, subBody,
    ));
    assert.equal(putRes.status, 200);
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
        'GET', '/ideas/' + ideaId + '/submissions', token,
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
            'GET', '/ideas/' + id + '/submissions', token,
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
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea', 'active',
            '2026-03-01T00:00:00.000000Z',
            'ev-drift-lifecycle-genesis',
        ),
    ));
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea Edited', 'active',
            '2026-03-01T00:00:00.000000Z',
            'ev-drift-lifecycle-genesis',
            2,
        ),
    ));
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea Edited', 'in_review',
            '2026-03-02T00:00:00.000000Z',
            'ev-drift-lifecycle-review',
            2,
        ),
    ));
    const beforeDelete = await handleRequest(
        db, req('GET', '/ideas/' + ideaId, token),
    );
    assert.equal(beforeDelete.status, 200);
    assert.equal(
        await beforeDelete.text(),
        JSON.stringify(wireIdeaGet(
            ideaId, 'Lifecycle Idea Edited', 'in_review',
            '2026-03-02T00:00:00.000000Z',
            'ev-drift-lifecycle-review',
            2,
        )),
    );

    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Lifecycle Idea Edited', 'deleted',
            '2026-03-03T00:00:00.000000Z',
            'ev-drift-lifecycle-deleted',
            2,
        ),
    ));

    const afterDelete = await handleRequest(
        db, req('GET', '/ideas/' + ideaId, token),
    );
    assert.equal(afterDelete.status, 404);
    await assert.rejects(
        () => deriveIdea(db, '1', ideaId),
        EntityNotFoundError,
    );
    const listRes = await handleRequest(
        db, req('GET', '/ideas', token),
    );
    const list = await listRes.json() as { id: string }[];
    assert.equal(
        list.some((idea) => idea.id === ideaId), false,
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
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Approve Then Convert', 'active',
            '2026-06-01T00:00:00.000000Z',
            'ev-drift-conversion-active',
        ),
    ));
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Approve Then Convert', 'approved',
            '2026-06-02T00:00:00.000000Z',
            'ev-drift-conversion-approved',
        ),
    ));
    const convert = await handleRequest(db, req(
        'POST', '/ideas/' + ideaId + '/conversion', token, {
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
    assert.equal(convert.status, 204);

    const derived = await deriveIdeaStateHistory(
        db, '1', ideaId,
    );
    assert.equal(derived.length, 3);
    assert.ok(
        derived.some((event) => event.state === 'promoted'),
    );
    // Entity GET still serves the promoted idea (only
    // 'deleted' tombstones); list filters via ideaIsVisible.
    // GET trio is the lifecycle-current 'promoted' event.
    const getRes = await handleRequest(
        db, req('GET', '/ideas/' + ideaId, token),
    );
    assert.equal(getRes.status, 200);
    assert.equal(
        await getRes.text(),
        JSON.stringify(wireIdeaGet(
            ideaId, 'Approve Then Convert', 'promoted',
            '2026-06-03T00:00:00.000000Z',
            'ev-drift-conversion-promoted',
        )),
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
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Genesis Title', 'active', genesisAt, genesisEv,
        ),
    ));
    assert.equal(genesis.status, 200);

    // Later arrival, earlier state_at, different state + title.
    const skewed = await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Skewed Title', 'in_review', skewedAt, skewedEv,
        ),
    ));
    assert.equal(skewed.status, 200);

    const expected = wireIdeaGet(
        ideaId, 'Skewed Title', 'active', genesisAt, genesisEv,
    );
    const getRes = await handleRequest(
        db, req('GET', '/ideas/' + ideaId, token),
    );
    assert.equal(getRes.status, 200);
    assert.equal(await getRes.text(), JSON.stringify(expected));

    const derived = await deriveIdea(db, '1', ideaId);
    assert.equal(
        JSON.stringify(derived), JSON.stringify(expected),
    );
    assert.equal(derived.title, 'Skewed Title');
    assert.equal(derived.state, 'active');
    assert.equal(derived.state_at, genesisAt);
    assert.equal(derived.state_event_id, genesisEv);

    const listRes = await handleRequest(
        db, req('GET', '/ideas', token),
    );
    assert.equal(listRes.status, 200);
    const list = await listRes.json() as {
        id: string;
        state: string;
        state_at: string;
        state_event_id: string;
        title: string;
    }[];
    const row = list.find((idea) => idea.id === ideaId);
    assert.deepEqual(row, expected);
});
