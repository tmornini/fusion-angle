import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    IdentityCredentialEntity,
} from '../shared/types.ts';
import { nowUtc } from
    '../shared/types.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    validateIdentityDocumentBody,
} from '../api/validators.ts';
import {
    postIdentityDocumentOp,
} from '../api/routes.ts';
import {
    membershipOf,
    membershipOfHead,
    organizationMembershipHeads,
} from '../api/memberships.ts';
import {
    deriveIdentityPiiRows,
    deriveIdentityPii,
    deriveCredentialsFor,
    deriveCredential,
} from '../api/derive-identity-spine.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import {
    buildUnaffiliatedIdentity,
} from '../api/mock-data/members.ts';
import { organizationToken } from './token-fixtures.ts';
import { landMembership } from './membership-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    seedIdentityCredential,
    seedIdentityPii,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import { identityByEmail } from '../api/authentication.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    assertPartsAreHeads,
    messageOfResponse,
    partsOf,
} from './http-fixtures.ts';
import { bodyOf } from '../api/derive-documents.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';

// Phase Final Task 2: identity spine dual-write stripped.
// This file no longer compares derive vs old-table oracles —
// the row plane is empty after seed. Coverage re-homes to
// wire-byte handleRequest assertions and message-plane live
// fixtures (drift-roster / drift-identity-tokens craftsmanship).
//
// Hand-builds an IDENTITIES_TEST_WIRING mirror (the drift-roster
// idiom: routes.ts's own IDENTITIES_WIRING is module-private) so
// the identities cases below exercise the ACTUAL
// documentCollectionGetHandler/documentGetHandler — the SAME code
// path Task 8 wires live for GET /identities, never a
// reimplementation. Old-plane reads via
// the BASE adapter (identities, identity_pii, identity_credentials,
// role_grants, identity_providers, identity_token_revocations are
// ALL global-plane or parent-derived, never org-scoped-by-column)
// and organizationScopedAdapter (the org-fence view identity_pii/
// role_grants each need) — NEVER through handleRequest for a
// comparison read, so the comparison survives the flip. Every
// LIVE write below rides handleRequest, exactly like drift-
// roster.test.ts.
//
// H7 (case 9): explicit id-lex sort — load-bearing, because
// the backend's row order is not a contract and no caller
// may inherit it. sortById binds EVERY collection
// assertion below; every derived collection
// (api/derive-identity-spine.ts, api/document-family.ts's
// generic handlers alike) sorts byIdAscending by
// construction. A case that skipped the sort would pass
// or fail by ACCIDENT of insertion order, never by the
// property it claims to prove.
//
// THE DELETED-FILTER DIVERGENCE (case 8, NOT drift-tested):
// identities and identity_pii were EntityStore-backed; the
// states/:id escape hatch that once hid a row on the OLD
// plane (a hand-crafted 'deleted' event) is RETIRED with the
// document. Lifecycle for members rides PUT members/:id; no
// shipped route posts a 'deleted' state for an identities/
// identity_pii id, so derived-plane parity holds throughout
// every case below regardless.

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// A served credential is its stored body less its secret
// (credentialReader): every other stored key, by value. The
// stored body holds a secret, so the projection is not vacuous.
async function assertServedWithoutSecret(
    db: DbAdapter,
    message: HttpMessage,
): Promise<void> {
    const head = await db.messagePairs.getById(
        message.query('header.etag').toText().slice(1, -1),
    );
    const stored = bodyOf(head.response);
    assert('secret' in stored, 'the stored body holds a secret');
    assertEquals(
        message.body().toValue(),
        Object.fromEntries(Object.entries(stored)
            .filter(([key]) => key !== 'secret')),
    );
}

// -- test-side wiring mirrors (routes.ts's private rows, by ----
// -- content) ------------------------------------------------------

const IDENTITIES_TEST_WIRING: DocumentFamilyWiring = {
    family: 'identities',
    httpNest: 'global',
    lifecycle: 'stateless',
    notFoundTable: 'identities',
    validateDocument: validateIdentityDocumentBody,
    documentOp: postIdentityDocumentOp,
    entityOf: (document, _organization) => ({
        id: document.name,
        ...document.body,
    }),
};

