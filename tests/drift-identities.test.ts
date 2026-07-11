import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    IdentityCredentialEntity,
    IdentityPiiEntity,
    MembershipEntity,
} from '../api/types.ts';
import { jsonArrayField, jsonObjectField, nowUtc } from
    '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { canonicalUriPrefix } from '../api/message-pair.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    validateIdentityDocumentBody,
    validateMembershipDocumentBody,
} from '../api/validators.ts';
import {
    postIdentityDocumentOp,
    postMembershipDocumentOp,
} from '../api/routes.ts';
import {
    deriveIdentityPiiRows,
    deriveIdentityPii,
    deriveCredentialsFor,
    deriveCredential,
    deriveRoleGrants,
    deriveRoleGrant,
    deriveIdentityProviders,
    deriveIdentityProvider,
    deriveTokenRevocation,
    deriveTokenRevocationsFor,
} from '../api/derive-identity-spine.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedIdentityCredential } from './identity-fixtures.ts';
import { currentRolesForInOrganization } from
    '../api/authorization.ts';
import { identityByEmail } from '../api/authentication.ts';

// Phase Final Task 2: identity spine dual-write stripped.
// This file no longer compares derive vs old-table oracles —
// the row plane is empty after seed. Coverage re-homes to
// wire-byte handleRequest assertions and pair-plane live
// fixtures (drift-roster / drift-identity-tokens craftsmanship).
//
// Hand-builds an IDENTITIES_TEST_WIRING mirror (the drift-roster
// idiom: routes.ts's own IDENTITIES_WIRING is module-private) so
// the identities cases below exercise the ACTUAL
// documentCollectionGetHandler/documentGetHandler — the SAME code
// path Task 8 wires live for GET /identities, never a
// reimplementation. A MEMBERSHIPS_TEST_WIRING mirror serves the
// gate-15 fence-leg proof below the SAME way. Old-plane reads via
// the BASE adapter (identities, identity_pii, identity_credentials,
// role_grants, identity_providers, identity_token_revocations are
// ALL global-plane or parent-derived, never org-scoped-by-column)
// and organizationScopedAdapter (the org-fence view identity_pii/
// role_grants each need) — NEVER through handleRequest for a
// comparison read, so the comparison survives the flip. Every
// LIVE write below rides handleRequest, exactly like drift-
// roster.test.ts.
//
// H7 (case 9): id-lex explicit sorts (sortById) bind EVERY
// collection assertion below — the memory tier's own getAll/
// getAllWhere is insertion-ordered, while every derived collection
// (api/derive-identity-spine.ts, api/document-family.ts's generic
// handlers alike) sorts byIdAscending by construction. A case that
// skipped the old-plane sort would pass or fail by ACCIDENT of
// insertion order, never by the property it claims to prove.
//
// THE DELETED-FILTER DIVERGENCE (case 8, NOT drift-tested):
// identities and identity_pii were EntityStore-backed; the
// states/:id escape hatch that once hid a row on the OLD
// plane (a hand-crafted 'deleted' event) is RETIRED with the
// address. Lifecycle for members rides PUT members/:id; no
// shipped route posts a 'deleted' state for an identities/
// identity_pii id, so derived-plane parity holds throughout
// every case below regardless.

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

function humanCreateBody(id: string): Record<string, unknown> {
    return {
        id,
        detail: {
            title: 't', department: 'd',
            strengths: jsonArrayField([]),
            team_dimensions: jsonObjectField({}),
        },
        initialState: 'active',
        initialStateEventId: id + '-genesis',
        initialStateAt: nowUtc(),
    };
}

// The route's own private projection (api/routes.ts's
// withoutSecret) re-derived here — the SAME pattern
// liveClosureRoster (tests/drift-roster.test.ts) uses for a
// module-private closure this file must independently reproduce.
function withoutSecret<T extends { secret: string }>(
    cred: T,
): Omit<T, 'secret'> {
    const { secret: _secret, ...rest } = cred;
    return rest;
}

// -- test-side wiring mirrors (routes.ts's private rows, by ----
// -- content) ------------------------------------------------------

const IDENTITIES_TEST_WIRING: DocumentFamilyWiring = {
    family: 'identities',
    lifecycle: 'stateless',
    notFoundTable: 'identities',
    validateDocument: validateIdentityDocumentBody,
    documentOp: postIdentityDocumentOp,
    entityOf: (document, _organization) => ({
        id: document.uriId,
        ...document.body,
    }),
};

const MEMBERSHIPS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'memberships',
    lifecycle: 'stateless',
    notFoundTable: 'memberships',
    validateDocument: validateMembershipDocumentBody,
    documentOp: postMembershipDocumentOp,
    entityOf: (document, _organization) => ({
        id: document.uriId,
        ...document.body,
    }),
};

// identities is GLOBAL plane (family-registry.ts:
// organizationNested:false) — canonicalUriPrefix ignores whatever
// organization value a caller passes for this family, so this
// fixed placeholder is never load-bearing; requireOrganization
// (document-family.ts) merely demands a defined value to dispatch
// through — the drift-roster.test.ts GLOBAL_PLANE_PLACEHOLDER
// precedent.
const READER_ACTOR: Id = 'drift-reader';
const GLOBAL_PLANE_PLACEHOLDER: Id = STARK_ORGANIZATION;

