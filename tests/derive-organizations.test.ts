import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
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

Deno.test('deriveOrganization mirrors the PUT wire body exactly',
async () => {
    const db = await freshDb();
    const organizationId = generateIdentifier();
    const res = await putOrganization(db, organizationId, 'Acme');
    assertStrictEquals(res.status, 201);
    const wire = await res.json();
    const derived = await deriveOrganization(db, organizationId);
    assertEquals(derived, wire);
    // Phase Final Stage B: organizations table retired.
});

Deno.test('deriveOrganizations mirrors every PUT wire body,'
+ ' id-lex ordered', async () => {
    const db = await freshDb();
    // seedAdminSchema plants org 'AjdvjuECVZEgZoFajaIEkg'; these two PUTs add
    // more heads — derive is id-lex over the full set.
    const organizationB = generateIdentifier();
    const organizationA = generateIdentifier();
    const beta = await putOrganization(db, organizationB, 'Beta');
    const alpha = await putOrganization(db, organizationA, 'Alpha');
    assertStrictEquals(beta.status, 201);
    assertStrictEquals(alpha.status, 201);
    const derived = await deriveOrganizations(db);
    assertEquals(
        derived.map((o) => o.id),
        [
            'AjdvjuECVZEgZoFajaIEkg',
            organizationA,
            organizationB,
        ].sort(compareIdentifiers),
    );
    assertStrictEquals(
        derived.find((o) => o.id === organizationA)!.name, 'Alpha',
    );
    assertStrictEquals(
        derived.find((o) => o.id === organizationB)!.name, 'Beta',
    );
    // Phase Final Stage B: organizations table retired.
});

Deno.test('deriveOrganization 404s with store-shaped'
+ ' EntityNotFoundError on an absent id', async () => {
    const db = await freshDb();
    const missingId = generateIdentifier();
    const err = await assertRejects(
        () => deriveOrganization(db, missingId),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(
        err.message, 'Not found: organizations/' + missingId,
    );
});

// -- the live-PUT chain -----------------------------------------

Deno.test('a second live PUT supersedes the first; derive sees the'
+ ' NEW head, not the genesis body', async () => {
    const db = await freshDb();
    const organizationId = generateIdentifier();
    const first = await putOrganization(db, organizationId, 'First');
    const firstId = first.headers.get('Response-ID');
    assert(firstId);
    const second = await putOrganization(db, organizationId, 'Second');
    assertStrictEquals(second.headers.get('Supersedes'), null);

    const derived = await deriveOrganization(db, organizationId);
    assertStrictEquals(derived.name, 'Second');
    const wire = await second.json();
    assertEquals(derived, wire);

    const all = await deriveOrganizations(db);
    assertStrictEquals(
        all.filter((org) => org.id === organizationId).length, 1,
    );
    // Phase Final Stage B: organizations table retired.
});

// -- the un-nested address proof ---------------------------------

Deno.test('the pair lives at the flat /organizations/ prefix, no'
+ ' organization segment — derive takes no org argument',
async () => {
    const db = await freshDb();
    const organizationId = generateIdentifier();
    await putOrganization(db, organizationId, 'Flat');
    const requests = await db.messagePairs.getAll();
    // seedAdminSchema forms 2 pairs (role-grants retired);
    // this PUT is the 3rd.
    assertStrictEquals(requests.length, 3);
    assertStrictEquals(requests[2]!.uri_collection, '/organizations/');
    assertStrictEquals(requests[2]!.uri_id, organizationId);

    const derived = await deriveOrganization(db, organizationId);
    assertStrictEquals(derived.id, organizationId);
});

// -- the id-echo roundtrip ----------------------------------------

Deno.test('a PUT whose body echoes id round-trips through'
+ ' derivation, mirroring the write path\'s own'
+ ' withoutId(body) strip', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/pcOGAHXkUUQAIuXHzKMGnw', DEV_TOKEN,
        { id: 'pcOGAHXkUUQAIuXHzKMGnw', ...organizationRow('Echo') },
    ));
    assertStrictEquals(res.status, 201);
    const wire = await res.json();

    const derived = await deriveOrganization(db, 'pcOGAHXkUUQAIuXHzKMGnw');
    assertEquals(derived, wire);

    const all = await deriveOrganizations(db);
    assertEquals(
        all.find((org) => org.id === 'pcOGAHXkUUQAIuXHzKMGnw'), wire,
    );
    // Phase Final Stage B: organizations table retired.
});

// G3: stored PUT = organizationEntityOf (id-last). GET wins.
// The id-first writer pin is deleted — writer matches GET.
Deno.test('stored PUT body equals organizationEntityOf id-last',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const fields = organizationRow('Streamed');
    const put = await putOrganization(db, id, 'Streamed');
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/organizations/', id),
    );
    const expected = organizationEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: fields,
    });
    assertStrictEquals(Object.keys(expected).at(-1), 'id');
    assertEquals(stored, expected);
    const derived = await deriveOrganization(db, id);
    assertEquals(stored, derived);
    const wire = await put.json();
    assertEquals(stored, wire);
});
