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
    apiRequest,
    pairIdOf,
    storedPutBodyText,
} from './http-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
    seedOrganizationDocument,
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
// wire-body / derive agreement and message-plane document proofs.
// A PUT here rewrites the claim organization's live head,
// latched on the ETag it reads; any other organization a
// case needs is seeded below the fence.

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
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// DEV_TOKEN's claim organization, which seedAdminSchema
// seeds. The organization document's PUT is class B and
// takes the path fence, so only this id's live head takes
// a PUT, and only with its current ETag.
const CLAIM_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

async function putClaimOrganization(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<Response> {
    const path = '/organizations/' + CLAIM_ORGANIZATION;
    const read = await handleRequest(db, req(
        'GET', path, DEV_TOKEN,
    ));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    return handleRequest(db, apiRequest({
        method: 'PUT',
        path,
        token: DEV_TOKEN,
        body,
        headers: { 'If-Match': read.headers.get('ETag')! },
    }));
}

// -- mapping parity vs wire ------------------------------------

Deno.test('deriveOrganization mirrors the PUT wire body exactly',
async () => {
    const db = await freshDb();
    const res = await putClaimOrganization(
        db, organizationRow('Acme'),
    );
    assertStrictEquals(res.status, 200);
    const wire = await res.json();
    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
    assertEquals(derived, wire);
    // Phase Final Stage B: organizations table retired.
});

Deno.test('deriveOrganizations mirrors every PUT wire body,'
+ ' id-lex ordered', async () => {
    const db = await freshDb();
    // seedAdminSchema plants org 'AjdvjuECVZEgZoFajaIEkg'; these
    // two seeds add more heads — derive is id-lex over the
    // full set.
    const organizationB = generateIdentifier();
    const organizationA = generateIdentifier();
    await seedOrganizationDocument(db, organizationB, 'Beta');
    await seedOrganizationDocument(db, organizationA, 'Alpha');
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
    const first = await putClaimOrganization(
        db, organizationRow('First'),
    );
    const firstId = pairIdOf(first);
    assert(firstId);
    await first.body?.cancel();
    const second = await putClaimOrganization(
        db, organizationRow('Second'),
    );
    assertStrictEquals(second.headers.get('Supersedes'), null);

    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
    assertStrictEquals(derived.name, 'Second');
    const wire = await second.json();
    assertEquals(derived, wire);

    const all = await deriveOrganizations(db);
    assertStrictEquals(
        all.filter((org) => org.id === CLAIM_ORGANIZATION).length,
        1,
    );
    // Phase Final Stage B: organizations table retired.
});

// -- the un-nested document proof ---------------------------------

Deno.test('the pair lives at the flat /organizations/ prefix, no'
+ ' organization segment — derive takes no org argument',
async () => {
    const db = await freshDb();
    const put = await putClaimOrganization(
        db, organizationRow('Flat'),
    );
    const putId = pairIdOf(put);
    await put.body?.cancel();
    const requests = await db.messagePairs.getAll();
    // nil root + seedAdminSchema's 3 pairs + this PUT.
    assertStrictEquals(requests.length, 5);
    const stored = requests.find((row) => row.id === putId);
    assert(stored !== undefined);
    assertStrictEquals(stored.path, '/organizations/');
    assertStrictEquals(stored.name, CLAIM_ORGANIZATION);

    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
    assertStrictEquals(derived.id, CLAIM_ORGANIZATION);
});

// -- the id-echo roundtrip ----------------------------------------

Deno.test('a PUT whose body echoes id round-trips through'
+ ' derivation, mirroring the write path\'s own'
+ ' withoutId(body) strip', async () => {
    const db = await freshDb();
    const res = await putClaimOrganization(
        db, { id: CLAIM_ORGANIZATION, ...organizationRow('Echo') },
    );
    assertStrictEquals(res.status, 200);
    const wire = await res.json();

    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
    assertEquals(derived, wire);

    const all = await deriveOrganizations(db);
    assertEquals(
        all.find((org) => org.id === CLAIM_ORGANIZATION), wire,
    );
    // Phase Final Stage B: organizations table retired.
});

// G3: stored PUT = organizationEntityOf (id-first). GET wins.
// The id-last writer pin is deleted — writer matches GET.
Deno.test('stored PUT body equals organizationEntityOf id-first',
async () => {
    const db = await freshDb();
    const id = CLAIM_ORGANIZATION;
    const fields = organizationRow('Streamed');
    const put = await putClaimOrganization(db, fields);
    assertStrictEquals(put.status, 200);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/organizations/', id),
    );
    const expected = organizationEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: fields,
    });
    assertStrictEquals(Object.keys(expected).at(0), 'id');
    assertEquals(stored, expected);
    const derived = await deriveOrganization(db, id);
    assertEquals(stored, derived);
    const wire = await put.json();
    assertEquals(stored, wire);
});