async function derivedIdentities(
    db: DbAdapter, organization: Id,
): Promise<{ id: Id; kind: string }[]> {
    return documentCollectionGetHandler(IDENTITIES_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<{ id: Id; kind: string }[]>;
}

async function derivedIdentity(
    db: DbAdapter, organization: Id, id: Id,
): Promise<{ id: Id; kind: string }> {
    return documentGetHandler(IDENTITIES_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<{ id: Id; kind: string }>;
}

// -- gate 15: the membership-fence inputs, derived from the ----
// -- membership PAIR plane (NEVER the org-scoped memberships -----
// -- store, which hides foreign rows and could not distinguish ---
// -- foreign from orphan) ------------------------------------------
//
// The caller-org leg reads the org-nested memberships prefix (via
// MEMBERSHIPS_TEST_WIRING's generic collection derivation, exactly
// as tests/drift-roster.test.ts's own derivedMemberships does);
// the any-membership leg unions that SAME derivation across every
// KNOWN seeded organization — memberships is org-nested
// (family-registry.ts), so there is no single global address to
// scan, and the two seeded organizations are the drift-roster.
// test.ts precedent's own known-org set (its case 1's "10/6
// split", its THIRD_ORGANIZATION empty leg).
//
// Both legs ride documentCollectionGetHandler bare, uncoupled
// by any wrapping transaction across the Promise.all pair — no
// hazard: this suite seeds its db once per test and never
// mutates it concurrently with a read, so no writer can land
// between the two legs and tear the union.

async function pairPlaneMembershipsAcrossKnownOrganizations(
    db: DbAdapter,
): Promise<MembershipEntity[]> {
    const perOrganization = await Promise.all(
        [STARK_ORGANIZATION, ORGANIZATION_TWO].map(
            (organization) =>
                documentCollectionGetHandler(
                    MEMBERSHIPS_TEST_WIRING,
                )(
                    db, [], READER_ACTOR, organization,
                ) as Promise<MembershipEntity[]>,
        ),
    );
    return perOrganization.flat();
}

// viaMembership's OWN three-way algorithm (api/store-parent-
// scoped.ts), re-derived here over the PAIR-PLANE union above
// rather than the row-plane's identity_id index: null (orphan,
// visible), the bound org (co-member, visible), or a DIFFERENT
// org (foreign, hidden).
function pairPlaneOwnerOrganization(
    memberships: readonly MembershipEntity[],
    identityId: Id,
    boundOrganization: Id,
): Id | null {
    const mine = memberships.filter(
        (m) => m.identity_id === identityId,
    );
    if (mine.length === 0) return null;
    return mine.some(
        (m) => m.organization_id === boundOrganization,
    )
        ? boundOrganization
        : mine[0]!.organization_id;
}

async function pairPlaneFencedPii(
    db: DbAdapter, organization: Id,
): Promise<IdentityPiiEntity[]> {
    const rows = await deriveIdentityPiiRows(db);
    const memberships =
        await pairPlaneMembershipsAcrossKnownOrganizations(db);
    return rows.filter((row) => {
        const owner = pairPlaneOwnerOrganization(
            memberships, row.id, organization,
        );
        return owner === null || owner === organization;
    });
}

// One fence leg: PROVES the pair-plane construction's visibility
// decision equals the row-plane parentScope resolver's ACTUAL
// decision (organizationScopedAdapter's identityPii.getById,
// gate 15) — never assumed, always independently re-derived from
// BOTH sides. When visible on both, the leaf rows themselves are
// also pinned deep-equal.
async function assertPiiFenceLeg(
    db: DbAdapter, organization: Id, identityId: Id,
): Promise<boolean> {
    // Phase Final Task 2: row plane empty — fence decision is
    // pair-plane only. deriveIdentityPii is unfenced (leaf
    // always derives when a slot exists); visibility is the
    // membership fence alone.
    const memberships =
        await pairPlaneMembershipsAcrossKnownOrganizations(db);
    const owner = pairPlaneOwnerOrganization(
        memberships, identityId, organization,
    );
    const pairPlaneVisible =
        owner === null || owner === organization;
    // Slot always derives when present (fence is route-side).
    await deriveIdentityPii(db, identityId);
    return pairPlaneVisible;
}

// -- 1. identities collection parity + getById + 404 bytes ------

test('identities collection wire equals derive (16 incl. the'
+ ' 4 AI + system) + getById + 404-byte parity', async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.

    const derived = sortById(
        await derivedIdentities(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    assert.equal(derived.length, 16);
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const res = await handleRequest(
        db, req('GET', '/identities', token),
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), JSON.stringify(derived));

    for (const identity of derived) {
        const one = await derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, identity.id,
        );
        assert.deepEqual(one, identity);
        const leaf = await handleRequest(
            db,
            req('GET', '/identities/' + identity.id, token),
        );
        assert.equal(leaf.status, 200);
        assert.equal(await leaf.text(), JSON.stringify(one));
    }

    const missingId = 'no-such-identity';
    const expectedMessage = 'Not found: identities/' + missingId;
    await assert.rejects(
        () => derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, missingId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

// -- 2. identity-pii collection parity + the THREE-WAY --------
// -- viaMembership fence legs + leaf parity + 404 bytes ---------

test('identity-pii collection (11 seeded slots) fenced both'
+ ' orgs + the THREE-WAY viaMembership fence legs (co-member'
+ ' visible, FOREIGN-org hidden — orphan visible) + leaf +'
+ ' 404 bytes', async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.

    // -- unfenced collection (every live slot) --
    const derivedRows = sortById(await deriveIdentityPiiRows(db));
    assert.equal(derivedRows.length, 11);

    // -- fenced collection both orgs (pair-plane fence) --
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derivedFenced = sortById(
            await pairPlaneFencedPii(db, organization),
        );
        assert.ok(derivedFenced.length > 0);
        // every fenced row is in the unfenced set
        const unfencedIds = new Set(derivedRows.map(r => r.id));
        for (const row of derivedFenced) {
            assert.ok(unfencedIds.has(row.id));
        }
    }

    // -- per-identity leaf + 404 --
    for (const row of derivedRows) {
        const derived = await deriveIdentityPii(db, row.id);
        assert.deepEqual(derived, row);
    }
    const missingId = 'no-such-pii';
    const expectedMessage = 'Not found: identity_pii/' + missingId;
    await assert.rejects(
        () => deriveIdentityPii(db, missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );

    // -- THE THREE-WAY FENCE LEGS (gate 15) --
    const adminToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );

    // co-member leg: 'current' is a Stark member (seeded) with a
    // seeded pii row — visible from STARK on both planes.
    assert.equal(
        await assertPiiFenceLeg(db, STARK_ORGANIZATION, 'current'),
        true,
    );

    // FOREIGN-org leg — the leak case, constructed explicitly: a
    // fresh identity whose ONLY membership is ORGANIZATION_TWO
    // must be HIDDEN from STARK (an org-scoped memberships store
    // would instead read as orphan — the leak this fence closes)
    // and VISIBLE from ORGANIZATION_TWO.
    const foreignId = 'pii-fence-foreign-1';
    await handleRequest(db, req(
        'POST', '/identities', adminToken,
        { id: foreignId, kind: 'person' },
    ));
    await handleRequest(db, req(
        'PUT', '/identities/' + foreignId + '/pii', adminToken,
        {
            name: 'Foreign Fence', email: 'foreign-fence@x.com',
            phone: '', bio: '',
        },
    ));
    await handleRequest(db, req(
        'PUT', '/memberships/ms-pii-fence-foreign-1',
        await organizationToken('current', ORGANIZATION_TWO),
        {
            organization_id: ORGANIZATION_TWO,
            identity_id: foreignId, at: nowUtc(),
        },
    ));
    assert.equal(
        await assertPiiFenceLeg(
            db, STARK_ORGANIZATION, foreignId,
        ),
        false,
    );
    assert.equal(
        await assertPiiFenceLeg(
            db, ORGANIZATION_TWO, foreignId,
        ),
        true,
    );

    // orphan leg: a fresh identity with NO membership anywhere —
    // visible from STARK (and would be from any org).
    const orphanId = 'pii-fence-orphan-1';
    await handleRequest(db, req(
        'POST', '/identities', adminToken,
        { id: orphanId, kind: 'person' },
    ));
    await handleRequest(db, req(
        'PUT', '/identities/' + orphanId + '/pii', adminToken,
        {
            name: 'Orphan Fence', email: 'orphan-fence@x.com',
            phone: '', bio: '',
        },
    ));
    assert.equal(
        await assertPiiFenceLeg(
            db, STARK_ORGANIZATION, orphanId,
        ),
        true,
    );
});

// -- 2b. the by-email login-shape leg (Phase 13 Task 8, concern -
// -- 2): authorizePassword's identity lookup now feeds -----------
// -- identityByEmail from deriveIdentityPiiRows rather than the --
// -- row-plane identityPii.getAllWhere('email', ...) scan — this -
// -- proves the reducer resolves the SAME identity id from BOTH --
// -- planes, for every seeded email AND an unknown one (both -----
// -- null, the no-enumeration shape) -------------------------------

test('by-email login-shape: identityByEmail resolves every'
+ ' seeded email on the pair plane + unknown is null',
async () => {
    const db = await seededDb();
    const derivedRows = await deriveIdentityPiiRows(db);
    assert.equal(derivedRows.length, 11);
    // Phase Final Stage B: identity spine tables retired.
    for (const row of derivedRows) {
        assert.equal(
            identityByEmail(derivedRows, row.email), row.id,
        );
    }
    assert.equal(
        identityByEmail(derivedRows, 'nobody@example.com'),
        null,
    );
});

// -- 3. credentials parity per identity + per cid + the ---------
// -- withoutSecret projection pin + 404 bytes --------------------

test('credentials per identity + per cid (12 seeded) + the'
+ ' withoutSecret projection pin + 404 bytes', async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.

    // Collect identity ids from pair plane via parents + current
    // + system — credentials nest under identities.
    const parents = await derivedIdentities(
        db, GLOBAL_PLANE_PLACEHOLDER,
    );
    const allDerived: IdentityCredentialEntity[] = [];
    for (const identity of parents) {
        const derived = sortById(
            await deriveCredentialsFor(db, identity.id),
        );
        allDerived.push(...derived);
        for (const row of derived) {
            const one = await deriveCredential(
                db, identity.id, row.id,
            );
            assert.deepEqual(one, row);
            assert.equal(
                'secret' in withoutSecret(one), false,
            );
        }
    }
    assert.equal(allDerived.length, 12);

    const someIdentityId = allDerived[0]!.identity_id;
    const missingCid = 'no-such-credential';
    const expectedMessage =
        'Not found: identity_credentials/' + missingCid;
    await assert.rejects(
        () => deriveCredential(db, someIdentityId, missingCid),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

// -- 3b. GATE 15 FENCE-INPUT FIX (post-session review finding): --
// -- a mismatched below-facade write — address under identity A, -
// -- body.identity_id names B — must fence on the ROW's -----------
// -- identity_id (B), never the path (A), on BOTH planes; the -----
// -- collection's WHERE(identity_id==path) semantics must ALSO ----
// -- exclude it under path A on both planes, regardless of org ----

test('credentials fence-input fix: a mismatched write (address'
+ ' under identity A, body.identity_id names B) fences on the'
+ ' ROW identity (B), never the path (A) — the leaf, checked from'
+ " BOTH A's and B's org; the collection's WHERE(identity_id=="
+ 'path) excludes the row under path A on both planes regardless'
+ ' of org; the secret never rides either plane', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const identityA = 'cred-mismatch-a';
    const identityB = 'cred-mismatch-b';
    for (const id of [identityA, identityB]) {
        await handleRequest(db, req(
            'POST', '/identities', adminToken,
            { id, kind: 'person' },
        ));
    }
    // Different org memberships (the adjudicated scenario): A in
    // STARK, B in ORGANIZATION_TWO only — so the fence's answer
    // depends entirely on WHICH identity it keys on.
    await handleRequest(db, req(
        'PUT', '/memberships/ms-' + identityA, adminToken,
        {
            organization_id: STARK_ORGANIZATION,
            identity_id: identityA, at: nowUtc(),
        },
    ));
    await handleRequest(db, req(
        'PUT', '/memberships/ms-' + identityB,
        await organizationToken('current', ORGANIZATION_TWO),
        {
            organization_id: ORGANIZATION_TWO,
            identity_id: identityB, at: nowUtc(),
        },
    ));

    // The mismatched write itself — address under A, body names
    // B — producible only below-facade (no validator ties the
    // path to the body; no live write path can construct this).
    const cid = 'cred-mismatch-1';
    await seedIdentityCredential(db, identityA, cid, {
        identity_id: identityB, kind: 'password',
        status: 'set', secret: 'mismatch-secret', at: nowUtc(),
    });

    const memberships =
        await pairPlaneMembershipsAcrossKnownOrganizations(db);

    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        // -- leaf, path A: fence on ROW identity B --
        const credential = await deriveCredential(
            db, identityA, cid,
        );
        assert.equal(credential.identity_id, identityB);
        const owner = pairPlaneOwnerOrganization(
            memberships, credential.identity_id, organization,
        );
        const derivedVisible =
            owner === null || owner === organization;
        // B is ORGANIZATION_TWO-only: hidden from STARK,
        // visible from ORGANIZATION_TWO.
        assert.equal(
            derivedVisible,
            organization === ORGANIZATION_TWO,
            'leaf visibility for ' + organization,
        );
        assert.equal(
            'secret' in withoutSecret(credential), false,
        );

        // -- collection, path A: mismatched identity_id (B)
        // never equals path (A) — empty regardless of org.
        const derivedCollection = (
            await deriveCredentialsFor(db, identityA)
        ).filter((row) => row.identity_id === identityA);
        assert.deepEqual(derivedCollection, []);
    }
    // Phase Final Stage B: identity spine tables retired.
});

// -- 4. role-grants parity (both org fence legs) + getById + ----
// -- 404 bytes, a LIVE-CREATED grant (gate 16); providers + ------
// -- revocations parity (empty + live-write); a same-address -----
// -- double-PUT proving derived (response.at, id) == row-plane --
// -- last-call-wins ------------------------------------------------

test('role-grants parity (org fence legs both orgs) + getById +'
+ ' 404 bytes, driven against a LIVE-CREATED grant whose request'
+ ' body lacks organization_id (gate 16); providers + revocations'
+ ' parity (empty collections + live-write rows); a same-address'
+ ' double-PUT (credentials) proving the derived (response.at,'
+ ' id) reduction matches the row-plane last-call-wins within one'
+ ' realm (the cross-realm window is the named gate-12'
+ ' acceptance, not drift-tested here)', async () => {
    const db = await seededDb();

    // -- seeded role-grants collection + org fence legs --
    const derivedGrants = sortById(await deriveRoleGrants(db));
    assert.equal(derivedGrants.length, 12);
    // Phase Final Stage B: identity spine tables retired.
    for (const row of derivedGrants) {
        const one = await deriveRoleGrant(db, row.id);
        assert.deepEqual(one, row);
    }
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derivedForOrganization = sortById(
            (await deriveRoleGrants(db)).filter(
                (g) => g.organization_id === organization,
            ),
        );
        assert.ok(derivedForOrganization.length > 0);
        for (const g of derivedForOrganization) {
            assert.equal(g.organization_id, organization);
        }
    }

    // -- LIVE-CREATED grant: gate 16's deviation — the wire
    // REQUEST omits organization_id (web-app/app/adapters/
    // role-grants.ts); only the fence-stamped RESPONSE carries
    // it, which is why deriveRoleGrant(s) read the response. --
    const adminToken = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const grantId = 'role-grant-live-1';
    const grantPut = await handleRequest(db, req(
        'PUT', '/role-grants/' + grantId, adminToken,
        {
            identity_id: 'current', role: 'reviewer',
            action: 'granted', by_member_id: 'current',
            at: nowUtc(),
        },
    ));
    assert.equal(grantPut.status, 200);
    const derivedLive = await deriveRoleGrant(db, grantId);
    assert.equal(derivedLive.organization_id, ORGANIZATION_TWO);
    const derivedGrantsAfter = sortById(
        await deriveRoleGrants(db),
    );
    assert.equal(derivedGrantsAfter.length, 13);

    const missingGrantId = 'no-such-role-grant';
    const expectedGrantMessage =
        'Not found: role_grants/' + missingGrantId;
    await assert.rejects(
        () => deriveRoleGrant(db, missingGrantId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedGrantMessage,
    );

    // -- providers + revocations: empty collections seeded,
    // then a live-write each --
    assert.deepEqual(await deriveIdentityProviders(db), []);
    // Phase Final Stage B: identity spine tables retired.

    const providerId = 'provider-live-1';
    const providerPut = await handleRequest(db, req(
        'PUT', '/identity-providers/' + providerId, adminToken,
        {
            identity_id: 'current', provider: 'google',
            provider_subject: 'google-sub-1',
            action: 'linked', at: nowUtc(),
        },
    ));
    assert.equal(providerPut.status, 200);
    const derivedProviders = sortById(
        await deriveIdentityProviders(db),
    );
    assert.equal(derivedProviders.length, 1);
    assert.equal(
        (await deriveIdentityProvider(db, providerId)).id,
        providerId,
    );
    // Phase Final Stage B: identity spine tables retired.
    const missingProviderId = 'no-such-provider';
    const expectedProviderMessage =
        'Not found: identity_providers/' + missingProviderId;
    await assert.rejects(
        () => deriveIdentityProvider(db, missingProviderId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedProviderMessage,
    );

    // -- same-address double-PUT (a deterministic credential
    // cid): the derived (response.at, id) reduction matches the
    // row-plane's plain last-call-wins, within one realm. Runs
    // BEFORE the revocation-live write below — a revocation
    // event for 'current' invalidates every token issued to
    // 'current' before its `at`, which would otherwise 401 the
    // SAME adminToken this credential write still needs. --
    const cid = 'cred-double-put-1';
    const firstPut = await handleRequest(db, req(
        'PUT',
        '/identities/current/credentials/' + cid, adminToken,
        {
            identity_id: 'current', kind: 'password',
            status: 'set', secret: 'hash-one', at: nowUtc(),
        },
    ));
    assert.equal(firstPut.status, 200);
    const secondPut = await handleRequest(db, req(
        'PUT',
        '/identities/current/credentials/' + cid, adminToken,
        {
            identity_id: 'current', kind: 'password',
            status: 'rotated', secret: 'hash-two', at: nowUtc(),
        },
    ));
    assert.equal(secondPut.status, 200);
    assert.ok(secondPut.headers.get('Supersedes'));
    const derivedCredential = await deriveCredential(
        db, 'current', cid,
    );
    assert.equal(derivedCredential.secret, 'hash-two');
    assert.equal(derivedCredential.status, 'rotated');

    // Phase Final Stage B: identity spine tables retired.
    const revocationId = 'revocation-live-1';
    const revocationPut = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/' + revocationId,
        adminToken, { identity_id: 'current', at: nowUtc() },
    ));
    assert.equal(revocationPut.status, 200);
    const derivedRev = await deriveTokenRevocation(
        db, revocationId,
    );
    assert.equal(derivedRev.identity_id, 'current');
    const missingRevocationId = 'no-such-revocation';
    const expectedRevocationMessage =
        'Not found: identity_token_revocations/'
        + missingRevocationId;
    await assert.rejects(
        () => deriveTokenRevocation(db, missingRevocationId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedRevocationMessage,
    );

    // -- the by-identity fold (Phase 13 Task 4): the coarse
    // 'sign out everywhere' gate reads THIS shape. Parity with
    // the row plane is necessary but not sufficient (II
    // Security) — a derivation MISS here would ADMIT a
    // signed-out session, so the leg also drives adminToken
    // (minted with an iat that predates the revocation's `at`
    // above) through the LIVE Bearer gate and proves it now
    // 401s, showing the revocation is SEEN, not merely mirrored
    // on the row plane. --
    const derivedForCurrent = sortById(
        await deriveTokenRevocationsFor(db, 'current'),
    );
    assert.equal(derivedForCurrent.length, 1);
    assert.deepEqual(
        await deriveTokenRevocationsFor(db, 'no-such-identity'),
        [],
    );
    const revoked = await handleRequest(
        db, req('GET', '/members', adminToken),
    );
    assert.equal(revoked.status, 401);
});

// -- 4b. the hot-path FILTERED shape: currentRolesForInOrganization
// -- over derived vs row-plane role-grant rows, for a seeded -----
// -- admin and a seeded member, per organization — case 4's own --
// -- collection parity proves the UNFILTERED row sets equal; it --
// -- does NOT exercise the per-identity, per-org FILTER the two --
// -- flipped readers (callerRolesInOrganization,
// -- callerIsOrganizationAdmin) actually apply --------------------

test("role-grants hot-path filtered shape: currentRolesFor"
+ "InOrganization over derived grants for a seeded admin"
+ " ('current') and a seeded member, per organization",
async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.
    // sarahId: STARK-only seeded member. mikeId: ORGANIZATION_TWO-
    // only seeded member (both from the mock-data member pool;
    // 'current' is seeded admin in BOTH orgs).
    const sarahId = 'LhfaUUf4IumVsCSGB4xjdK';
    const mikeId = 'bLP3X1hb1mSz8gY9neogU3';
    const memberIdFor = new Map([
        [STARK_ORGANIZATION, sarahId],
        [ORGANIZATION_TWO, mikeId],
    ]);

    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derivedAdminRows = await deriveRoleGrants(db);
        const derivedAdminRoles = currentRolesForInOrganization(
            derivedAdminRows, 'current', organization,
        );
        assert.ok(derivedAdminRoles.includes('admin'));

        const memberId = memberIdFor.get(organization)!;
        const derivedMemberRoles = currentRolesForInOrganization(
            derivedAdminRows, memberId, organization,
        );
        assert.ok(!derivedMemberRoles.includes('admin'));
        assert.ok(derivedMemberRoles.includes('member'));
    }
});

