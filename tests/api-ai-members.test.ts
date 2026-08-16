import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, PUT, handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

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

test('PUT /ai-agents/:id writes the agent', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/ai-agents/a1', token,
        agentFields('Claude'),
    ));
    assert.ok(put.status === 201 || put.status === 200);
    const got = await GET<{ name: string }>(
        db, 'ai-agents/a1', token,
    );
    assert.equal(got.name, 'Claude');
});

test('POST /ai-members is retired 404', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN, {
            id: 'a1',
            detail: agentFields('Claude'),
        },
    ));
    assert.equal(res.status, 404);
});

test('a flow write with an AI agent id in memberIds'
+ ' is 400', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await PUT(db, 'ai-agents/agent-1',
        agentFields('Bot'), token);
    const { DEFAULT_LOCK_TIMEOUT } = await import(
        '../api/types.ts'
    );
    const res = await handleRequest(db, req(
        'PUT', '/flows/flow-ai-agent', token, {
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
                    memberIds: ['agent-1'],
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
    ));
    assert.equal(res.status, 400);
});
