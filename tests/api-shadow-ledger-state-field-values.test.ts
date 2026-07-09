import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
    ideaBody,
} from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const EVENT_ID = 'se-1';

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

// A state event owned by an org-'1' idea — state_field_values
// nest under their parent state event, which resolves its
// owning org through the multi-hop parent-scoped resolver
// (api/store-parent-scoped.ts). Writes delegate (not parent-
// fenced), so this fixture only needs to exist for the org
// fence's READ side and for a coherent shadow-ledger address.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.ideas.put('idea-1', ideaBody('1', 'Seed idea'));
    await db.states.put(EVENT_ID, {
        entity_id: 'idea-1', state: 'active',
        member_id: 'system', at: AT,
    });
    return db;
}

function fieldValueFields(value: string) {
    return {
        state_event_id: EVENT_ID,
        attribute_id: 'attr-x',
        value,
    };
}

test('PUT states/:id/field-values/:fvid appends its pair at'
+ ' the ORG-NESTED entity address, and the wire body matches'
+ ' a domain read', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-1`, token,
        fieldValueFields('one'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(
        requests[3]!.uri_prefix,
        `/organizations/1/states/${EVENT_ID}/field-values/`,
    );
    assert.equal(requests[3]!.uri_id, 'fv-1');
    const domainRow = await db.stateFieldValues.getById('fv-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('a second PUT to the same field-value records'
+ ' Supersedes', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-2`, token,
        fieldValueFields('first'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-2`, token,
        fieldValueFields('second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('a byte-identical PUT resend returns the stored response'
+ ' and appends nothing', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const body = fieldValueFields('idempotent');
    const first = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-3`, token,
        body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-3`, token,
        body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

test('DELETE states/:id/field-values/:fvid appends its'
+ ' tombstone pair, superseding the PUT', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-4`, token,
        fieldValueFields('doomed'),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', `/states/${EVENT_ID}/field-values/fv-4`, token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(
        () => db.stateFieldValues.getById('fv-4'));
});

test('a failed write (missing required field) appends'
+ ' nothing', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-doomed`,
        token, { state_event_id: EVENT_ID },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('stored messages verify against their hashes',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-9`, token,
        fieldValueFields('verify'),
    ));
    await handleRequest(db, req(
        'DELETE', `/states/${EVENT_ID}/field-values/fv-9`,
        token,
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

test('request and response counts stay balanced across a mix'
+ ' of PUT/DELETE and one failed write', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-10`, token,
        fieldValueFields('mixed'),
    ));
    await handleRequest(db, req(
        'DELETE', `/states/${EVENT_ID}/field-values/fv-10`,
        token,
    ));
    const failed = await handleRequest(db, req(
        'PUT', `/states/${EVENT_ID}/field-values/fv-fail`,
        token, { state_event_id: EVENT_ID },
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