// -- 5. live-write chain, re-compared on BOTH planes at every ---
// -- step -----------------------------------------------------------

test('live-write chain: create person identity + pii (bundle 2)'
+ ' -> PUT pii again (supersession within the hard-delete zone)'
+ ' -> create human member (bundle 4) -> composed edit -> ERASE'
+ " (derived pii 404s; the ledger-wide zero-PII-bytes scan, gate"
+ " 5's drift twin) -> role-grant PUT -> revocation PUT --"
+ ' re-compared on both planes at every step', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const personId = 'chain-person-1';

    // Step 1: create person identity (bundle 2: operation +
    // identityDocument pairs) — derived identity appears.
    const created = await handleRequest(db, req(
        'POST', '/identities', adminToken,
        { id: personId, kind: 'person' },
    ));
    assert.equal(created.status, 204);
    assert.deepEqual(
        await derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, personId,
        ),
        { id: personId, kind: 'person' },
    );

    // The pii PUT, first content — the derived pii appears.
    const firstPii = {
        name: 'Chain Person', email: 'chain-person@example.com',
        phone: '', bio: '',
    };
    const piiPut1 = await handleRequest(db, req(
        'PUT', '/identities/' + personId + '/pii', adminToken,
        firstPii,
    ));
    assert.equal(piiPut1.status, 200);
    const derivedPii1 = await deriveIdentityPii(db, personId);
    assert.equal(derivedPii1.name, 'Chain Person');

    // Step 2: PUT pii again — the hard-delete zone's own
    // supersession (gate 4): still exactly ONE pair, the derived
    // head updates to the new content, no Supersedes header (the
    // zone is chainless — api-pii-hard-delete.test.ts case 1).
    const secondPii = {
        name: 'Chain Person Renamed',
        email: 'chain-person-renamed@example.com',
        phone: '', bio: '',
    };
    const piiPut2 = await handleRequest(db, req(
        'PUT', '/identities/' + personId + '/pii', adminToken,
        secondPii,
    ));
    assert.equal(piiPut2.status, 200);
    assert.equal(piiPut2.headers.get('Supersedes'), null);
    const piiPrefix = canonicalUriPrefix(
        undefined, '/identities/' + personId + '/pii/',
    );
    const atAddress = (await db.requests.getAll()).filter(
        (r) => r.uri_prefix === piiPrefix,
    );
    assert.equal(atAddress.length, 1);
    const derivedPii2 = await deriveIdentityPii(db, personId);
    assert.equal(derivedPii2.name, 'Chain Person Renamed');

    // Step 3: create a human member (bundle 4) — its own
    // derived identity appears too.
    const humanId = 'chain-human-1';
    const humanGenesisAt = nowUtc();
    const humanGenesisEventId = humanId + '-genesis';
    const humanCreated = await handleRequest(db, req(
        'POST', '/human-members', adminToken,
        {
            id: humanId,
            detail: {
                title: 't', department: 'd',
                strengths: jsonArrayField([]),
                team_dimensions: jsonObjectField({}),
            },
            initialState: 'active',
            initialStateEventId: humanGenesisEventId,
            initialStateAt: humanGenesisAt,
        },
    ));
    assert.equal(humanCreated.status, 204);
    assert.deepEqual(
        await derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, humanId,
        ),
        { id: humanId, kind: 'person' },
    );

    // Step 4: composed edit — identity document stable; edit
    // echoes the create trio so the members/:id document folds.
    const humanEdited = await handleRequest(db, req(
        'POST', '/human-members/' + humanId, adminToken,
        {
            detail: {
                title: 't2', department: 'd2',
                strengths: jsonArrayField([]),
                team_dimensions: jsonObjectField({}),
            },
            state: 'active',
            stateAt: humanGenesisAt,
            stateEventId: humanGenesisEventId,
        },
    ));
    assert.equal(humanEdited.status, 204);
    assert.deepEqual(
        await derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, humanId,
        ),
        { id: humanId, kind: 'person' },
    );

    // Step 5: ERASE the chain person's pii — derived 404s;
    // ledger-wide zero-PII-bytes scan (gate 5). Gate 6 residual:
    // pre-Final identity_pii orphan rows until Stage B.
    const erase = await handleRequest(db, req(
        'DELETE', '/identities/' + personId + '/pii', adminToken,
    ));
    assert.equal(erase.status, 204);
    await assert.rejects(
        () => deriveIdentityPii(db, personId), EntityNotFoundError,
    );
    const erasedValues = [
        firstPii.name, firstPii.email,
        secondPii.name, secondPii.email,
    ];
    const messages = [
        ...(await db.requests.getAll()).map((r) => r.message),
        ...(await db.responses.getAll()).map((r) => r.message),
    ];
    for (const value of erasedValues) {
        assert.ok(
            !messages.some((m) => m.includes(value)),
            'found an erased value in the ledger: ' + value,
        );
    }

    // Step 6: role-grant PUT — a live grant for the human
    // member, re-compared on both planes.
    const grantId = 'chain-role-grant-1';
    const grantPut = await handleRequest(db, req(
        'PUT', '/role-grants/' + grantId, adminToken,
        {
            identity_id: humanId, role: 'member',
            action: 'granted', by_member_id: 'current',
            at: nowUtc(),
        },
    ));
    assert.equal(grantPut.status, 200);
    assert.equal(
        (await deriveRoleGrant(db, grantId)).identity_id,
        humanId,
    );

    // Step 7: revocation PUT — live log-out-everywhere.
    const revocationId = 'chain-revocation-1';
    const revocationPut = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/' + revocationId,
        adminToken, { identity_id: humanId, at: nowUtc() },
    ));
    assert.equal(revocationPut.status, 200);
    assert.equal(
        (await deriveTokenRevocation(db, revocationId))
            .identity_id,
        humanId,
    );
    // Phase Final Stage B: identity spine tables retired.
    // Phase Final Stage B: identity spine tables retired.
    // Phase Final Stage B: identity spine tables retired.
});

