import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';
import {
    deriveOrganization,
    deriveOrganizations,
} from '../api/derive-organizations.ts';

// Phase Final Task 2: organizations dual-write stripped. This
// file no longer compares derive vs row-plane oracles — the
// row plane is empty after a live PUT. Coverage re-homes to
// wire-body / derive agreement and pair-plane address proofs.
// Every pair is still built through the live PUT route.

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
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
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

// -- mapping parity vs wire ------------------------------------

test('deriveOrganization mirrors the PUT wire body exactly',
async () => {
    const db = await freshDb();
    const res = await putOrganization(db, 'org-a', 'Acme');
    assert.equal(res.status, 200);
    const wire = await res.json();
    const derived = await deriveOrganization(db, 'org-a');
    assert.deepEqual(derived, wire);
    // Phase Final Stage B: organizations table retired.
});

test('deriveOrganizations mirrors every PUT wire body,'
+ ' id-lex ordered', async () => {
    const db = await freshDb();
    // seedAdminSchema plants org '1'; these two PUTs add
    // more heads — derive is id-lex over the full set.
    const beta = await putOrganization(db, 'org-b', 'Beta');
    const alpha = await putOrganization(db, 'org-a', 'Alpha');
    assert.equal(beta.status, 200);
    assert.equal(alpha.status, 200);
    const derived = await deriveOrganizations(db);
    assert.deepEqual(
        derived.map((o) => o.id),
        ['1', 'org-a', 'org-b'],
    );
    assert.equal(
        derived.find((o) => o.id === 'org-a')!.name, 'Alpha',
    );
    assert.equal(
        derived.find((o) => o.id === 'org-b')!.name, 'Beta',
    );
    // Phase Final Stage B: organizations table retired.
});

test('deriveOrganization 404s with store-shaped'
+ ' EntityNotFoundError on an absent id', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => deriveOrganization(db, 'org-missing'),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
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
    const wire = await second.json();
    assert.deepEqual(derived, wire);

    const all = await deriveOrganizations(db);
    assert.equal(
        all.filter((org) => org.id === 'org-c').length, 1,
    );
    // Phase Final Stage B: organizations table retired.
});

// -- the un-nested address proof ---------------------------------

test('the pair lives at the flat /organizations/ prefix, no'
+ ' organization segment — derive takes no org argument',
async () => {
    const db = await freshDb();
    await putOrganization(db, 'org-d', 'Flat');
    const requests = await db.requests.getAll();
    // seedAdminSchema forms 3 pairs; this PUT is the 4th.
    assert.equal(requests.length, 4);
    assert.equal(requests[3]!.uri_prefix, '/organizations/');
    assert.equal(requests[3]!.uri_id, 'org-d');

    const derived = await deriveOrganization(db, 'org-d');
    assert.equal(derived.id, 'org-d');
});

// -- the id-echo roundtrip ----------------------------------------

test('a PUT whose body echoes id round-trips through'
+ ' derivation, mirroring the write path\'s own'
+ ' withoutId(body) strip', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/org-echo', DEV_TOKEN,
        { id: 'org-echo', ...organizationRow('Echo') },
    ));
    assert.equal(res.status, 200);
    const wire = await res.json();

    const derived = await deriveOrganization(db, 'org-echo');
    assert.deepEqual(derived, wire);

    const all = await deriveOrganizations(db);
    assert.deepEqual(
        all.find((org) => org.id === 'org-echo'), wire,
    );
    // Phase Final Stage B: organizations table retired.
});