// identities is GLOBAL plane (family-registry.ts:
// organizationNested:false) — canonicalPath ignores whatever
// organization value a caller passes for this family, so this
// fixed placeholder is never load-bearing; requireOrganization
// (document-family.ts) merely demands a defined value to dispatch
// through — the drift-roster.test.ts GLOBAL_PLANE_PLACEHOLDER
// precedent.
const READER_ACTOR: Id = generateIdentifier();
const GLOBAL_PLANE_PLACEHOLDER: Id = STARK_ORGANIZATION;

async function derivedIdentities(
    db: DbAdapter, organization: Id,
): Promise<{ id: Id; kind: string }[]> {
    return documentCollectionGetHandler(IDENTITIES_TEST_WIRING)(
        db, [], READER_ACTOR, organization, [],
    ) as Promise<{ id: Id; kind: string }[]>;
}

async function derivedIdentity(
    db: DbAdapter, organization: Id, id: Id,
): Promise<{ id: Id; kind: string }> {
    return documentGetHandler(IDENTITIES_TEST_WIRING)(
        db, [id], READER_ACTOR, organization, [],
    ) as Promise<{ id: Id; kind: string }>;
}



// -- 1. identities collection parity + getById + 404 bytes ------

Deno.test('identities wire is the accepted roster;'
+ ' derive stays global; an absent id is forbidden',
async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.

    const derived = await derivedIdentities(
        db, GLOBAL_PLANE_PLACEHOLDER,
    );
    assertStrictEquals(derived.length, 13);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const res = await handleRequest(
        db, req('GET', '/identities/', token),
    );
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<{ id: Id; kind: string }>(res);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    const heads = await organizationMembershipHeads(
        db, STARK_ORGANIZATION, {
            kind: 'state', state: 'accepted',
        },
    );
    const seated = new Set(heads.map(
        (head) => membershipOfHead(head).identity_id,
    ));
    assertEquals(
        sortById(parts.map((part) => part.body().toValue())),
        sortById(derived.filter((row) => seated.has(row.id))),
    );

    for (const identity of derived) {
        const one = await derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, identity.id,
        );
        assertEquals(one, identity);
        const path = '/identities/' + identity.id;
        const leaf = await handleRequest(
            db, req('GET', path, token),
        );
        if (seated.has(identity.id)) {
            assertStrictEquals(leaf.status, 200);
            assertEquals(await leaf.json(), one);
        } else {
            assertStrictEquals(leaf.status, 403);
            assertEquals(await leaf.json(), {
                error: outside('GET', path),
            });
        }
    }

    const missingId = generateIdentifier();
    const expectedMessage = 'Not found: identities/' + missingId;
    const err = await assertRejects(
        () => derivedIdentity(
            db, GLOBAL_PLANE_PLACEHOLDER, missingId,
        ),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);
    const absentPath = '/identities/' + missingId;
    const absent = await handleRequest(
        db, req('GET', absentPath, token),
    );
    assertStrictEquals(absent.status, 403);
    assertEquals(await absent.json(), {
        error: outside('GET', absentPath),
    });
});

// -- 2. identity-pii derive/fence parity + the THREE-WAY ------
// -- viaMembership fence legs + leaf parity + 404 bytes ---------
// -- Flat GET /identity-pii is retired (router 404). ------------

