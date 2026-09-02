import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { GET, PUT, handleRequest } from
    '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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
        operationId: TEST_OPERATION_ID,
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
    const got = await GET<{
        id: string;
        name: string;
        description: string;
        skill_focus: string;
        model: string;
    }>(db, 'ai-agents/UuvoBhQJUSEsiJwscXPkUg', DEV_TOKEN);
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
    }, DEV_TOKEN);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aMyiZpZbsEboXnIrwnEjNA', token,
        flowDocument(
            'Blocked',
            generateIdentifier(),
            {
                nodes: [graphNode([agentId])],
                edges: [],
            },
        ),
    ));
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
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aJJKPwIzmbFseMhGUrFyFQ', token,
        flowDocument(
            'With agent',
            generateIdentifier(),
            {
                nodes: [graphNode([], ['UxpkDaNMmbWLvCTkyrFfGA'])],
                edges: [],
            },
        ),
    ));
    assert(
        res.status === 201 || res.status === 200,
        'expected 201 or 200, got ' + res.status,
    );
    const flow = await GET<{
        graph: {
            nodes: { agentIds?: string[] }[];
        };
    }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + 'aJJKPwIzmbFseMhGUrFyFQ', token);
    const node = flow.graph.nodes[0]!;
    assertEquals(node.agentIds, ['UxpkDaNMmbWLvCTkyrFfGA']);
});
