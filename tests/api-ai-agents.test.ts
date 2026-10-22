import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET, GETCollection } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    claimToken,
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest,
    partBodiesOf,
} from './http-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';


const AT = '2026-01-01T00:00:00.000000Z';
const REMOVED_AT = '2026-01-01T00:00:01.000000Z';

function agentFields(name: string) {
    return {
        name,
        description: 'A standing agent',
        skill_focus: 'drafting',
        model: firstProviderModel().id,
    };
}

function req(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
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

function graphNode(
    memberIds: string[],
    agentIds?: string[],
) {
    return {
        id: generateIdentifier(),
        name: 'Step',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds,
        ...(agentIds === undefined
            ? {}
            : { agentIds }),
        attributes: [],
        taskInstructions: '',
    };
}

function flowDocument(
    name: string,
    stateEventId: string,
    graph: { nodes: unknown[]; edges: unknown[] },
) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: AT,
        state_event_id: stateEventId,
        graph,
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';

function aiPath(organization: string, id = ''): string {
    return '/organizations/' + organization
        + '/ai-agents/' + id;
}

Deno.test('an AI document lives under its organization',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const body = agentFields('Scoped agent');
    await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: body,
    });
    const got = await handleRequest(db, req(
        'GET', aiPath(STARK, id), DEV_TOKEN,
    ));
    assertStrictEquals(got.status, 200);
    assertEquals(await got.json(), { id, ...body });
    const listed = await handleRequest(db, req(
        'GET', aiPath(STARK), DEV_TOKEN,
    ));
    assertStrictEquals(listed.status, 200);
    assertEquals(
        (await partBodiesOf<{ id: string }>(listed))
            .map((row) => row.id),
        [id],
    );
});

// Foreign path 403 at the organization fence; a Stark id
// under Wayne's own path does not exist there (404).
Deno.test('another organization reads no AI of ours',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Stark agent'),
    });
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const foreignPath = await handleRequest(db, req(
        'GET', aiPath(STARK, id), wayne,
    ));
    assertStrictEquals(foreignPath.status, 403);
    await foreignPath.body?.cancel();
    const foreignId = await handleRequest(db, req(
        'GET', aiPath(WAYNE, id), wayne,
    ));
    assertStrictEquals(foreignId.status, 404);
    await foreignId.body?.cancel();
    assertEquals(
        await GETCollection(
            db, aiPath(WAYNE).slice(1), wayne,
            operationIdHeader(),
        ),
        [],
    );
});

// A Stark AI made by the statement is a seated identity
// too: its id still does not exist under Wayne's own path
// (404), and Stark's path is the fence (403).
Deno.test('a foreign AI member id is absent under our path',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST',
        '/organizations/' + STARK + '/memberships/',
        DEV_TOKEN,
        {
            id,
            kind: 'ai',
            membership: { type: 'member', at: AT },
            ai: agentFields('Stark member'),
        },
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const foreignId = await handleRequest(db, req(
        'GET', aiPath(WAYNE, id), wayne,
    ));
    assertStrictEquals(foreignId.status, 404);
    await foreignId.body?.cancel();
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: aiPath(WAYNE, id),
        token: wayne,
        body: agentFields('Wayne member'),
        headers: { 'If-Match': '"' + generateIdentifier() + '"' },
    }));
    assertStrictEquals(put.status, 404);
    await put.body?.cancel();
    const foreignPath = await handleRequest(db, req(
        'GET', aiPath(STARK, id), wayne,
    ));
    assertStrictEquals(foreignPath.status, 403);
    await foreignPath.body?.cancel();
});

Deno.test('the global ai-agents routes are gone',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const [method, path, body] of [
        ['GET', '/ai-agents/', undefined],
        ['GET', '/ai-agents/' + id, undefined],
        ['PUT', '/ai-agents/' + id, agentFields('Global')],
    ] as const) {
        const res = await handleRequest(db, req(
            method, path, DEV_TOKEN, body,
        ));
        assertStrictEquals(res.status, 404, method + path);
        await res.body?.cancel();
    }
});

// Only the members statement creates an AI, so the PUT is
// class B: it rewrites a live head or nothing (RFC 6585 §3;
// RFC 9110 §13.2.1).
Deno.test('an AI PUT with no precondition is 428',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', aiPath(STARK, generateIdentifier()), DEV_TOKEN,
        agentFields('Unconditional'),
    ));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
});

Deno.test('an AI PUT never creates', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const headers of [
        { 'If-None-Match': '*' },
        { 'If-Match': '"' + generateIdentifier() + '"' },
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: aiPath(STARK, id),
            token: DEV_TOKEN,
            body: agentFields('Absent agent'),
            headers,
        }));
        assertStrictEquals(res.status, 404);
        assertEquals(await res.json(), {
            error: 'Not found: ai-agents/' + id,
        });
    }
    assertStrictEquals(
        await db.messagePairs.getHeadPair(aiPath(STARK), id),
        null,
    );
});

