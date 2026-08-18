import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, PUT, POST, handleRequest } from
    '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';

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
        id: 'n-step',
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

function detail(name: string) {
    return {
        name,
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

test('PUT /ai-agents/:id writes the four fields; GET'
+ ' returns them', async () => {
    const db = await freshDb();
    const body = agentFields('Drafting agent');
    const put = await handleRequest(db, req(
        'PUT', '/ai-agents/agent-1', DEV_TOKEN, body,
    ));
    assert.ok(
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
    assert.equal(written.id, 'agent-1');
    assert.equal(written.name, body.name);
    assert.equal(written.description, body.description);
    assert.equal(written.skill_focus, body.skill_focus);
    assert.equal(written.model, body.model);
    const got = await GET<{
        id: string;
        name: string;
        description: string;
        skill_focus: string;
        model: string;
    }>(db, 'ai-agents/agent-1', DEV_TOKEN);
    assert.deepEqual(got, written);
});

test('a flow write with an AI member id in memberIds'
+ ' is 400', async () => {
    const db = await freshDb();
    await PUT(db, 'ai-agents/ai-bot-1', {
        name: 'Bot',
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    }, DEV_TOKEN);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-ai-member', token,
        flowDocument(
            'Blocked',
            'ev-flow-1',
            {
                nodes: [graphNode(['ai-bot-1'])],
                edges: [],
            },
        ),
    ));
    assert.equal(res.status, 400);
});

test('a flow write with agentIds naming a live'
+ ' AI agent is 201 or 200', async () => {
    const db = await freshDb();
    const agent = agentFields('Live agent');
    const minted = await handleRequest(db, req(
        'PUT', '/ai-agents/agent-live', DEV_TOKEN,
        agent,
    ));
    assert.ok(
        minted.status === 201 || minted.status === 200,
    );
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-agent', token,
        flowDocument(
            'With agent',
            'ev-flow-2',
            {
                nodes: [graphNode([], ['agent-live'])],
                edges: [],
            },
        ),
    ));
    assert.ok(
        res.status === 201 || res.status === 200,
        'expected 201 or 200, got ' + res.status,
    );
    const flow = await GET<{
        graph: {
            nodes: { agentIds?: string[] }[];
        };
    }>(db, 'organizations/1/flows/flow-agent', token);
    const node = flow.graph.nodes[0]!;
    assert.deepEqual(node.agentIds, ['agent-live']);
});
