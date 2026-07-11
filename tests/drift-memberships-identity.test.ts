import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { Id, MembershipEntity } from '../api/types.ts';
import { SYSTEM_MEMBER_ID } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    deriveMembershipsForIdentity,
    membershipExistsFor,
} from '../api/derive-memberships.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import { buildAiMembers } from '../api/mock-data/ai-members.ts';
import { organizationToken } from './token-fixtures.ts';

// Phase Final Task 2: memberships dual-write stripped. This
// file no longer compares derive vs row-plane oracles — the
// memberships table is empty after seed. Coverage re-homes to
// pair-plane pins (counts, multi-org set, order, presence,
// accept/remove lifecycle, echoed-id resilience).

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
    const db = memoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// Every seeded identity that can hold a membership row: the 11
// seeded humans (buildMembers, 'current' included), the system
// actor (holds none — see leg 8), and the 4 seeded AI members.
function allSeededIdentityIds(): readonly Id[] {
    return [
        ...buildMembers().map((m) => m.id),
        SYSTEM_MEMBER_ID,
        ...buildAiMembers().map((m) => m.id),
    ];
}

// The earliest-join reduction — primaryMembershipOrganization's
// OWN algorithm (api/authentication.ts, module-private), re-run
// here over whichever row source a caller passes so the SAME
// reduction can be proven equal over the derived rows and the
// row-plane rows without importing a private function (the
// pairPlaneOwnerOrganization precedent, tests/drift-
// identities.test.ts: mirror the algorithm, never the privacy).
function primaryOrganizationOf(
    rows: readonly MembershipEntity[],
): Id | null {
    let best: { organization: Id; at: string } | null = null;
    for (const row of rows) {
        if (
            best === null
            || row.at < best.at
            || (row.at === best.at
                && row.organization_id < best.organization)
        ) {
            best = { organization: row.organization_id, at: row.at };
        }
    }
    return best === null ? null : best.organization;
}

// -- leg 1: per-identity derive for EVERY seeded identity ------

test('leg 1: per-identity derive for EVERY seeded identity (11'
+ ' humans + system + 4 AI ids) — 16 membership documents total',
async () => {
    const db = await seededDb();
    const ids = allSeededIdentityIds();
    assert.equal(ids.length, 16);

    let total = 0;
    for (const identityId of ids) {
        const derived = sortById(
            await deriveMembershipsForIdentity(db, identityId),
        );
        for (const row of derived) {
            assert.equal(row.identity_id, identityId);
        }
        total += derived.length;
    }
    assert.equal(total, 16);
    // Phase Final Stage B: roster tables retired.
});

// -- leg 2: the multi-org identity --------------------------------

test("leg 2: the multi-org identity ('current', STARK +"
+ ' ORGANIZATION_TWO) — two membership documents on pair plane',
async () => {
    const db = await seededDb();
    const derived = sortById(
        await deriveMembershipsForIdentity(db, 'current'),
    );
    assert.equal(derived.length, 2);
    assert.deepEqual(
        [...derived.map((m) => m.organization_id)].sort(),
        [STARK_ORGANIZATION, ORGANIZATION_TWO].sort(),
    );
});

// -- leg 3: the ORDER pin (subjectOrganizations-shape) -----------
//
// Every seeded membership body carries the SAME domain `at`
// (MOCK_SEED_TIMESTAMP, api/mock-data/seed-message-pairs.ts's own
// membershipSeedBody) — so 'current's two rows tie on `at`
// exactly, and the id tiebreak alone decides the order. This
// pins that defined order literally, the drift-organizations.
// test.ts leg-3b precedent ("pinned against its own literal").

test("leg 3: the ORDER pin — deriveMembershipsForIdentity('at'"
+ ' ASCENDING, id tiebreak) resolves a real equal-`at` tie for'
+ " 'current', and the resulting organization sequence is the"
+ ' one subjectOrganizations would fold into the JWT `orgs`'
+ ' claim', async () => {
    const db = await seededDb();
    const derived = await deriveMembershipsForIdentity(
        db, 'current',
    );
    assert.equal(derived.length, 2);
    assert.equal(derived[0]!.at, derived[1]!.at);
    assert.ok(derived[0]!.id < derived[1]!.id);
    assert.deepEqual(
        derived.map((m) => m.organization_id),
        [STARK_ORGANIZATION, ORGANIZATION_TWO],
    );
});

