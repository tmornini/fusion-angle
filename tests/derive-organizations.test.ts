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
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';
import {
    deriveOrganization,
    deriveOrganizations,
    organizationEntityOf,
} from '../api/derive-organizations.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';

// Phase Final Task 2: organizations dual-write stripped. This
// file no longer compares derive vs row-plane oracles — the
// row plane is empty after a live PUT. Coverage re-homes to
// wire-body / derive agreement and message-plane address proofs.
// Every pair is still built through the live PUT route.

function req(
    method: string,
    path: string,
    token: string,
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
    const organizationId = generateIdentifier();
    const res = await putOrganization(db, organizationId, 'Acme');
    assert.equal(res.status, 201);
    const wire = await res.json();
    const derived = await deriveOrganization(db, organizationId);
    assert.deepEqual(derived, wire);
    // Phase Final Stage B: organizations table retired.
});

test('deriveOrganizations mirrors every PUT wire body,'
+ ' id-lex ordered', async () => {
    const db = await freshDb();
    // seedAdminSchema plants org 'AjdvjuECVZEgZoFajaIEkg'; these two PUTs add
    // more heads — derive is id-lex over the full set.
    const organizationB = generateIdentifier();
    const organizationA = generateIdentifier();
    const beta = await putOrganization(db, organizationB, 'Beta');
    const alpha = await putOrganization(db, organizationA, 'Alpha');
    assert.equal(beta.status, 201);
    assert.equal(alpha.status, 201);
    const derived = await deriveOrganizations(db);
    assert.deepEqual(
        derived.map((o) => o.id),
        [
            'AjdvjuECVZEgZoFajaIEkg',
            organizationA,
            organizationB,
        ].sort(compareIdentifiers),
    );
    assert.equal(
        derived.find((o) => o.id === organizationA)!.name, 'Alpha',
    );
    assert.equal(
        derived.find((o) => o.id === organizationB)!.name, 'Beta',
    );
    // Phase Final Stage B: organizations table retired.
});

test('deriveOrganization 404s with store-shaped'
+ ' EntityNotFoundError on an absent id', async () => {
    const db = await freshDb();
    const missingId = generateIdentifier();
    await assert.rejects(
        () => deriveOrganization(db, missingId),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.equal(
                (error as { message: string }).message,
                'Not found: organizations/' + missingId,
            );
            return true;
        },
    );
});

// -- the live-PUT chain -----------------------------------------

test('a second live PUT supersedes the first; derive sees the'
+ ' NEW head, not the genesis body', async () => {
    const db = await freshDb();
    const organizationId = generateIdentifier();
    const first = await putOrganization(db, organizationId, 'First');
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const second = await putOrganization(db, organizationId, 'Second');
    assert.equal(second.headers.get('Supersedes'), null);

    const derived = await deriveOrganization(db, organizationId);
    assert.equal(derived.name, 'Second');
    const wire = await second.json();
    assert.deepEqual(derived, wire);

    const all = await deriveOrganizations(db);
    assert.equal(
        all.filter((org) => org.id === organizationId).length, 1,
    );
    // Phase Final Stage B: organizations table retired.
});

// -- the un-nested address proof ---------------------------------

test('the pair lives at the flat /organizations/ prefix, no'
+ ' organization segment — derive takes no org argument',
async () => {
    const db = await freshDb();
    const organizationId = generateIdentifier();
    await putOrganization(db, organizationId, 'Flat');
    const requests = await db.messagePairs.getAll();
    // seedAdminSchema forms 2 pairs (role-grants retired);
    // this PUT is the 3rd.
    assert.equal(requests.length, 3);
    assert.equal(requests[2]!.uri_collection, '/organizations/');
    assert.equal(requests[2]!.uri_id, organizationId);

    const derived = await deriveOrganization(db, organizationId);
    assert.equal(derived.id, organizationId);
});

// -- the id-echo roundtrip ----------------------------------------

test('a PUT whose body echoes id round-trips through'
+ ' derivation, mirroring the write path\'s own'
+ ' withoutId(body) strip', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/pcOGAHXkUUQAIuXHzKMGnw', DEV_TOKEN,
        { id: 'pcOGAHXkUUQAIuXHzKMGnw', ...organizationRow('Echo') },
    ));
    assert.equal(res.status, 201);
    const wire = await res.json();

    const derived = await deriveOrganization(db, 'pcOGAHXkUUQAIuXHzKMGnw');
    assert.deepEqual(derived, wire);

    const all = await deriveOrganizations(db);
    assert.deepEqual(
        all.find((org) => org.id === 'pcOGAHXkUUQAIuXHzKMGnw'), wire,
    );
    // Phase Final Stage B: organizations table retired.
});

// G3: stored PUT = organizationEntityOf (id-last). GET wins.
// The id-first writer pin is deleted — writer matches GET.
test('stored PUT body equals organizationEntityOf id-last',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const fields = organizationRow('Streamed');
    const put = await putOrganization(db, id, 'Streamed');
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/organizations/', id),
    );
    const expected = organizationEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: fields,
    });
    assert.equal(Object.keys(expected).at(-1), 'id');
    assert.deepEqual(stored, expected);
    const derived = await deriveOrganization(db, id);
    assert.deepEqual(stored, derived);
    const wire = await put.json();
    assert.deepEqual(stored, wire);
});