Deno.test('identity-pii derive lists every slot; the route'
+ ' serves a co-member and refuses an outsider', async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.

    // -- unfenced collection (every live slot) --
    const derivedRows = sortById(await deriveIdentityPiiRows(db));
    assertStrictEquals(derivedRows.length, 12);
    const unaffiliated = buildUnaffiliatedIdentity();

    // -- per-identity leaf + 404 --
    for (const row of derivedRows) {
        const derived = await deriveIdentityPii(db, row.id);
        assertEquals(derived, row);
    }
    const missingId = generateIdentifier();
    const expectedMessage = 'Not found: identity_pii/' + missingId;
    const err = await assertRejects(
        () => deriveIdentityPii(db, missingId),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);

    const adminToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const twoToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const self = await handleRequest(db, req(
        'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/pii',
        adminToken,
    ));
    assertStrictEquals(self.status, 200);
    const selfBody = await self.json() as { name: string };
    assert(typeof selfBody.name === 'string');

    async function refusePii(
        id: string, token: string,
    ): Promise<void> {
        const path = '/identities/' + id + '/pii';
        const hidden = await handleRequest(
            db, req('GET', path, token),
        );
        assertStrictEquals(hidden.status, 403);
        assertEquals(await hidden.json(), {
            error: outside('GET', path),
        });
    }

    for (const token of [adminToken, twoToken]) {
        await refusePii(unaffiliated.id, token);
    }

    const foreignId = generateIdentifier();
    const foreignCreated = await handleRequest(db, req(
        'POST', '/identities/', adminToken,
        { id: foreignId, kind: 'person' },
    ));
    assertStrictEquals(foreignCreated.status, 201);
    await foreignCreated.body?.cancel();
    await seedIdentityPii(db, foreignId, {
        name: 'Foreign Fence', email: 'foreign-fence@x.com',
        phone: '', bio: '',
    });
    await seedSeat(
        db, ORGANIZATION_TWO, foreignId, 'member', nowUtc(),
    );
    await refusePii(foreignId, adminToken);
    const visible = await handleRequest(db, req(
        'GET', '/identities/' + foreignId + '/pii', twoToken,
    ));
    assertStrictEquals(visible.status, 200);
    const visibleBody = await visible.json() as { name: string };
    assertStrictEquals(visibleBody.name, 'Foreign Fence');

    const orphanId = generateIdentifier();
    const orphanCreated = await handleRequest(db, req(
        'POST', '/identities/', adminToken,
        { id: orphanId, kind: 'person' },
    ));
    assertStrictEquals(orphanCreated.status, 201);
    await orphanCreated.body?.cancel();
    await seedIdentityPii(db, orphanId, {
        name: 'Orphan Fence', email: 'orphan-fence@x.com',
        phone: '', bio: '',
    });
    await refusePii(orphanId, adminToken);
    await refusePii(orphanId, twoToken);
});

// The route fence, not the local seat scan. A non-accepted
// head in the caller's organization leaves the seat, and an
// accepted membership elsewhere is the only one that counts.
const FENCE_SUBJECT = 'XXZruirZyAOoRpNxaDnpSA';
const SEAT_AT = '2026-06-04T00:00:00.000000Z';
const REPLACED_AT = '2026-06-05T00:00:00.000000Z';
const ELSEWHERE_AT = '2026-06-06T00:00:00.000000Z';

async function callerPiiAfterNonAccepted(
    state: 'pending' | 'declined' | 'revoked' | 'removed',
): Promise<{ response: Response; identityId: Id }> {
    const db = await seededDb();
    const identityId = generateIdentifier();
    const token = await organizationToken(
        FENCE_SUBJECT, STARK_ORGANIZATION,
    );
    const created = await handleRequest(db, req(
        'POST', '/identities/', token,
        { id: identityId, kind: 'person' },
    ));
    await created.body?.cancel();
    assertStrictEquals(created.status, 201);
    await seedIdentityPii(db, identityId, {
        name: 'Fenced ' + state,
        email: state + '-fence@x.com',
        phone: '',
        bio: '',
    });
    await seedSeat(
        db, STARK_ORGANIZATION, identityId, 'member',
        SEAT_AT,
    );
    await landMembership(
        db, STARK_ORGANIZATION, identityId, state,
        'member', REPLACED_AT,
    );
    await landMembership(
        db, ORGANIZATION_TWO, identityId, 'accepted',
        'member', ELSEWHERE_AT,
    );
    assertStrictEquals(
        await membershipOf(
            db, STARK_ORGANIZATION, identityId,
        ),
        null,
    );
    const elsewhere = await membershipOf(
        db, ORGANIZATION_TWO, identityId,
    );
    assert(elsewhere !== null);
    assertStrictEquals(elsewhere.identity_id, identityId);
    assertStrictEquals(
        elsewhere.organization_id, ORGANIZATION_TWO,
    );
    const response = await handleRequest(db, req(
        'GET', '/identities/' + identityId + '/pii', token,
    ));
    return { response, identityId };
}

for (const state of [
    'removed', 'pending', 'declined', 'revoked',
] as const) {
    Deno.test('a ' + state + ' membership in the caller'
        + ' organization is not a co-member', async () => {
        const { response, identityId } =
            await callerPiiAfterNonAccepted(state);
        assertStrictEquals(response.status, 403);
        assertEquals(await response.json(), {
            error: outside(
                'GET', '/identities/' + identityId + '/pii',
            ),
        });
    });
}

