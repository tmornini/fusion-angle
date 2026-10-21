import { assert, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET } from './in-page-facade.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    firstProviderModel,
    seedAIMember,
} from './member-fixtures.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


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

function agentFields(name: string) {
    return {
        name,
        description: 'A standing agent',
        skill_focus: 'drafting',
        model: firstProviderModel().id,
    };
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test('PUT /ai-agents/:id writes the agent', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await seedAIMember(db, 'UQTJZvCoKlFjEoDlDUwekw', 'Seated');
    const head = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/ai-agents/UQTJZvCoKlFjEoDlDUwekw', token,
    ));
    await head.body?.cancel();
    const etag = head.headers.get('ETag');
    assert(etag !== null);
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/ai-agents/UQTJZvCoKlFjEoDlDUwekw',
        token,
        body: agentFields('Claude'),
        headers: { 'If-Match': etag },
    }));
    assertStrictEquals(put.status, 200);
    const got = (await GET<{ name: string }>(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/ai-agents/UQTJZvCoKlFjEoDlDUwekw', token,
        operationIdHeader())).body().toValue();
    assertStrictEquals(got.name, 'Claude');
});

Deno.test('POST /ai-members is retired 404', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN, {
            id: 'UQTJZvCoKlFjEoDlDUwekw',
            detail: agentFields('Claude'),
        },
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('a flow write with an AI agent id in memberIds'
+ ' is 400', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/memberships/',
        token,
        {
            id: 'UuvoBhQJUSEsiJwscXPkUg',
            kind: 'ai',
            membership: {
                type: 'member',
                at: '2026-01-01T00:00:00.000000Z',
            },
            ai: agentFields('Bot'),
        },
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const { DEFAULT_LOCK_TIMEOUT } = await import(
        '../shared/types.ts'
    );
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aJVLTHvDCMwaHWIrPvPlkA',
        token,
        headers: { 'if-none-match': '*' },
        body: {
            name: 'Blocked',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-flow-1',
            graph: {
                nodes: [{
                    id: 'n-step',
                    name: 'Step',
                    positionX: 0,
                    positionY: 0,
                    isCreate: false,
                    isArchive: false,
                    memberIds: ['UuvoBhQJUSEsiJwscXPkUg'],
                    attributes: [],
                    taskInstructions: '',
                }],
                edges: [],
            },
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
            revivals: [],
        },
    }));
    assertStrictEquals(res.status, 400);
});