Deno.test('an AI PUT rewrites the four fields; GET'
+ ' returns them', async () => {
    const db = await freshDb();
    await postMember(db, {
        id: 'UuvoBhQJUSEsiJwscXPkUg',
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Seated agent'),
    });
    const head = await handleRequest(db, req(
        'GET', aiPath(STARK, 'UuvoBhQJUSEsiJwscXPkUg'), DEV_TOKEN,
    ));
    assertStrictEquals(head.status, 200);
    await head.body?.cancel();
    const etag = head.headers.get('ETag');
    assert(etag !== null);
    const body = {
        ...agentFields('Drafting agent'),
        description: 'A rewritten agent',
        skill_focus: 'routing',
    };
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: aiPath(STARK, 'UuvoBhQJUSEsiJwscXPkUg'),
        token: DEV_TOKEN,
        body,
        headers: { 'If-Match': etag },
    }));
    assert(
        put.status === 201 || put.status === 200,
        'expected 201 or 200, got ' + put.status,
    );
    const written = await put.json() as {
        id: string;
        name: string;
        description: string;
        skill_focus: string;
        model: string;
    };
    assertStrictEquals(written.id, 'UuvoBhQJUSEsiJwscXPkUg');
    assertStrictEquals(written.name, body.name);
    assertStrictEquals(written.description, body.description);
    assertStrictEquals(written.skill_focus, body.skill_focus);
    assertStrictEquals(written.model, body.model);
    const got = (await GET<{
        id: string;
        name: string;
        description: string;
        skill_focus: string;
        model: string;
    }>(db, aiPath(STARK, 'UuvoBhQJUSEsiJwscXPkUg').slice(1), DEV_TOKEN,
        operationIdHeader())).body().toValue();
    assertEquals(got, written);
});

Deno.test('a flow write with an AI member id in memberIds'
+ ' is 400', async () => {
    const db = await freshDb();
    const agentId = generateIdentifier();
    await postMember(db, {
        id: agentId,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: {
            name: 'Bot',
            description: '',
            skill_focus: '',
            model: firstProviderModel().id,
        },
    });
    const token = await organizationToken();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aMyiZpZbsEboXnIrwnEjNA',
        token,
        body: flowDocument(
            'Blocked',
            generateIdentifier(),
            {
                nodes: [graphNode([agentId])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
});

Deno.test('a flow write with agentIds naming a live'
+ ' AI agent is 201 or 200', async () => {
    const db = await freshDb();
    await postMember(db, {
        id: 'UxpkDaNMmbWLvCTkyrFfGA',
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Live agent'),
    });
    const token = await organizationToken();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aJJKPwIzmbFseMhGUrFyFQ',
        token,
        body: flowDocument(
            'With agent',
            generateIdentifier(),
            {
                nodes: [graphNode([], ['UxpkDaNMmbWLvCTkyrFfGA'])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assert(
        res.status === 201 || res.status === 200,
        'expected 201 or 200, got ' + res.status,
    );
    const flow = (await GET<{
        graph: {
            nodes: { agentIds?: string[] }[];
        };
    }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + 'aJJKPwIzmbFseMhGUrFyFQ', token, operationIdHeader()))
        .body().toValue();
    const node = flow.graph.nodes[0]!;
    assertEquals(node.agentIds, ['UxpkDaNMmbWLvCTkyrFfGA']);
});

// The statement's answer names the membership head its
// removal latches.
async function postMember(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<string> {
    const response = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + STARK + '/memberships/',
        token: await organizationToken(),
        body,
    }));
    assertStrictEquals(response.status, 201);
    await response.body?.cancel();
    const etag = response.headers.get('ETag');
    assert(etag !== null);
    return etag;
}

// An AI is live while its membership is accepted. Removal
// is one membership write: the document stays, the AI
// leaves agentIds, and its id stays refused in memberIds.
Deno.test('a flow write naming a removed AI member in'
+ ' agentIds is 400', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const etag = await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Removed agent'),
    });
    const removed = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/invitations/'
            + membershipNameOf(STARK, id),
        token: await organizationToken(),
        body: { state: 'removed', at: REMOVED_AT },
        headers: { 'If-Match': etag },
    }));
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/'
            + generateIdentifier(),
        token: await organizationToken(),
        body: flowDocument(
            'Removed agent',
            generateIdentifier(),
            {
                nodes: [graphNode([], [id])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
    const got = await handleRequest(db, req(
        'GET', aiPath(STARK, id), DEV_TOKEN,
    ));
    assertStrictEquals(got.status, 200);
    await got.body?.cancel();
});

Deno.test('a flow write naming a removed AI member in'
+ ' memberIds is 400', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const etag = await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Removed agent'),
    });
    const removed = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/invitations/'
            + membershipNameOf(STARK, id),
        token: await organizationToken(),
        body: { state: 'removed', at: REMOVED_AT },
        headers: { 'If-Match': etag },
    }));
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/'
            + generateIdentifier(),
        token: await organizationToken(),
        body: flowDocument(
            'Removed member',
            generateIdentifier(),
            {
                nodes: [graphNode([id])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'memberIds may name person identities only,'
            + ' not AI agents or services',
    });
});
