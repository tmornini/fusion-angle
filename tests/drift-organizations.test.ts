import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id, OrganizationEntity } from '../api/types.ts';
import type { Principal } from '../api/access-token.ts';
import { postMockDataLoad, postBootstrap } from
    '../api/mock-data.ts';
import {
    deriveOrganizations,
    deriveOrganization,
} from '../api/derive-organizations.ts';
import { callerOrganizationIds } from '../api/request-auth.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import { organizationToken, devToken } from './token-fixtures.ts';
import { organizationRow } from './test-fixtures.ts';

// The E10 drift check (Phase 12 Task 4): the parity proof
// comparing OLD-plane organizations reads (the row-plane
// db.organizations store, plus the pre-dispatch membership
// fence in api.ts) to the message-derived output
// (api/derive-organizations.ts) — the SAME OLD-vs-DERIVED
// comparison method tests/drift-states.test.ts established.
// NOTHING reads api/derive-organizations.ts in production yet
// (gate 9: organizations stays a hand-written, UNFLIPPED
// family) — this file alone gates that flip (Task 5) and stays
// a regression guard through Phase Final, like every sibling
// drift suite (tests/drift-*.test.ts).
//
// organizations is GLOBAL plane, like identities/members: it IS
// the tenant root, never itself organization-nested. The row
// store carries no org-scoping of its own (db-organization-
// scoped.ts passes `organizations: base.organizations` straight
// through) — the only fence is the caller's own membership set,
// applied either by GET /organizations' filter (the collection,
// leg 1) or by the pre-dispatch 404 guard in handleRequest (the
// :id read, leg 3b). Both fences read the SAME row-plane
// `memberships` table on either side of every comparison below
// — this task owns organizations parity alone, not memberships'.

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// The mock-data-bootstrap.test.ts precedent: a SEPARATE,
// smaller fixture — the singleton-organization pristine install
// — never the full mock-data seed.
async function bootstrappedDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    return db;
}

// 'current' is the seed's own MULTI-organization identity (both
// STARK and ORGANIZATION_TWO — mock-data/seed-message-pairs.ts's
// own membership loop: "'current' (the admin) joins BOTH orgs;
// every other human is single-org via assignOrganization").
// buildMembers()[0] is SINGLE-organization (index 0, STARK
// only, via assignOrganization's index-parity split).
const MULTI_ORGANIZATION_IDENTITY_ID: Id = 'current';
const SINGLE_ORGANIZATION_IDENTITY_ID: Id = buildMembers()[0]!.id;

// The derived-source twin of api/organization-requests.ts's own
// (module-private) enumerateMyOrganizations: the SAME
// membership-filter step (callerOrganizationIds), sourcing the
// row list from deriveOrganizations rather than
// db.organizations.getAll(). The filter itself is untouched —
// leg 1 is about the ORGANIZATION-LIST source, not the fence.
async function derivedReachableOrganizations(
    db: DbAdapter, identityId: Id,
): Promise<OrganizationEntity[]> {
    const principal: Principal = {
        id: identityId, roles: [], name: 'drift-organizations',
    };
    const mine = await callerOrganizationIds(db, principal);
    const organizations = await deriveOrganizations(db);
    return organizations.filter((o) => mine.has(o.id));
}

// The OLD-source counterpart: the ACTUAL production route,
// driven through handleRequest — enumerateMyOrganizations is
// module-private, so this is the only way to exercise the real
// code, never a reimplementation of the OLD side.
async function oldReachableOrganizations(
    db: MemoryDbAdapter, identityId: Id,
): Promise<OrganizationEntity[]> {
    const res = await handleRequest(db, req(
        'GET', '/organizations', await devToken(identityId),
    ));
    assert.equal(res.status, 200);
    return (await res.json()) as OrganizationEntity[];
}

// ---- leg 1: collection parity PER CALLER ---------------------

test('leg 1: GET /organizations parity for a MULTI-organization'
+ ' caller (current: STARK + ORGANIZATION_TWO) and a SINGLE-'
+ 'organization caller (buildMembers()[0]) — the membership'
+ ' filter is part of the read, so both the filter and the'
+ ' derived source must agree with the row-plane route, and the'
+ ' two callers see DIFFERENT non-vacuous counts', async () => {
    const db = await seededDb();
    for (const identityId of [
        MULTI_ORGANIZATION_IDENTITY_ID,
        SINGLE_ORGANIZATION_IDENTITY_ID,
    ]) {
        const old = sortById(
            await oldReachableOrganizations(db, identityId),
        );
        const derived = sortById(
            await derivedReachableOrganizations(db, identityId),
        );
        assert.deepEqual(derived, old);
        const expectedCount =
            identityId === MULTI_ORGANIZATION_IDENTITY_ID ? 2 : 1;
        assert.equal(old.length, expectedCount);
    }
});

// ---- leg 2: :id parity for each seeded organization + the ----
// ---- unfiltered collection -------------------------------------

test('leg 2: the unfiltered collection + :id parity for BOTH'
+ ' seeded organizations (STARK, ORGANIZATION_TWO)', async () => {
    const db = await seededDb();
    const derivedAll = sortById(await deriveOrganizations(db));
    const oldAll = sortById(await db.organizations.getAll());
    assert.deepEqual(derivedAll, oldAll);
    assert.equal(derivedAll.length, 2);

    for (const organizationId of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = await deriveOrganization(
            db, organizationId,
        );
        const old = await db.organizations.getById(
            organizationId,
        );
        assert.deepEqual(derived, old);
    }
});