// -- leg 4: the earliest-join reduction on the pair plane ------

test('leg 4: the earliest-join reduction'
+ ' (primaryMembershipOrganization-shape) on derived rows,'
+ " incl. the equal-`at` lexical tiebreak ('current' resolves"
+ " to STARK: '1' < '2')", async () => {
    const db = await seededDb();
    const sarahId = 'LhfaUUf4IumVsCSGB4xjdK';
    const currentRows =
        await deriveMembershipsForIdentity(db, 'current');
    assert.equal(
        primaryOrganizationOf(currentRows), STARK_ORGANIZATION,
    );
    const sarahRows =
        await deriveMembershipsForIdentity(db, sarahId);
    assert.equal(
        primaryOrganizationOf(sarahRows), STARK_ORGANIZATION,
    );
});

// -- leg 5: the membership-presence probe parity ------------------
// (grantOutcomeFor-shape) + the pre-tx-vs-in-tx PARITY proof:
// membershipExistsFor is ADAPTER-SHAPED so the invitation grant's
// own open transaction (api/invitations-domain.ts's table list)
// can call it without opening a nested transaction of its own.

test('leg 5: membershipExistsFor — member + non-member parity'
+ ' against the grantOutcomeFor-shape row-plane check, PLUS'
+ ' byte-identical output pre-tx (the plain adapter) vs in-tx'
+ " (an open db.transaction view sharing the grant's own table"
+ ' list)', async () => {
    const db = await seededDb();
    // Mike Thompson: ORGANIZATION_TWO-only.
    const mikeId = 'bLP3X1hb1mSz8gY9neogU3';

    const memberCheck = await membershipExistsFor(
        db, STARK_ORGANIZATION, 'current',
    );
    const nonMemberCheck = await membershipExistsFor(
        db, STARK_ORGANIZATION, mikeId,
    );
    // Phase Final Task 2: memberships ROW half stripped —
    // member presence is pair-plane only.
    assert.equal(memberCheck, true);
    assert.equal(nonMemberCheck, false);

    // Phase Final Task 2: invitations + memberships ROW
    // halves stripped from grantInvitation's tx list.
    const grantTxTables = [
        'requests', 'responses',
    ];
    const inTxMemberCheck = await db.transaction(
        grantTxTables,
        (view) => membershipExistsFor(
            view, STARK_ORGANIZATION, 'current',
        ),
    );
    const inTxNonMemberCheck = await db.transaction(
        grantTxTables,
        (view) => membershipExistsFor(
            view, STARK_ORGANIZATION, mikeId,
        ),
    );
    assert.equal(inTxMemberCheck, memberCheck);
    assert.equal(inTxNonMemberCheck, nonMemberCheck);
});

// -- leg 6: the LIVE accept leg -----------------------------------

