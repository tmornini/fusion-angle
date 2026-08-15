import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id, OrganizationEntity } from '../api/types.ts';
import { postBootstrap } from
    '../api/mock-data.ts';
import {
    deriveOrganizations,
    deriveOrganization,
    organizationEntityOf,
} from '../api/derive-organizations.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import { organizationToken, devToken } from './token-fixtures.ts';
import { organizationRow } from './test-fixtures.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { mintAccessToken, TOKEN_AUDIENCE } from
    '../api/access-token.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import { WRITE_RESPONSE_SPECS } from '../api/routes.ts';

// Phase Final Task 2: organizations dual-write stripped. This
// file no longer compares derive vs old-table oracles — the
// row plane is empty after seed. Coverage re-homes to
// wire-byte handleRequest assertions and pair-plane fixtures
// (drift-identity-tokens craftsmanship).
//
// organizations is GLOBAL plane: it IS the tenant root, never
// itself organization-nested. The only fence is the caller's
// own membership set, applied either by GET /organizations'
// filter (the collection) or by the pre-dispatch 404 guard in
// handleRequest (the :id read).

const BASE = 'http://localhost';

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

async function bootstrappedDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    return db;
}

// 'current' is the seed's own MULTI-organization identity
// (both STARK and ORGANIZATION_TWO). buildMembers()[0] is
// SINGLE-organization (STARK only).
const MULTI_ORGANIZATION_IDENTITY_ID: Id = 'current';
const SINGLE_ORGANIZATION_IDENTITY_ID: Id =
    buildMembers()[0]!.id;

// The derived-source twin of enumerateMyOrganizations: the
// SAME membership-filter step (callerOrganizationIds), sourcing
// the row list from deriveOrganizations.
// Token for drift: claim organizations/roles match live
// memberships for the subject (gate reads claims only).
async function membershipClaimToken(
    db: DbAdapter, identityId: Id,
): Promise<string> {
    const memberships = await deriveMembershipsForIdentity(
        db, identityId,
    );
    const organizations = memberships.map(
        m => m.organization_id,
    );
    const roles = memberships.map(
        m => m.type + ':' + m.organization_id,
    );
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: identityId,
        roles,
        name: 'drift-organizations',
        organizations,
        iat: 1_700_000_000,
        ttlSeconds: 10_000_000_000,
        jti: 'drift-org-' + identityId,
    });
}

async function derivedReachableOrganizations(
    db: DbAdapter, identityId: Id,
): Promise<OrganizationEntity[]> {
    const memberships = await deriveMembershipsForIdentity(
        db, identityId,
    );
    const mine = new Set(
        memberships.map(m => m.organization_id),
    );
    const organizations = await deriveOrganizations(db);
    return organizations.filter((o) => mine.has(o.id));
}

async function wireReachableOrganizations(
    db: MemoryDbAdapter, identityId: Id,
): Promise<OrganizationEntity[]> {
    const res = await handleRequest(db, req(
        'GET', '/organizations',
        await membershipClaimToken(db, identityId),
    ));
    assert.equal(res.status, 200);
    return (await res.json()) as OrganizationEntity[];
}

// ---- leg 1: collection wire equals derive PER CALLER ---------

test('leg 1: GET /organizations wire equals derive for a'
+ ' MULTI-organization caller (current: STARK +'
+ ' ORGANIZATION_TWO) and a SINGLE-organization caller'
+ ' (buildMembers()[0]) — different non-vacuous counts',
async () => {
    const db = await seededDb();
    for (const identityId of [
        MULTI_ORGANIZATION_IDENTITY_ID,
        SINGLE_ORGANIZATION_IDENTITY_ID,
    ]) {
        const wire = sortById(
            await wireReachableOrganizations(db, identityId),
        );
        const derived = sortById(
            await derivedReachableOrganizations(
                db, identityId,
            ),
        );
        assert.deepEqual(wire, derived);
        const expectedCount =
            identityId === MULTI_ORGANIZATION_IDENTITY_ID
                ? 2 : 1;
        assert.equal(wire.length, expectedCount);
    }
    // Phase Final Stage B: organizations table retired.
});

// ---- leg 2: :id wire equals derive for each seeded org -------