// ---- leg 2b: the bootstrap singleton ---------------------------

test('leg 2b: the bootstrap singleton organization — a'
+ ' SEPARATE fixture (postBootstrap, the mock-data-bootstrap.'
+ 'test.ts precedent), never the full mock-data seed',
async () => {
    const db = await bootstrappedDb();
    const derivedAll = await deriveOrganizations(db);
    const oldAll = await db.organizations.getAll();
    assert.deepEqual(derivedAll, oldAll);
    assert.equal(oldAll.length, 1);

    const derived = await deriveOrganization(
        db, STARK_ORGANIZATION,
    );
    const old = await db.organizations.getById(
        STARK_ORGANIZATION,
    );
    assert.deepEqual(derived, old);
    assert.equal(old.id, STARK_ORGANIZATION);
});

// ---- leg 3: non-member 404 parity, SCOPED PER-TRIGGER ---------
//
// Two DIFFERENT pre-existing 404 shapes, never cross-compared:
// (a) the store's EntityNotFoundError — 'Not found:
// organizations/<id>', no leading slash — fires when getById is
// actually reached (a genuinely missing row); (b) the pre-
// dispatch membership-fence guard in api.ts — 'Not found:
// /organizations/<id>', WITH a leading slash (the pathname, not
// a table/id pair) — fires BEFORE dispatch for a caller who is
// not a member of an EXISTING org, so getById (and therefore the
// derivation) never runs at all. (b) is unaffected by the Task 5
// flip — it is pinned against its own literal, not a second
// derived computation, because there IS no derived-plane
// counterpart to compare: the fence runs identically whether the
// read AFTER it is row-plane or derived-plane.

test('leg 3a: the EntityNotFoundError store-shaped 404 —'
+ ' deriveOrganization and db.organizations.getById both throw'
+ ' the SAME byte-exact "Not found: organizations/<id>" for a'
+ ' genuinely missing id', async () => {
    const db = await seededDb();
    const missingId = 'no-such-organization';
    const expectedMessage =
        'Not found: organizations/' + missingId;
    await assert.rejects(
        () => db.organizations.getById(missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
    await assert.rejects(
        () => deriveOrganization(db, missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

test('leg 3b: the pre-dispatch membership-fence 404 — a'
+ ' SINGLE-organization caller (STARK) requesting an EXISTING'
+ ' but foreign organization (ORGANIZATION_TWO) gets the'
+ ' pathname-shaped "Not found: /organizations/<id>", WITH a'
+ ' leading slash — pinned against its own literal', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        SINGLE_ORGANIZATION_IDENTITY_ID, STARK_ORGANIZATION,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_TWO, token,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: /organizations/' + ORGANIZATION_TWO,
    });
});

// ---- leg 4: the live PUT chain re-compared ---------------------

test('leg 4: PUT /organizations/:id (the org-settings save'
+ ' path) then old vs derived read parity on the updated'
+ ' entity', async () => {
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
    assert.equal(put.status, 200);

    const derived = await deriveOrganization(
        db, STARK_ORGANIZATION,
    );
    const old = await db.organizations.getById(
        STARK_ORGANIZATION,
    );
    assert.deepEqual(derived, old);
    assert.equal(derived.name, 'Stark Industries Renamed');
});

// ---- leg 5: the SEED-STATE assertion (lens 2 BLOCKING) ---------
//
// deriveOrganization/deriveOrganizations consult NO states row
// at all (they read only requests/responses); db.organizations
// (EntityStore) DOES consult the states log for a 'deleted'
// tombstone before answering (api/store-entity.ts's own
// isDeletedIn/getDeletedIdsIn calls). In the SEEDED dataset no
// organizations states event exists, so the two planes agree —
// this leg asserts THAT PRECONDITION, not structural
// impossibility. A crafted PUT /states/:id CAN inject a
// 'deleted' event naming an organization id (states/:id is
// member-tier-reachable and generic across families) — that
// would hide the row on the OLD plane while the derivation,
// which never checks states, would still show it. This is a
// NAMED, carried watch-point, out of scope for this task — never
// tested here as if it were impossible.

test('leg 5: SEED-STATE — no organizations states event exists'
+ ' for either seeded organization, the precondition under'
+ ' which leg 2\'s parity holds', async () => {
    const db = await seededDb();
    for (const organizationId of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        assert.deepEqual(
            await db.states.getAllFor(organizationId), [],
        );
    }
});

// ---- leg 6: the key-order pin -----------------------------------

test('leg 6: key-order pin — the derived entity\'s JSON key'
+ ' order equals the stored row\'s, id-LAST on BOTH (the'
+ ' wire-covenant delta (2) prefer-preservation branch —'
+ ' organizationEntityOf departs from the seven-sibling'
+ ' id-first entityOf convention on purpose)', async () => {
    const db = await seededDb();
    for (const organizationId of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = await deriveOrganization(
            db, organizationId,
        );
        const old = await db.organizations.getById(
            organizationId,
        );
        assert.deepEqual(Object.keys(derived), Object.keys(old));
        assert.equal(Object.keys(old).at(-1), 'id');
    }
});
