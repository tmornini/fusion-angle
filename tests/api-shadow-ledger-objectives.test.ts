import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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

function createBody(id: string, revisionId: string, name: string) {
    return {
        id,
        objective: { position: 1 },
        revisionId,
        revision: {
            objective_id: id,
            name,
            description: 'd',
            member_id: 'current',
            at: AT,
        },
    };
}

function revisionFields(objectiveId: string, name: string) {
    return {
        objective_id: objectiveId,
        name,
        description: 'd',
        member_id: 'current',
        at: AT,
    };
}

function baselineFields(
    projectId: string, objectiveId: string, score: number,
) {
    return {
        project_id: projectId,
        objective_id: objectiveId,
        score,
        member_id: 'current',
        at: AT,
    };
}

function actualFields(
    projectId: string, objectiveId: string, score: number,
) {
    return {
        project_id: projectId,
        objective_id: objectiveId,
        score,
        member_id: 'current',
        at: AT,
    };
}

test('an objective create appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/objectives', token,
        createBody('obj-1', 'rev-1', 'Revenue'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix,
        '/organizations/1/objectives/',
    );
    assert.equal(requests[0]!.uri_id, 'obj-1');
});

test('a failed objective create appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/objectives', token,
        createBody('obj-doomed', 'rev-doomed', ''),
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('a PUT to a fresh objective appends its pair at the'
+ ' entity address, and a second PUT supersedes it',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', '/objectives/obj-8', token, { position: 2 },
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix === '/organizations/1/objectives/'
            && r.uri_id === 'obj-8',
    );
    assert.ok(row);
    const domainRow = await db.objectives.getById('obj-8');
    assert.deepEqual(await first.json(), domainRow);
    const second = await handleRequest(db, req(
        'PUT', '/objectives/obj-8', token, { position: 3 },
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('a byte-identical PUT resend to an objective returns'
+ ' the stored response and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = { position: 5 };
    const first = await handleRequest(db, req(
        'PUT', '/objectives/obj-9', token, body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/objectives/obj-9', token, body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('a PUT to an objective verifies against its hash and'
+ ' keeps request/response counts balanced', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/objectives/obj-10', token, { position: 1 },
    ));
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    for (const row of requests) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of responses) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    assert.equal(requests.length, responses.length);
});

test('a PUT to a fresh objective revision appends its pair,'
+ ' and a second PUT supersedes it', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'POST', '/objectives', token,
        createBody('obj-2', 'rev-2', 'First'),
    ));
    const first = await handleRequest(db, req(
        'PUT', '/objectives/obj-2/revisions/rev-2b', token,
        revisionFields('obj-2', 'Second'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/organizations/1/objectives/obj-2/revisions/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, 'rev-2b');
    const domainRow =
        await db.objectiveRevisions.getById('rev-2b');
    assert.deepEqual(await first.json(), domainRow);
    const second = await handleRequest(db, req(
        'PUT', '/objectives/obj-2/revisions/rev-2b', token,
        revisionFields('obj-2', 'Third'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('PUT a baseline score appends its pair at the score'
+ ' address and the wire body matches a domain read',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/projects/p-1/objective-baseline-scores/bs-1',
        token, baselineFields('p-1', 'obj-3', 10),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix === '/organizations/1/projects/'
            + 'p-1/objective-baseline-scores/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, 'bs-1');
    const domainRow =
        await db.projectObjectiveBaselineScores.getById('bs-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('PUT an actual score appends its pair at the score'
+ ' address and the wire body matches a domain read',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/projects/p-2/objective-actual-scores/as-1',
        token, actualFields('p-2', 'obj-4', -5),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix === '/organizations/1/projects/'
            + 'p-2/objective-actual-scores/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, 'as-1');
    const domainRow =
        await db.projectObjectiveActualScores.getById('as-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('a byte-identical PUT resend to a revision returns the'
+ ' stored response and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = revisionFields('obj-5', 'Idempotent');
    const first = await handleRequest(db, req(
        'PUT', '/objectives/obj-5/revisions/rev-5', token, body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/objectives/obj-5/revisions/rev-5', token, body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'POST', '/objectives', token,
        createBody('obj-6', 'rev-6', 'Verify'),
    ));
    await handleRequest(db, req(
        'PUT', '/objectives/obj-6/revisions/rev-6b', token,
        revisionFields('obj-6', 'Verify2'),
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
        'POST', '/objectives', token,
        createBody('obj-7', 'rev-7', 'Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/objectives/obj-7/revisions/rev-7b', token,
        revisionFields('obj-7', 'Mixed2'),
    ));
    await handleRequest(db, req(
        'PUT', '/projects/p-3/objective-baseline-scores/bs-2',
        token, baselineFields('p-3', 'obj-7', 3),
    ));
    const failed = await handleRequest(db, req(
        'POST', '/objectives', token,
        createBody('obj-fail', 'rev-fail', ''),
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
