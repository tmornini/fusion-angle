import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';
import {
    deriveOrganization,
    deriveOrganizations,
} from '../api/derive-organizations.ts';

// Phase 12 Task 2: the tenant root's own derive module, built
// AHEAD of both its family-registry.ts registration (this
// commit's sibling) and its seed pairs (Task 3) —
// api-shadow-ledger-organizations.test.ts's own freshDb/
// DEV_TOKEN/organizationRow fixtures, reused rather than
// re-invented, since the mock-data seed still writes
// organizations ROWS with ZERO pairs (adapter.organizations.put
// directly, never through the message plane) — every pair this
// file compares against is built through the SAME live PUT
// route the shadow-ledger suite already exercises.

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function putOrganization(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/' + id, DEV_TOKEN,
        organizationRow(name),
    ));
}

// -- mapping parity vs rows ------------------------------------

test('deriveOrganization mirrors the stored row exactly',
async () => {
    const db = await freshDb();
    const res = await putOrganization(db, 'org-a', 'Acme');
    assert.equal(res.status, 200);
    const row = await db.organizations.getById('org-a');
    const derived = await deriveOrganization(db, 'org-a');
    assert.deepEqual(derived, row);
});

test('deriveOrganizations mirrors every stored row, id-lex'
+ ' ordered', async () => {
    const db = await freshDb();
    await putOrganization(db, 'org-b', 'Beta');
    await putOrganization(db, 'org-a', 'Alpha');
    const rows = sortById(await db.organizations.getAll());
    const derived = await deriveOrganizations(db);
    assert.deepEqual(derived, rows);
});

test('deriveOrganization 404s exactly like db.organizations'
+ '.getById on an absent id', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => deriveOrganization(db, 'org-missing'),
        (error: unknown) => {
            assert.equal(
                (error as { message: string }).message,
                'Not found: organizations/org-missing',
            );
            return true;
        },
    );
});

// -- the live-PUT chain -----------------------------------------

test('a second live PUT supersedes the first; derive sees the'
+ ' NEW head, not the genesis body', async () => {
    const db = await freshDb();
    const first = await putOrganization(db, 'org-c', 'First');
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const second = await putOrganization(db, 'org-c', 'Second');
    assert.equal(second.headers.get('Supersedes'), firstId);

    const derived = await deriveOrganization(db, 'org-c');
    assert.equal(derived.name, 'Second');
    const row = await db.organizations.getById('org-c');
    assert.deepEqual(derived, row);

    const all = await deriveOrganizations(db);
    assert.equal(
        all.filter((org) => org.id === 'org-c').length, 1,
    );
});

// -- the un-nested address proof ---------------------------------

test('the pair lives at the flat /organizations/ prefix, no'
+ ' organization segment — derive takes no org argument',
async () => {
    const db = await freshDb();
    await putOrganization(db, 'org-d', 'Flat');
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/organizations/');
    assert.equal(requests[0]!.uri_id, 'org-d');

    const derived = await deriveOrganization(db, 'org-d');
    assert.equal(derived.id, 'org-d');
});

// -- the id-echo roundtrip ----------------------------------------

// The idiomatic fetch-edit-PUT client pattern: a GET response
// carries `id` in its body, and a client that spreads that body
// back into its own PUT payload echoes it right back on the
// wire. The write path tolerates this (routes.ts's PUT handler
// strips it via withoutId before validating, mirroring
// EntityStore.put) — derivation must tolerate it too, since the
// STORED request body is the raw wire body, echoed id and all.
test('a PUT whose body echoes id round-trips through'
+ ' derivation, mirroring the write path\'s own'
+ ' withoutId(body) strip', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/org-echo', DEV_TOKEN,
        { id: 'org-echo', ...organizationRow('Echo') },
    ));
    assert.equal(res.status, 200);
    const row = await db.organizations.getById('org-echo');

    const derived = await deriveOrganization(db, 'org-echo');
    assert.deepEqual(derived, row);

    const all = await deriveOrganizations(db);
    assert.deepEqual(
        all.find((org) => org.id === 'org-echo'), row,
    );
});
