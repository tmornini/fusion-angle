import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Flow tags: the codebase's FIRST message-plane-ONLY document
// family (Phase 14 Task 9) — no backing table, derived entirely
// from message pairs at /organizations/:id/flows/:id/tags/:name.
// PUT/GET/DELETE
// lifecycle, Response-ID resolution (pinning), marked delete,
// and two-tag concurrency — the api-flow-document.test.ts
// precedent, re-nested one level deeper.

const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined ? { headers } : {}),
        operationId: TEST_OPERATION_ID,
    });
}

function flowFields(name: string) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function emptyDelta() {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

function emptyGraph() {
    return { nodes: [], edges: [] };
}

function documentBody(
    name: string,
    stateEventId: string,
) {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token,
        {
            id: flowId,
            flow: flowFields('Fresh Flow'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: 'qfhFObbtDfxUZwEGxySBoQ',
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
}

async function headResponseId(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert(id
        , 'no Response-ID on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + '' + flowId);
    return id!;
}

// --- commit 2: PUT/GET/DELETE lifecycle, marked delete ---

Deno.test('e2e: PUT organizations/:id/flows/:id/tags/:name'
    + ' creates a tag pinning the'
+ ' flow\'s current Response-ID; GET returns it', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'bsdgjfOvCYtykdqKWBOlWA');
    const responseId = await headResponseId(db, token
        , 'bsdgjfOvCYtykdqKWBOlWA');

    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bsdgjfOvCYtykdqKWBOlWA/tags/xDyDkxEPwtcNmJVknUHDsg', token,
        { flow_response_id: responseId },
    ));
    assertStrictEquals(put.status, 201);
    const putBody = await put.json() as {
        id: string; flow_id: string; flow_response_id: string;
    };
    assertEquals(putBody, {
        id: 'xDyDkxEPwtcNmJVknUHDsg', flow_id: 'bsdgjfOvCYtykdqKWBOlWA',
        flow_response_id: responseId,
    });

    const get = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bsdgjfOvCYtykdqKWBOlWA/tags/xDyDkxEPwtcNmJVknUHDsg', token,
    ));
    assertStrictEquals(get.status, 200);
    const getBody = await get.json() as {
        id: string; flow_id: string; flow_response_id: string;
    };
    assertEquals(getBody, putBody);
});

Deno.test('e2e: GET on a never-written tag name 404s', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cDEpYbTaWaXvRLuYuBSOoA');
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cDEpYbTaWaXvRLuYuBSOoA/tags/never', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('e2e: a re-PUT of the same tag name (pinning a DIFFERENT'
+ ' response) carries Supersedes to the first — the SIMPLE-class'
+ ' chain, a re-tag is a new head, never an edit', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cGVtCERtMGxhyNGAsQBBuQ');
    const r1 = await headResponseId(db, token
        , 'cGVtCERtMGxhyNGAsQBBuQ');

    const first = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cGVtCERtMGxhyNGAsQBBuQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
        { flow_response_id: r1 },
    ));
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    assert(firstId);

    // A genuinely DIFFERENT body (a second save's own response
    // id) — a byte-identical resend would instead hit the gate's
    // pre-tx idempotency fast path and replay the first response
    // unchanged (message-pair.ts), never forming a second pair.
    const saved = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cGVtCERtMGxhyNGAsQBBuQ', token,
        documentBody('Second Save', generateIdentifier()),
        { 'if-match': (
            await handleRequest(
                db, req('GET'
                    , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'cGVtCERtMGxhyNGAsQBBuQ', token),
            )
        ).headers.get('ETag')! },
    ));
    assertStrictEquals(saved.status, 201);
    const r2 = await headResponseId(db, token, 'cGVtCERtMGxhyNGAsQBBuQ');
    assertNotStrictEquals(r2, r1);

    const second = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cGVtCERtMGxhyNGAsQBBuQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
        { flow_response_id: r2 },
    ));
    assertStrictEquals(second.status, 201);
    const secondId = second.headers.get('Response-ID');
    assert(secondId);
    assertNotStrictEquals(secondId, firstId);

    const responses = await db.messagePairs.getAll();
    const secondRow = responses.find(r => r.id === secondId);
    assert(secondRow);
    assertStrictEquals('supersedes' in secondRow!, false);
    assertStrictEquals('follows' in secondRow!, false);
});

Deno.test('e2e: DELETE marks the tag — GET 404s after, and the'
+ ' DELETE pair carries Supersedes to the live head, never a'
+ ' physical splice', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cKweIyGvtrOHqQULtGJUZQ');
    const r1 = await headResponseId(db, token
        , 'cKweIyGvtrOHqQULtGJUZQ');

    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cKweIyGvtrOHqQULtGJUZQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
        { flow_response_id: r1 },
    ));
    assertStrictEquals(put.status, 201);

    const del = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cKweIyGvtrOHqQULtGJUZQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
    ));
    assertStrictEquals(del.status, 204);
    const delId = del.headers.get('Response-ID');
    assert(delId);

    const responses = await db.messagePairs.getAll();
    const delRow = responses.find(r => r.id === delId);
    assert(delRow);
    assertStrictEquals('supersedes' in delRow!, false);

    const requests = await db.messagePairs.getAll();
    const delRequest = requests.find(r => r.id === delId);
    assert(delRequest);
    // The DELETE row itself is present, unmoved — a marked
    // tombstone, never a physical splice of a prior row.
    assertStrictEquals(requests.length > 0, true);

    const get = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cKweIyGvtrOHqQULtGJUZQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
    ));
    assertStrictEquals(get.status, 404);
});