Deno.test('a membership with no seat counts as foreign',
async () => {
    const db = await seededDb();
    const identityId = generateIdentifier();
    const caller = await organizationToken(
        FENCE_SUBJECT, STARK_ORGANIZATION,
    );
    const home = await organizationToken(
        FENCE_SUBJECT, ORGANIZATION_TWO,
    );
    const created = await handleRequest(db, req(
        'POST', '/identities/', caller,
        { id: identityId, kind: 'person' },
    ));
    await created.body?.cancel();
    assertStrictEquals(created.status, 201);
    await seedIdentityPii(db, identityId, {
        name: 'Seatless Fence',
        email: 'seatless-fence@x.com',
        phone: '',
        bio: '',
    });
    await landMembership(
        db, ORGANIZATION_TWO, identityId, 'accepted',
        'member', ELSEWHERE_AT,
    );
    const hidden = await handleRequest(db, req(
        'GET', '/identities/' + identityId + '/pii', caller,
    ));
    assertStrictEquals(hidden.status, 403);
    assertEquals(await hidden.json(), {
        error: outside(
            'GET', '/identities/' + identityId + '/pii',
        ),
    });
    const visible = await handleRequest(db, req(
        'GET', '/identities/' + identityId + '/pii', home,
    ));
    assertStrictEquals(visible.status, 200);
    const body = await visible.json() as { name: string };
    assertStrictEquals(body.name, 'Seatless Fence');
});

// -- 2b. the by-email login-shape leg (Phase 13 Task 8, concern -
// -- 2): authorizePassword's identity lookup now feeds -----------
// -- identityByEmail from deriveIdentityPiiRows rather than the --
// -- row-plane identityPii.getAllWhere on email scan — this -
// -- proves the reducer resolves the SAME identity id from BOTH --
// -- planes, for every seeded email AND an unknown one (both -----
// -- null, the no-enumeration shape) -------------------------------

Deno.test('by-email login-shape: identityByEmail resolves every'
+ ' seeded email on the message plane + unknown is null',
async () => {
    const db = await seededDb();
    const derivedRows = await deriveIdentityPiiRows(db);
    assertStrictEquals(derivedRows.length, 12);
    // Phase Final Stage B: identity spine tables retired.
    for (const row of derivedRows) {
        assertStrictEquals(
            identityByEmail(derivedRows, row.email), row.id,
        );
    }
    assertStrictEquals(
        identityByEmail(derivedRows, 'nobody@example.com'),
        null,
    );
});

// -- 3. credentials parity per identity + per cid + the ---------
// -- served collection lacks only the secret + 404 bytes ---------

Deno.test('credentials per identity + per cid (12 seeded) + the'
+ ' served collection lacks only the secret + 404 bytes',
async () => {
    const db = await seededDb();
    // Phase Final Stage B: identity spine tables retired.

    // Collect identity ids from message plane via parents + current
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
            assertEquals(one, row);
        }
        const starkSeat = await membershipOf(
            db, STARK_ORGANIZATION, identity.id,
        );
        const twoSeat = starkSeat === null
            ? await membershipOf(
                db, ORGANIZATION_TWO, identity.id,
            )
            : null;
        const organization = starkSeat !== null
            ? STARK_ORGANIZATION
            : twoSeat !== null
                ? ORGANIZATION_TWO
                : null;
        const path = '/identities/' + identity.id
            + '/credentials/';
        const served = await handleRequest(db, req(
            'GET', path,
            await organizationToken(
                'XXZruirZyAOoRpNxaDnpSA',
                organization ?? STARK_ORGANIZATION,
            ),
        ));
        if (organization === null) {
            assertStrictEquals(served.status, 403);
            assertEquals(await served.json(), {
                error: outside('GET', path),
            });
            continue;
        }
        const parts = await partsOf<Record<string, unknown>>(
            served,
        );
        assertEquals(
            parts.map((part) => part.body().toValue()['id']).sort(),
            derived.map((row) => row.id).sort(),
        );
        for (const part of parts) {
            await assertServedWithoutSecret(db, part);
        }
    }
    assertStrictEquals(allDerived.length, 12);

    const someIdentityId = allDerived[0]!.identity_id;
    const missingCid = generateIdentifier();
    const expectedMessage =
        'Not found: identity_credentials/' + missingCid;
    const err = await assertRejects(
        () => deriveCredential(db, someIdentityId, missingCid),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);
});

// -- 3b. A mismatched below-facade write — document under --------
// -- identity A, body.identity_id names B — is A's document. -----
// -- Stark, where A is accepted, serves the leaf and omits the ---
// -- credential from the collection. The other organization ------
// -- refuses the path. Derive still filters on the body's id. ----