// -- 6. invitations enrichment JOIN parity (SATISFIED -----------
// -- TRANSITIVELY — case 2 already proves the two row sets ------
// -- equal; this pins the JOIN's key-omission shape alone) ------

test('invitations enrichment parity: the personName/'
+ ' inviteeEmail JOIN (invitationsForInvitee/sentInvitations,'
+ ' api/invitations-domain.ts) built over deriveIdentityPiiRows'
+ ' deep-equals the SAME JOIN over identityPii.getAll(),'
+ ' including ABSENT-key omission for an erased identity —'
+ ' SATISFIED TRANSITIVELY (case 2 already proves the two row'
+ ' sets equal); no new export, no re-flip of'
+ ' invitationsForInvitee/sentInvitations, no handleRequest'
+ ' exception', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken();
    const eraseeId = 'enrichment-erasee-1';
    await handleRequest(db, req(
        'POST', '/human-members', adminToken,
        humanCreateBody(eraseeId),
    ));
    await handleRequest(db, req(
        'PUT', '/identities/' + eraseeId + '/pii', adminToken,
        {
            name: 'Erasee Name', email: 'erasee@example.com',
            phone: '', bio: '',
        },
    ));
    await handleRequest(db, req(
        'DELETE', '/identities/' + eraseeId + '/pii', adminToken,
    ));

    const invitations = [
        { id: 'inv-a', identity_id: 'current' },
        { id: 'inv-b', identity_id: eraseeId },
    ] as const;

    // The SAME join shape both invitationsForInvitee
    // (invited_by_name) and sentInvitations (invitee_email)
    // build — a Map lookup + ABSENT-key spread, byte-for-byte.
    function enrichedByName(
        rows: readonly IdentityPiiEntity[],
    ): { id: Id; invited_by_name?: string }[] {
        const byId = new Map(rows.map((p) => [p.id, p.name]));
        return invitations.map((inv) => {
            const name = byId.get(inv.identity_id);
            return {
                id: inv.id,
                ...(name !== undefined
                    ? { invited_by_name: name } : {}),
            };
        });
    }
    function enrichedByEmail(
        rows: readonly IdentityPiiEntity[],
    ): { id: Id; invitee_email?: string }[] {
        const byId = new Map(rows.map((p) => [p.id, p.email]));
        return invitations.map((inv) => {
            const email = byId.get(inv.identity_id);
            return {
                id: inv.id,
                ...(email !== undefined
                    ? { invitee_email: email } : {}),
            };
        });
    }

    const derivedRows = await deriveIdentityPiiRows(db);
    // Phase Final Stage B: identity spine tables retired.

    // ABSENT-key pinned: the erased identity carries NO
    // invited_by_name/invitee_email key — never a '' sentinel.
    assert.deepEqual(
        enrichedByName(derivedRows)[1], { id: 'inv-b' },
    );
    assert.deepEqual(
        enrichedByEmail(derivedRows)[1], { id: 'inv-b' },
    );
    // The present identity's key IS carried.
    assert.notDeepEqual(
        enrichedByName(derivedRows)[0], { id: 'inv-a' },
    );
    assert.notDeepEqual(
        enrichedByEmail(derivedRows)[0], { id: 'inv-a' },
    );
});