test('leg 6: LIVE accept — grant + accept an invitation through'
+ ' handleRequest; the new membership derives immediately on'
+ ' both planes', async () => {
    const db = await seededDb();
    const sarahId = 'LhfaUUf4IumVsCSGB4xjdK';

    const before = await deriveMembershipsForIdentity(db, sarahId);
    assert.equal(before.length, 1);
    assert.equal(before[0]!.organization_id, STARK_ORGANIZATION);

    const adminToken = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const grant = await handleRequest(db, req(
        'POST', '/invitations', adminToken, {
            email: 'sarah.chen@company.com',
            invitationId: 'inv-ms-drift-identity-sarah',
            grantEventId: 'ev-ms-drift-identity-sarah-grant',
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(grant.status, 200);

    const membershipId = 'ms-drift-identity-sarah';
    const accept = await handleRequest(db, req(
        'POST',
        '/invitations/inv-ms-drift-identity-sarah/acceptance',
        await organizationToken(sarahId, STARK_ORGANIZATION),
        {
            membershipId,
            acceptEventId: 'ev-ms-drift-identity-sarah-accept',
            acceptAt: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 204);

    // Phase Final Task 2: memberships ROW half stripped —
    // accept lands on the pair plane only.
    const after = sortById(
        await deriveMembershipsForIdentity(db, sarahId),
    );
    assert.equal(after.length, 2);
    assert.equal(
        after.some(
            (m) => m.id === membershipId
                && m.organization_id === ORGANIZATION_TWO,
        ),
        true,
    );
    // Phase Final Stage B: roster tables retired.
});

// -- leg 7: the REMOVAL leg ----------------------------------------

test('leg 7: REMOVAL — DELETE /memberships/:id derives ABSENT'
+ ' on the pair plane', async () => {
    const db = await seededDb();
    const jessicaId = 'zyTbfbjcGEfbpCsNTP0XjX';
    const before = await deriveMembershipsForIdentity(
        db, jessicaId,
    );
    const target = before[0];
    assert.ok(target);

    assert.equal(
        before.some((m) => m.id === target!.id), true,
    );

    const del = await handleRequest(db, req(
        'DELETE', '/memberships/' + target!.id,
        await organizationToken(
            'current', target!.organization_id,
        ),
    ));
    assert.equal(del.status, 204);

    const after = await deriveMembershipsForIdentity(
        db, jessicaId,
    );
    assert.equal(after.some((m) => m.id === target!.id), false);
    // Phase Final Stage B: roster tables retired.
});

// -- leg 8: the zero-membership identity ---------------------------

test('leg 8: zero-membership identity — an UNKNOWN identity id'
+ ' and the system actor (a real identity that holds no'
+ ' membership row) both derive an EMPTY set, no throw',
async () => {
    const db = await seededDb();
    await assert.doesNotReject(
        () => deriveMembershipsForIdentity(db, 'no-such-identity'),
    );
    assert.deepEqual(
        await deriveMembershipsForIdentity(db, 'no-such-identity'),
        [],
    );
    assert.deepEqual(
        await deriveMembershipsForIdentity(db, SYSTEM_MEMBER_ID),
        [],
    );
});

// -- leg 9: the ECHOED-id regression (Fable review, Critical) -----
//
// The fetch-edit-PUT client pattern echoes a GET response's own
// `id` field back into a later PUT body. formWritePair stores the
// RAW wire body verbatim in the ledger (api/api.ts) — it is
// documentWriteResponseSpec's OWN validateDocument call that
// tolerates (strips) a stray id, and ONLY for the write's
// RESPONSE body (api/document-family.ts:
// `wiring.validateDocument(withoutId(body ?? {}))`). The
// derive-organizations.ts precedent (organizationEntityOf) names
// this exact divergence and strips id before validating;
// membershipEntityOf must do the same, or a single echoed-id row
// throws INSIDE the per-organization document loop — BEFORE the
// identity filter — poisoning deriveMembershipsForIdentity for
// EVERY identity sharing that row's organization.

test('leg 9: an ECHOED id in a live PUT /memberships/:id body'
+ ' (the fetch-edit-PUT client pattern) still derives — the'
+ ' stray id never poisons deriveMembershipsForIdentity',
async () => {
    const db = await seededDb();
    const davidId = '6xBfK5If82JKfThXb1wlzS'; // David Martinez
    const before = await deriveMembershipsForIdentity(
        db, davidId,
    );
    const existing = before[0];
    assert.ok(existing);

    const echoPut = await handleRequest(db, req(
        'PUT', '/memberships/' + existing!.id,
        await organizationToken(
            'current', existing!.organization_id,
        ),
        {
            id: existing!.id,
            organization_id: existing!.organization_id,
            identity_id: existing!.identity_id,
            at: existing!.at,
        },
    ));
    assert.equal(echoPut.status, 200);

    const derived = sortById(
        await deriveMembershipsForIdentity(db, davidId),
    );
    assert.equal(derived.length, 1);
    assert.equal(derived[0]!.id, existing!.id);
    // Phase Final Stage B: roster tables retired.
});