Deno.test('a mismatched credential is the path identity'
+ ' document: Stark serves it, the other org refuses it',
async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const identityA = generateIdentifier();
    const identityB = generateIdentifier();
    for (const id of [identityA, identityB]) {
        const created = await handleRequest(db, req(
            'POST', '/identities/', adminToken,
            { id, kind: 'person' },
        ));
        assertStrictEquals(created.status, 201);
        await created.body?.cancel();
    }
    // Different org memberships (the adjudicated scenario): A in
    // STARK, B in ORGANIZATION_TWO only — so the fence's answer
    // depends entirely on WHICH identity it keys on.
    await seedSeat(
        db, STARK_ORGANIZATION, identityA, 'member', nowUtc(),
    );
    await seedSeat(
        db, ORGANIZATION_TWO, identityB, 'member', nowUtc(),
    );

    // The mismatched write itself — document under A, body names
    // B — producible only below-facade (no validator ties the
    // path to the body; no live write path can construct this).
    const cid = generateIdentifier();
    await seedIdentityCredential(db, identityA, cid, {
        identity_id: identityB, kind: 'password',
        status: 'set', secret: 'mismatch-secret', at: nowUtc(),
    });

    const leafPath = '/identities/' + identityA
        + '/credentials/' + cid;
    const collectionPath = '/identities/' + identityA
        + '/credentials/';
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const credential = await deriveCredential(
            db, identityA, cid,
        );
        assertStrictEquals(credential.identity_id, identityB);
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const leaf = await handleRequest(db, req(
            'GET', leafPath, token,
        ));
        if (organization === STARK_ORGANIZATION) {
            assertStrictEquals(leaf.status, 200);
            const served = await messageOfResponse(leaf);
            await assertServedWithoutSecret(db, served);
            const value = served.body().toValue() as {
                identity_id: string;
            };
            assertStrictEquals(value.identity_id, identityB);
            const collection = await handleRequest(db, req(
                'GET', collectionPath, token,
            ));
            assertStrictEquals(collection.status, 204);
            assertEquals(
                await partsOf<{ id: string }>(collection),
                [],
            );
        } else {
            assertStrictEquals(leaf.status, 403);
            assertEquals(await leaf.json(), {
                error: outside('GET', leafPath),
            });
        }
        const derivedCollection = (
            await deriveCredentialsFor(db, identityA)
        ).filter((row) => row.identity_id === identityA);
        assertEquals(derivedCollection, []);
    }
    // Phase Final Stage B: identity spine tables retired.
});

// -- 4. role-grants parity (both org fence legs) + getById + ----
// -- 404 bytes, a LIVE-CREATED grant (gate 16); providers + ------
// -- revocations parity (empty + live-write); a same-document -----
// -- double-PUT proving derived (response.at, id) == row-plane --
// -- last-call-wins ------------------------------------------------

// -- 4b. the hot-path FILTERED shape: currentRolesForInOrganization
// -- over derived vs row-plane role-grant rows, for a seeded -----
// -- admin and a seeded member, per organization — case 4's own --
// -- collection parity proves the UNFILTERED row sets equal; it --
// -- does NOT exercise the per-identity, per-org FILTER the two --
// -- flipped readers (callerRolesInOrganization,
// -- callerIsOrganizationAdmin) actually apply --------------------

// -- 5. live-write chain, re-compared on BOTH planes at every ---
// -- step -----------------------------------------------------------

// -- 7. method-filter proof + genesis-wins-under-skew + the -----
// -- E6 resend branches at drift altitude ------------------------


// Spec 2026-09-15 § 3: the rows fold lists identities, then
// reads one document each. A PII document with no
// identities/:id document is unreachable by construction —
// PII rides its identity.
Deno.test('deriveIdentityPiiRows lists a slot only through its'
+ ' identity document', async () => {
    const db = await seededDb();
    const orphanSlot = generateIdentifier();
    const person = generateIdentifier();
    await seedIdentityPii(db, orphanSlot, {
        name: 'Orphan Slot', email: 'orphan@example.net',
        phone: '', bio: '',
    });
    await seedPersonIdentity(db, person, {
        name: 'Whole Person', email: 'whole@example.net',
        phone: '', bio: '',
    });
    const ids = new Set(
        (await deriveIdentityPiiRows(db)).map((row) => row.id),
    );
    assertStrictEquals(ids.has(person), true);
    assertStrictEquals(ids.has(orphanSlot), false);
});
