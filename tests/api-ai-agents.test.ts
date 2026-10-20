import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET, GETCollection, PUT } from './in-page-facade.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
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


const AT = '2026-01-01T00:00:00.000000Z';

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
    const put = await handleRequest(db, req(
        'PUT', aiPath(STARK, id), DEV_TOKEN, body,
    ));
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();
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
    const put = await handleRequest(db, req(
        'PUT', aiPath(STARK, id), DEV_TOKEN,
        agentFields('Stark agent'),
    ));
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();
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

Deno.test('PUT /ai-agents/:id writes the four fields; GET'
+ ' returns them', async () => {
    const db = await freshDb();
    const body = agentFields('Drafting agent');
    const put = await handleRequest(db, req(
        'PUT', '/ai-agents/UuvoBhQJUSEsiJwscXPkUg', DEV_TOKEN, body,
    ));
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
    }>(db, 'ai-agents/UuvoBhQJUSEsiJwscXPkUg', DEV_TOKEN,
        operationIdHeader())).body().toValue();
    assertEquals(got, written);
});

Deno.test('a flow write with an AI member id in memberIds'
+ ' is 400', async () => {
    const db = await freshDb();
    const agentId = generateIdentifier();
    await PUT(db, 'ai-agents/' + agentId, {
        name: 'Bot',
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    }, DEV_TOKEN,
        operationIdHeader());
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
    const agent = agentFields('Live agent');
    const minted = await handleRequest(db, req(
        'PUT', '/ai-agents/UxpkDaNMmbWLvCTkyrFfGA', DEV_TOKEN,
        agent,
    ));
    assert(
        minted.status === 201 || minted.status === 200,
    );
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
