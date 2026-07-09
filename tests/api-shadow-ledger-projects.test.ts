import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

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

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function projectFields(title: string) {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
    };
}

// PUT /projects/:id now takes the FULL document (Decision 7):
// the entity fields plus the state trio. One fixed trio per
// project id keeps every PUT below a same-state edit — none
// of these exercise a genuine transition.
function projectPutBody(projectId: string, title: string) {
    return {
        ...projectFields(title),
        state: 'submitted',
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: 'ev-' + projectId,
    };
}

function projectFlowFields(
    projectId: string,
    flowId: string,
    at: string,
) {
    return {
        project_id: projectId,
        flow_id: flowId,
        at,
    };
}

test('a PUT to a fresh project appends its pair at the'
+ ' entity address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/projects/proj-1', token,
        projectPutBody('proj-1', 'Fresh Project'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(
        requests[3]!.uri_prefix,
        '/organizations/1/projects/',
    );
    assert.equal(requests[3]!.uri_id, 'proj-1');
    const responses = await db.responses.getAll();
    assert.equal(responses[3]!.id, requests[3]!.id);
});

test('a second PUT to the same project records supersedes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', '/projects/proj-2', token,
        projectPutBody('proj-2', 'First'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, req(
        'PUT', '/projects/proj-2', token,
        projectPutBody('proj-2', 'Second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('PUT project-flows appends its pair at the join'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const at = '2026-01-01T00:00:00.000000Z';
    const res = await handleRequest(db, req(
        'PUT', '/projects/proj-3/flows/pf-1', token,
        projectFlowFields('proj-3', 'flow-1', at),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(
        requests[3]!.uri_prefix,
        '/organizations/1/projects/proj-3/flows/',
    );
    assert.equal(requests[3]!.uri_id, 'pf-1');
});

test('DELETE project-flows appends its tombstone pair,'
+ ' superseding the PUT', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const at = '2026-01-01T00:00:00.000000Z';
    const put = await handleRequest(db, req(
        'PUT', '/projects/proj-4/flows/pf-2', token,
        projectFlowFields('proj-4', 'flow-1', at),
    ));
    const putId = put.headers.get('Response-ID');
    assert.ok(putId);
    const del = await handleRequest(db, req(
        'DELETE', '/projects/proj-4/flows/pf-2', token,
    ));
    assert.equal(del.status, 204);
    const delId = del.headers.get('Response-ID');
    assert.ok(delId);
    assert.equal(del.headers.get('Supersedes'), putId);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 5);
    assert.equal(responses.length, 5);
    await assert.rejects(
        () => db.projectFlows.getById('pf-2'),
    );
});

test('each 200 route\'s wire body matches a direct domain '
+ 'read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const project = await handleRequest(db, req(
        'PUT', '/projects/proj-5', token,
        projectPutBody('proj-5', 'Wired'),
    ));
    assert.equal(project.status, 200);
    const projectRow = await db.projects.getById('proj-5');
    assert.deepEqual(await project.json(), projectRow);

    const at = '2026-01-01T00:00:00.000000Z';
    const link = await handleRequest(db, req(
        'PUT', '/projects/proj-5/flows/pf-3', token,
        projectFlowFields('proj-5', 'flow-1', at),
    ));
    assert.equal(link.status, 200);
    const linkRow = await db.projectFlows.getById('pf-3');
    assert.deepEqual(await link.json(), linkRow);
});

test('a failed PUT appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/projects/proj-6', token,
        {
            ...projectPutBody('proj-6', 'Doomed'),
            start_date: 'nope',
        },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('a byte-identical resend returns the stored response '
+ 'and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = projectPutBody('proj-7', 'Idempotent');
    const first = await handleRequest(db, req(
        'PUT', '/projects/proj-7', token, body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/projects/proj-7', token, body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/projects/proj-8', token,
        projectPutBody('proj-8', 'Verify'),
    ));
    const at = '2026-01-01T00:00:00.000000Z';
    await handleRequest(db, req(
        'PUT', '/projects/proj-8/flows/pf-4', token,
        projectFlowFields('proj-8', 'flow-1', at),
    ));
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('request and response counts stay equal across a mix'
+ ' including one failure', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/projects/proj-9', token,
        projectPutBody('proj-9', 'Mixed'),
    ));
    const at = '2026-01-01T00:00:00.000000Z';
    await handleRequest(db, req(
        'PUT', '/projects/proj-9/flows/pf-5', token,
        projectFlowFields('proj-9', 'flow-1', at),
    ));
    await handleRequest(db, req(
        'DELETE', '/projects/proj-9/flows/pf-5', token,
    ));
    const failed = await handleRequest(db, req(
        'PUT', '/projects/proj-9', token,
        {
            ...projectPutBody('proj-9', 'Bad'),
            progress: 'not-a-number',
        },
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