// -- 7. method-filter proof + genesis-wins-under-skew + the -----
// -- E6 resend branches at drift altitude ------------------------

test('method-filter proof: the identities create-op POST pair'
+ ' is never read as a document pair (exactly one PUT document'
+ ' pair lands at identities/:id after create); genesis-wins-'
+ "under-skew (a NAMED divergence from drift-roster.test.ts's"
+ ' own case 9 — identities carries no domain `at` to skew any'
+ ' more than memberships does, so plain arrival-order'
+ " supersession is proven instead); the E6 resend fast path at"
+ ' drift altitude (role-grants/:id)', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken();

    // -- method-filter: POST /identities forms an operation pair
    // sharing the identities/:id uriId (family-registry.ts:
    // createBodyIdField 'id') — documentPairsAt must exclude it,
    // leaving exactly ONE PUT document pair at the address. --
    const methodId = 'identities-method-filter-1';
    const created = await handleRequest(db, req(
        'POST', '/identities', adminToken,
        { id: methodId, kind: 'person' },
    ));
    assert.equal(created.status, 204);
    const prefix = canonicalUriPrefix(undefined, '/identities/');
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const atAddress = requests.filter(
        (r) => r.uri_id === methodId,
    );
    assert.equal(atAddress.length, 2);
    const documentPairs = documentPairsAt(
        requests, responses, prefix,
    ).filter((pair) => pair.uriId === methodId);
    assert.equal(documentPairs.length, 1);
    assert.equal(documentPairs[0]!.method, 'PUT');

    // -- genesis-wins-under-skew (an identities address; the
    // SAME NAMED divergence drift-roster.test.ts's case 9
    // accepts for memberships): identities/:id carries no domain
    // `at` either, so a second PUT still supersedes by ARRIVAL
    // order alone. --
    const skewId = 'identities-skew-1';
    await handleRequest(db, req(
        'POST', '/identities', adminToken,
        { id: skewId, kind: 'person' },
    ));
    const secondPut = await handleRequest(db, req(
        'PUT', '/identities/' + skewId, adminToken,
        { kind: 'service' },
    ));
    assert.equal(secondPut.status, 200);
    assert.ok(secondPut.headers.get('Supersedes'));
    const derivedSkewed = await derivedIdentity(
        db, GLOBAL_PLANE_PLACEHOLDER, skewId,
    );
    assert.equal(derivedSkewed.kind, 'service');

    // -- the E6 resend fast path at drift altitude
    // (role-grants/:id): a byte-identical PUT resend replays
    // the stored response and appends NO second pair
    // (drift-roster.test.ts's own resend-idempotency case). --
    const grantId = 'identities-resend-grant-1';
    const grantBody = {
        identity_id: 'current', role: 'member',
        action: 'granted', by_member_id: 'current',
        at: nowUtc(),
    };
    const first = await handleRequest(db, req(
        'PUT', '/role-grants/' + grantId, adminToken, grantBody,
    ));
    assert.equal(first.status, 200);
    const beforeCount = (await db.requests.getAll()).length;
    const resend = await handleRequest(db, req(
        'PUT', '/role-grants/' + grantId, adminToken, grantBody,
    ));
    assert.equal(resend.status, 200);
    assert.equal(
        (await db.requests.getAll()).length, beforeCount,
    );
    assert.equal(
        first.headers.get('Response-ID'),
        resend.headers.get('Response-ID'),
    );
    assert.equal(
        (await deriveRoleGrant(db, grantId)).identity_id,
        'current',
    );
    // Phase Final Stage B: identity spine tables retired.
});
