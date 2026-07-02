import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { jsonArrayField } from '../api/types.ts';

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

function createRecordBody(id: string, eventId: string) {
    return {
        kind: 'create',
        id,
        record: {
            organization_id: '1',
            name: 'Fresh Record',
            description: 'd',
            position: 1,
        },
        attributes: [],
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
    };
}

function editRecordBody(id: string) {
    return {
        kind: 'edit',
        id,
        record: {
            organization_id: '1',
            name: 'Edited Record',
            description: 'd2',
            position: 1,
        },
        attributes: [],
        removedAttributeIds: [],
    };
}

function recordFields(name: string) {
    return {
        organization_id: '1',
        name,
        description: 'd',
        position: 1,
    };
}

function recordAttributeFields(recordId: string, name: string) {
    return {
        organization_id: '1',
        record_id: recordId,
        name,
        attribute_type: 'text',
        sort_order: 0,
        options: jsonArrayField([]),
        constraints: jsonArrayField([]),
    };
}

test('a record create appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-1', 'ev-1'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix,
        '/organizations/1/records/',
    );
    assert.equal(requests[0]!.uri_id, 'rec-1');
});

test('a failed record create appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await db.states.put('ev-x', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-doomed', 'ev-x'),
    ));
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('an edit POST shares the SAME address as create and'
+ ' supersedes it', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-2', 'ev-2'),
    ));
    const createdId = created.headers.get('Response-ID');
    assert.ok(createdId);
    const edited = await handleRequest(db, req(
        'POST', '/records', token, editRecordBody('rec-2'),
    ));
    assert.equal(edited.status, 204);
    assert.equal(edited.headers.get('Supersedes'), createdId);
});

test('a PUT to a fresh record appends its pair, and a'
+ ' second PUT supersedes it', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', '/records/rec-3', token,
        recordFields('First'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const second = await handleRequest(db, req(
        'PUT', '/records/rec-3', token,
        recordFields('Second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('DELETE records/:id appends its tombstone pair,'
+ ' superseding the PUT', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/records/rec-4', token,
        recordFields('Doomed'),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/records/rec-4', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(() => db.records.getById('rec-4'));
});

test('each 200 route\'s wire body matches a direct domain '
+ 'read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const record = await handleRequest(db, req(
        'PUT', '/records/rec-5', token,
        recordFields('Wired'),
    ));
    assert.equal(record.status, 200);
    const recordRow = await db.records.getById('rec-5');
    assert.deepEqual(await record.json(), recordRow);

    const attr = await handleRequest(db, req(
        'PUT', '/record-attributes/attr-1', token,
        recordAttributeFields('rec-5', 'Priority'),
    ));
    assert.equal(attr.status, 200);
    const attrRow =
        await db.recordAttributes.getById('attr-1');
    assert.deepEqual(await attr.json(), attrRow);

    const link = await handleRequest(db, req(
        'PUT', '/flows/flow-1/records/frid-1', token,
        { flow_id: 'flow-1', record_id: 'rec-5', at: AT },
    ));
    assert.equal(link.status, 200);
    const linkRow = await db.flowRecords.getById('frid-1');
    assert.deepEqual(await link.json(), linkRow);
});

test('DELETE record-attributes/:id appends its tombstone'
+ ' pair when unreferenced', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/record-attributes/attr-2', token,
        recordAttributeFields('rec-6', 'Loose'),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/record-attributes/attr-2', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
});

test('a RESTRICTed DELETE record-attributes/:id 409s and'
+ ' appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/record-attributes/attr-3', token,
        recordAttributeFields('rec-7', 'Bound'),
    ));
    await db.stateFieldValues.put('sfv-1', {
        state_event_id: 'ev-x',
        attribute_id: 'attr-3',
        value: 'v',
    });
    const countBefore = (await db.requests.getAll()).length;
    const del = await handleRequest(db, req(
        'DELETE', '/record-attributes/attr-3', token,
    ));
    assert.equal(del.status, 409);
    assert.equal(
        (await db.requests.getAll()).length, countBefore,
    );
});

test('DELETE flows/:id/records/:frid appends its tombstone'
+ ' pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/flows/flow-2/records/frid-2', token,
        { flow_id: 'flow-2', record_id: 'rec-8', at: AT },
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/flows/flow-2/records/frid-2', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(
        () => db.flowRecords.getById('frid-2'),
    );
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-9', 'ev-9'),
    ));
    await handleRequest(db, req(
        'PUT', '/record-attributes/attr-9', token,
        recordAttributeFields('rec-9', 'Verify'),
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
        'POST', '/records', token,
        createRecordBody('rec-10', 'ev-10'),
    ));
    await handleRequest(db, req(
        'PUT', '/record-attributes/attr-10', token,
        recordAttributeFields('rec-10', 'Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/flows/flow-3/records/frid-3', token,
        { flow_id: 'flow-3', record_id: 'rec-10', at: AT },
    ));
    await handleRequest(db, req(
        'DELETE', '/flows/flow-3/records/frid-3', token,
    ));
    await db.states.put('ev-conflict', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-fail', 'ev-conflict'),
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