Deno.test('e2e: a malformed tag body (extra key) 400s and stores'
+ ' nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cOOLmJXlyeYuFYrSofTRmw');
    const r1 = await headResponseId(db, token
        , 'cOOLmJXlyeYuFYrSofTRmw');
    const before = await db.messagePairs.getAll();

    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cOOLmJXlyeYuFYrSofTRmw/tags/xDyDkxEPwtcNmJVknUHDsg', token,
        { flow_response_id: r1, extra: 'nope' },
    ));
    assertStrictEquals(res.status, 400);
    const after = await db.messagePairs.getAll();
    assertStrictEquals(after.length, before.length);
});

Deno.test('e2e: a malformed tag name (disallowed characters) 400s'
+ ' and stores nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    await createFlow(db, token, flowId);
    const r1 = await headResponseId(
        db, token, flowId,
    );
    const before = await db.messagePairs.getAll();

    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId + '/tags/'
            + 'not%20ok', token,
        { flow_response_id: r1 },
    ));
    assertStrictEquals(res.status, 400);
    const after = await db.messagePairs.getAll();
    assertStrictEquals(after.length, before.length);
});

Deno.test('e2e: a member-role identity (not just admin) can'
+ ' PUT/GET/DELETE a tag — MEMBER_VERBS widens'
+ ' /organizations/:id/flows/:id/tags', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'toccYYkLEABmlbpHJalgtQ');
    const adminToken = await organizationToken();
    const memberToken = await organizationToken('toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await createFlow(db, adminToken, 'cYEjfPMQAquxhDuXSIHlAQ');
    const r1 = await headResponseId(db, adminToken
        , 'cYEjfPMQAquxhDuXSIHlAQ');

    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cYEjfPMQAquxhDuXSIHlAQ/tags/xDyDkxEPwtcNmJVknUHDsg'
            , memberToken,
        { flow_response_id: r1 },
    ));
    assertStrictEquals(put.status, 201);

    const get = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cYEjfPMQAquxhDuXSIHlAQ/tags/xDyDkxEPwtcNmJVknUHDsg'
            , memberToken,
    ));
    assertStrictEquals(get.status, 200);

    const del = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cYEjfPMQAquxhDuXSIHlAQ/tags/xDyDkxEPwtcNmJVknUHDsg'
            , memberToken,
    ));
    assertStrictEquals(del.status, 204);
});

// Two DIFFERENT tag names, PUT concurrently on one flow: distinct
// addresses (no follows/supersedes collision), so both land —
// structural assertions only (both readable afterward), no timing.
Deno.test('e2e: two different tag names PUT concurrently on one flow'
+ ' both land', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cZEsJjunHJduajRIcdmmuw');
    const r1 = await headResponseId(db, token
        , 'cZEsJjunHJduajRIcdmmuw');

    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'cZEsJjunHJduajRIcdmmuw/tags/alpha', token,
            { flow_response_id: r1 },
        )),
        handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'cZEsJjunHJduajRIcdmmuw/tags/beta', token,
            { flow_response_id: r1 },
        )),
    ]);
    assertStrictEquals(a.status, 201);
    assertStrictEquals(b.status, 201);

    const gotAlpha = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cZEsJjunHJduajRIcdmmuw/tags/alpha', token,
    ));
    const gotBeta = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cZEsJjunHJduajRIcdmmuw/tags/beta', token,
    ));
    assertStrictEquals(gotAlpha.status, 200);
    assertStrictEquals(gotBeta.status, 200);
    assertEquals(
        (await gotAlpha.json() as { id: string }).id, 'alpha',
    );
    assertEquals(
        (await gotBeta.json() as { id: string }).id, 'beta',
    );
});

// --- commit 3: pin tag resolution to response ids ---

Deno.test('e2e: a tag written once still resolves to the EXACT'
+ ' tagged response after the flow is saved twice more — the'
+ ' pin never follows the flow\'s own moving head', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cadVHBQlvTvWsTriyDUeTQ');
    const r1 = await headResponseId(db, token
        , 'cadVHBQlvTvWsTriyDUeTQ');

    const tagged = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cadVHBQlvTvWsTriyDUeTQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
        { flow_response_id: r1 },
    ));
    assertStrictEquals(tagged.status, 201);

    const save2 = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cadVHBQlvTvWsTriyDUeTQ', token,
        documentBody('Second Save', generateIdentifier()),
        { 'if-match': (
            await handleRequest(
                db,
                req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'cadVHBQlvTvWsTriyDUeTQ', token),
            )
        ).headers.get('ETag')! },
    ));
    assertStrictEquals(save2.status, 201);
    const r2 = await headResponseId(db, token, 'cadVHBQlvTvWsTriyDUeTQ');
    assertNotStrictEquals(r2, r1);

    const save3 = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cadVHBQlvTvWsTriyDUeTQ', token,
        documentBody('Third Save', generateIdentifier()),
        { 'if-match': (
            await handleRequest(
                db,
                req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + 'cadVHBQlvTvWsTriyDUeTQ', token),
            )
        ).headers.get('ETag')! },
    ));
    assertStrictEquals(save3.status, 201);
    const r3 = await headResponseId(db, token, 'cadVHBQlvTvWsTriyDUeTQ');
    assertNotStrictEquals(r3, r2);

    const get = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cadVHBQlvTvWsTriyDUeTQ/tags/xDyDkxEPwtcNmJVknUHDsg', token,
    ));
    assertStrictEquals(get.status, 200);
    const body = await get.json() as { flow_response_id: string };
    assertStrictEquals(
        body.flow_response_id, r1,
        'the tag must still name the ORIGINAL pinned response,'
        + ' never the flow\'s current head',
    );
});