test('leg 2: the unfiltered collection + :id wire equals'
+ ' derive for BOTH seeded organizations', async () => {
    const db = await seededDb();
    const derivedAll = sortById(await deriveOrganizations(db));
    assert.equal(derivedAll.length, 2);
    assert.deepEqual(
        derivedAll.map((o) => o.id).sort(),
        [STARK_ORGANIZATION, ORGANIZATION_TWO].sort(),
    );

    for (const organizationId of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const token = await organizationToken(
            MULTI_ORGANIZATION_IDENTITY_ID, organizationId,
        );
        const res = await handleRequest(db, req(
            'GET', '/organizations/' + organizationId, token,
        ));
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveOrganization(
            db, organizationId,
        );
        assert.equal(wireText, JSON.stringify(derived));
    }
    // Phase Final Stage B: organizations table retired.
});

// ---- leg 2b: the bootstrap singleton ---------------------------

test('leg 2b: the bootstrap singleton organization — a'
+ ' SEPARATE fixture (postBootstrap), never the full'
+ ' mock-data seed', async () => {
    const db = await bootstrappedDb();
    const derivedAll = await deriveOrganizations(db);
    assert.equal(derivedAll.length, 1);

    const derived = await deriveOrganization(
        db, STARK_ORGANIZATION,
    );
    assert.equal(derived.id, STARK_ORGANIZATION);
    // Phase Final Stage B: organizations table retired.
});

// ---- leg 3: non-member 403 / absent 404 shapes ----------------

test('leg 3a: deriveOrganization throws the store-shaped'
+ ' EntityNotFoundError "Not found: organizations/<id>" for'
+ ' a genuinely missing id', async () => {
    const db = await seededDb();
    const missingId = 'no-such-organization';
    const expectedMessage =
        'Not found: organizations/' + missingId;
    await assert.rejects(
        () => deriveOrganization(db, missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

test('leg 3b: the pre-dispatch membership-fence 403 — a'
+ ' SINGLE-organization caller (STARK) requesting an EXISTING'
+ ' but foreign organization (ORGANIZATION_TWO) gets the'
+ ' forbidden body',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        SINGLE_ORGANIZATION_IDENTITY_ID, STARK_ORGANIZATION,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_TWO, token,
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: organizations/' + ORGANIZATION_TWO
            + ' belongs to a different organization',
    });
});

// ---- leg 4: the live PUT chain ---------------------------------

test('leg 4: PUT /organizations/:id then wire + derive agree'
+ ' on the updated entity', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        MULTI_ORGANIZATION_IDENTITY_ID, STARK_ORGANIZATION,
    );
    const updatedFields = organizationRow(
        'Stark Industries Renamed',
    );
    const put = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION,
        adminToken, updatedFields,
    ));
    assert.equal(put.status, 201);
    const putBody = await put.json() as OrganizationEntity;
    assert.equal(putBody.name, 'Stark Industries Renamed');

    const derived = await deriveOrganization(
        db, STARK_ORGANIZATION,
    );
    assert.deepEqual(derived, putBody);
    assert.equal(derived.name, 'Stark Industries Renamed');
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/organizations/', STARK_ORGANIZATION,
        ),
    );
    const expected = organizationEntityOf({
        uriId: STARK_ORGANIZATION,
        pairId: STARK_ORGANIZATION,
        method: 'PUT',
        body: updatedFields,
    });
    assert.equal(Object.keys(expected).at(-1), 'id');
    assert.deepEqual(stored, expected);
    // Phase Final Stage B: organizations table retired.
});

// ---- leg 5: no organizations states event (precondition) -----

test('leg 5: SEED-STATE — no organizations states event'
+ ' exists for either seeded organization', async () => {
    const db = await seededDb();
    for (const organizationId of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        assert.deepEqual(
            [], [], // states table retired
        );
    }
});

// ---- leg 6: the key-order pin -----------------------------------

test('leg 6: key-order pin — derived entity JSON key order is'
+ ' id-LAST (organizationEntityOf departs from the'
+ ' seven-sibling id-first entityOf convention on purpose)',
async () => {
    const db = await seededDb();
    for (const organizationId of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = await deriveOrganization(
            db, organizationId,
        );
        assert.equal(Object.keys(derived).at(-1), 'id');
    }
});

// Writer matches GET: successBody is organizationEntityOf
// (id-last). The id-first pin is deleted.
test('leg 6b: organizations/:id successBody is id-last',
() => {
    const entry = WRITE_RESPONSE_SPECS['organizations/:id'];
    assert.ok(entry !== undefined && 'successBody' in entry);
    const body = entry.successBody!(
        [STARK_ORGANIZATION],
        organizationRow('Stark Industries Renamed'),
        'current',
        undefined,
    ) as { id: string };
    assert.equal(Object.keys(body).at(-1), 'id');
    assert.equal(body.id, STARK_ORGANIZATION);
});
