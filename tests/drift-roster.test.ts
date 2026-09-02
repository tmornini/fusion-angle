import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    MembershipEntity,
} from '../api/types.ts';
import { nowUtc } from
    '../api/types.ts';
import { canonicalUriCollection } from '../api/message-pair.ts';
import { documentMessagePairsAt } from '../api/derive-documents.ts';
import {
    deriveOrganizationMemberSeat,
    deriveOrganizationMemberSeats,
} from '../api/derive-memberships.ts';
import { deriveInvitations } from '../api/derive-invitations.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_ROSTER_SARAH = generateIdentifier();
const EV_ROSTER_SARAH_GRANT = generateIdentifier();
const INV_ROSTER_JESSICA = generateIdentifier();
const EV_ROSTER_JESSICA_GRANT = generateIdentifier();
const MS_ROSTER_JESSICA = generateIdentifier();
const EV_ROSTER_JESSICA_ACCEPT = generateIdentifier();
const INV_ROSTER_EMILY = generateIdentifier();
const EV_ROSTER_EMILY_GRANT = generateIdentifier();
const EV_ROSTER_EMILY_DECLINE = generateIdentifier();
const INV_ROSTER_MARCUS = generateIdentifier();
const EV_ROSTER_MARCUS_GRANT = generateIdentifier();
const EV_ROSTER_MARCUS_REVOKE = generateIdentifier();
const INV_ROSTER_SARAH_DUP = generateIdentifier();
const EV_ROSTER_SARAH_DUP_GRANT = generateIdentifier();
const MS_ROSTER_JESSICA_2 = generateIdentifier();
const EV_ROSTER_JESSICA_REACCEPT = generateIdentifier();
const AI_DRIFT_METHOD_FILTER_1 = generateIdentifier();
const HUMAN_DRIFT_METHOD_FILTER_1 = generateIdentifier();

// Phase Final Task 2: roster (members / human_members /
// ai_members / memberships / invitations) dual-write stripped.
// This file no longer compares derive vs old-table oracles —
// the row plane is empty after seed. Coverage re-homes to
// wire-byte handleRequest assertions and message-plane live
// fixtures (drift-identity-tokens craftsmanship).
//
// The roster is FOUR document families at once: members (the
// shared parent), memberships (the pure join relation), and
// ai-members/human-members (the two kind-specific facets) —
// plus invitations, whose grant/accept/decline/revoke side
// channel this file also covers (deriveInvitations). Hand-
// builds THREE *_TEST_WIRING mirrors of routes.ts's private
// wiring rows so generic-handler cases exercise the ACTUAL
// documentCollectionGetHandler/documentGetHandler.
//
// THE STATES/:ID ESCAPE HATCH RETIRED (roster edition): the
// generic, member-tier-reachable PUT states/:id route is
// gone. Member lifecycle archive/reactivate rides PUT
// members/:id (document trio); work-order unclaim rides POST
// organizations/:id/work-orders/:id/release. EntityStore tombstone scans are
// retired with the row plane. Outside that retired path, the
// deleted-filter is otherwise VACUOUS for
// every roster family across this entire file (finding 15 as
// corrected) — no shipped route ever posts a 'deleted' state for
// a member/membership/ai_member/human_member id — 'deleted'
// is not a member lifecycle value — so old-plane and
// derived-plane parity holds
// throughout every case below.

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

async function derivedMemberships(
    db: DbAdapter, organization: Id,
): Promise<MembershipEntity[]> {
    return deriveOrganizationMemberSeats(db, organization);
}

async function derivedMembership(
    db: DbAdapter, organization: Id, id: Id,
): Promise<MembershipEntity> {
    return deriveOrganizationMemberSeat(db, organization, id);
}

// -- shared live-write body builders -----------------------------

function aiMemberDocumentBody(
    name: string,
): Record<string, unknown> {
    return {
        name,
        description: 'd3',
        skill_focus: 'sf3',
        model: 'nqNVXnBkUBLoKlenbyPIZQ',
    };
}

// -- 1. seeded memberships wire equals derive ------------------

Deno.test('seeded GET /memberships wire equals derive, both orgs'
+ ' (the 10/6 split), plus the empty-organization leg',
async () => {
    const db = await seededDb();

    const tokenStark = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const resStark = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members/',
            tokenStark,
        ),
    );
    assertStrictEquals(resStark.status, 200);
    const stark = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assertEquals(
        sortById(await resStark.json() as MembershipEntity[]),
        sortById(stark),
    );
    assertStrictEquals(stark.length, 6);

    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const resTwo = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/members/',
            tokenTwo,
        ),
    );
    assertStrictEquals(resTwo.status, 200);
    const org2 = await deriveOrganizationMemberSeats(
        db, ORGANIZATION_TWO,
    );
    assertEquals(
        sortById(await resTwo.json() as MembershipEntity[]),
        sortById(org2),
    );
    assertStrictEquals(org2.length, 6);

    const THIRD_ORGANIZATION = '3';
    const empty = await deriveOrganizationMemberSeats(
        db, THIRD_ORGANIZATION,
    );
    assertEquals(empty, []);
    // Phase Final Stage B: roster tables retired.
    // Phase Final Stage B: roster tables retired.
});

// -- 2. per-membership GET wire equals derive; DELETE tombstone

Deno.test('per-seat GET wire equals derive (all 12); missing-'
+ 'id 404; a DELETE-then-derive tombstone', async () => {
    const db = await seededDb();
    const allMemberships = sortById([
        ...await derivedMemberships(db, STARK_ORGANIZATION),
        ...await derivedMemberships(db, ORGANIZATION_TWO),
    ]);
    assertStrictEquals(allMemberships.length, 12);

    for (const membership of allMemberships) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', membership.organization_id,
        );
        const path = '/organizations/'
            + membership.organization_id
            + '/members/' + membership.id;
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assertStrictEquals(res.status, 200);
        const derived = await derivedMembership(
            db, membership.organization_id, membership.id,
        );
        assertStrictEquals(derived.id, membership.id);
        const wire = await res.json() as MembershipEntity;
        assertStrictEquals(wire.id, derived.id);
        assertStrictEquals(
            wire.organization_id, derived.organization_id,
        );
        assertStrictEquals(wire.identity_id, derived.identity_id);
    }

    const missingId = generateIdentifier();
    const expectedMessage =
        'Not found: organization_members/' + missingId;
    const err = await assertRejects(
        () => derivedMembership(
            db, STARK_ORGANIZATION, missingId,
        ),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);
    const missingRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members/' + missingId,
            await organizationToken(
                'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
            ),
        ),
    );
    assertStrictEquals(missingRes.status, 404);
    assertStrictEquals(
        (await missingRes.json() as { error: string }).error,
        expectedMessage,
    );

    const target = allMemberships[0]!;
    const deleteResponse = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + target.organization_id
            + '/members/' + target.id,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', target.organization_id,
        ),
    ));
    assertStrictEquals(deleteResponse.status, 204);
    const expectedTargetMessage =
        'Not found: organization_members/' + target.id;
    const targetErr = await assertRejects(
        () => derivedMembership(
            db, target.organization_id, target.id,
        ),
    ) as Error;
    assertInstanceOf(targetErr, EntityNotFoundError);
    assertStrictEquals(targetErr.message, expectedTargetMessage);
    const tombstoneRes = await handleRequest(db, req(
        'GET',
        '/organizations/' + target.organization_id
            + '/members/' + target.id,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', target.organization_id,
        ),
    ));
    assertStrictEquals(tombstoneRes.status, 404);
    assertStrictEquals(
        (await tombstoneRes.json() as { error: string }).error,
        expectedTargetMessage,
    );
});

// -- 3. ai-members + human-members wire equals derive ----------

Deno.test('ai-agents + identities wire equals GET (GLOBAL)'
+ ' + per-entity get + 404-byte parity', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const resAi = await handleRequest(
        db, req('GET', '/ai-agents/', token),
    );
    assertStrictEquals(resAi.status, 200);
    const agents = await resAi.json() as { id: string }[];
    assertStrictEquals(agents.length, 4);

    const resHuman = await handleRequest(
        db, req('GET', '/identities/', token),
    );
    assertStrictEquals(resHuman.status, 200);
    const identities = await resHuman.json() as {
        id: string;
        kind: string;
    }[];
    assertStrictEquals(
        identities.filter((row) => row.kind === 'person')
            .length,
        12,
    );

    for (const row of agents) {
        const res = await handleRequest(
            db, req('GET', '/ai-agents/' + row.id, token),
        );
        assertStrictEquals(res.status, 200);
        const got = await res.json() as { id: string };
        assertStrictEquals(got.id, row.id);
    }
    for (const row of identities) {
        const res = await handleRequest(
            db, req('GET', '/identities/' + row.id, token),
        );
        assertStrictEquals(res.status, 200);
        const got = await res.json() as { id: string };
        assertStrictEquals(got.id, row.id);
    }

    const missingId = generateIdentifier();
    const expectedAiMessage =
        'Not found: ai-agents/' + missingId;
    const aiMissingRes = await handleRequest(
        db, req('GET', '/ai-agents/' + missingId, token),
    );
    assertStrictEquals(aiMissingRes.status, 404);
    assertStrictEquals(
        (await aiMissingRes.json() as { error: string }).error,
        expectedAiMessage,
    );

    const expectedHumanMessage =
        'Not found: identities/' + missingId;
    const humanMissingRes = await handleRequest(
        db, req('GET', '/identities/' + missingId, token),
    );
    assertStrictEquals(humanMissingRes.status, 404);
    assertStrictEquals(
        (await humanMissingRes.json() as { error: string }).error,
        expectedHumanMessage,
    );
});

// -- 4. members wire equals derive; roster counts; 404 -------

Deno.test('seat collection counts per org; current identity;'
+ ' missing-seat 404', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const resMembers = await handleRequest(
        db, req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/members/',
            token,
        ),
    );
    assertStrictEquals(resMembers.status, 200);

    const starkRoster = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    const org2Roster = await deriveOrganizationMemberSeats(
        db, ORGANIZATION_TWO,
    );
    assertStrictEquals(starkRoster.length, 6);
    assertStrictEquals(org2Roster.length, 6);

    const resStark = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members/',
            await organizationToken(
                'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
            ),
        ),
    );
    assertStrictEquals(resStark.status, 200);
    assertEquals(
        sortById(await resStark.json() as MembershipEntity[]),
        sortById(starkRoster),
    );

    const resCurrent = await handleRequest(
        db, req(
            'GET',
            '/identities/XXZruirZyAOoRpNxaDnpSA',
            token,
        ),
    );
    assertStrictEquals(resCurrent.status, 200);
    const current = await resCurrent.json() as {
        id: string;
        kind: string;
    };
    assertStrictEquals(current.id, 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(current.kind, 'person');

    const missingId = generateIdentifier();
    const expectedMessage =
        'Not found: organization_members/' + missingId;
    const err = await assertRejects(
        () => deriveOrganizationMemberSeat(
            db, STARK_ORGANIZATION, missingId,
        ),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);
});

// -- 5. live-write chain on the message plane ------------------

Deno.test('live-write chain: PUT ai-agents, PUT identity, PUT'
+ ' seat, DELETE seat — message plane only',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = generateIdentifier();

    const beforeCreate = (await db.messagePairs.getAll()).length;
    const created = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Chain AI'),
    ));
    assertStrictEquals(created.status, 201);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, beforeCreate + 1,
    );
    const agent1 = await handleRequest(
        db, req('GET', '/ai-agents/' + aiId, token),
    );
    assertStrictEquals(agent1.status, 200);
    assertStrictEquals(
        ((await agent1.json()) as { name: string }).name,
        'Chain AI',
    );

    const facetPut = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Chain AI Facet'),
    ));
    assertStrictEquals(facetPut.status, 201);
    const agent2 = await handleRequest(
        db, req('GET', '/ai-agents/' + aiId, token),
    );
    assertStrictEquals(
        ((await agent2.json()) as { name: string }).name,
        'Chain AI Facet',
    );

    const humanId = generateIdentifier();
    const beforeHumanCreate = (await db.messagePairs.getAll()).length;
    const humanCreated = await handleRequest(db, req(
        'PUT', '/identities/' + humanId, token, {
            kind: 'person',
            title: 't',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(humanCreated.status, 201);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        beforeHumanCreate + 1,
    );
    const humanEdited = await handleRequest(db, req(
        'PUT', '/identities/' + humanId, token, {
            kind: 'person',
            title: 't2',
            department: 'd2',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(humanEdited.status, 201);
    const identityGot = await handleRequest(
        db, req('GET', '/identities/' + humanId, token),
    );
    assertStrictEquals(
        ((await identityGot.json()) as { title: string })
            .title,
        't2',
    );

    const membershipPut = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + humanId,
        token,
        { type: 'member', at: nowUtc() },
    ));
    assertStrictEquals(membershipPut.status, 201);
    const rosterAfterMembership =
        await deriveOrganizationMemberSeats(
            db, STARK_ORGANIZATION,
        );
    assertStrictEquals(
        rosterAfterMembership.some((m) => m.id === humanId),
        true,
    );

    const membershipDelete = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + humanId,
        token,
    ));
    assertStrictEquals(membershipDelete.status, 204);
    const rosterAfterDelete =
        await deriveOrganizationMemberSeats(
            db, STARK_ORGANIZATION,
        );
    assertStrictEquals(
        rosterAfterDelete.some((m) => m.id === humanId),
        false,
    );
    const surviving = await handleRequest(
        db, req('GET', '/identities/' + humanId, token),
    );
    assertStrictEquals(surviving.status, 200);
    assertStrictEquals(
        ((await surviving.json()) as { id: string }).id,
        humanId,
    );
});

// -- 6. invitations lifecycle on the message plane -------------

Deno.test('invitations lifecycle: fresh grant → pending; accept →'
+ ' accepted + membership on message plane; decline; revoke;'
+ ' duplicate grant → no phantom; no-op re-accept → stable',
async () => {
    const db = await seededDb();
    const organization = ORGANIZATION_TWO;
    const adminToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );

    async function grantTo(
        invitationId: string, email: string,
        grantEventId: string, grantAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'POST',
            '/organizations/' + organization
                + '/invitations/',
            adminToken,
            { email, invitationId, grantEventId, grantAt },
        ));
    }

    async function acceptAs(
        invitee: string, invitationId: string,
        membershipId: string, acceptEventId: string,
        acceptAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'PUT',
            '/identities/' + invitee
                + '/invitations/' + invitationId,
            await organizationToken(invitee, STARK_ORGANIZATION),
            {
                state: 'accepted',
                membershipId,
                eventId: acceptEventId,
                at: acceptAt,
            },
        ));
    }

    async function declineAs(
        invitee: string, invitationId: string,
        declineEventId: string, declineAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'PUT',
            '/identities/' + invitee
                + '/invitations/' + invitationId,
            await organizationToken(invitee, STARK_ORGANIZATION),
            {
                state: 'declined',
                eventId: declineEventId,
                at: declineAt,
            },
        ));
    }

    async function revoke(
        invitationId: string, revokeEventId: string,
        revokeAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'PUT',
            '/organizations/' + organization
                + '/invitations/' + invitationId,
            adminToken, {
                state: 'revoked',
                eventId: revokeEventId,
                at: revokeAt,
            },
        ));
    }

    // A: fresh grant — pending.
    const sarahGrant = await grantTo(
        INV_ROSTER_SARAH, 'sarah.chen@company.com',
        EV_ROSTER_SARAH_GRANT, '2026-06-01T00:00:00.000000Z',
    );
    assertStrictEquals(sarahGrant.status, 200);
    const sarahRow = (await deriveInvitations(db)).find(
        (row) => row.id === INV_ROSTER_SARAH,
    )!;
    assertStrictEquals(sarahRow.state, 'pending');
    // Phase Final Stage B: roster tables retired.

    // B: accept — accepted + the membership on the message plane.
    const jessicaId = 'zyGBRshxOnKHUfcyFRqowg';
    const jessicaGrant = await grantTo(
        INV_ROSTER_JESSICA, 'jessica.park@company.com',
        EV_ROSTER_JESSICA_GRANT, '2026-06-01T00:00:01.000000Z',
    );
    assertStrictEquals(jessicaGrant.status, 200);
    const jessicaAccept = await acceptAs(
        jessicaId, INV_ROSTER_JESSICA, MS_ROSTER_JESSICA,
        EV_ROSTER_JESSICA_ACCEPT, '2026-06-01T00:00:02.000000Z',
    );
    assertStrictEquals(jessicaAccept.status, 204);
    const jessicaRow = (await deriveInvitations(db)).find(
        (row) => row.id === INV_ROSTER_JESSICA,
    )!;
    assertStrictEquals(jessicaRow.state, 'accepted');
    const derivedJessicaMembership =
        await deriveOrganizationMemberSeat(
            db, organization, jessicaId,
        );
    assertStrictEquals(
        derivedJessicaMembership.identity_id, jessicaId,
    );
    assertStrictEquals(
        derivedJessicaMembership.organization_id, organization,
    );

    // C: decline.
    const emilyGrant = await grantTo(
        INV_ROSTER_EMILY, 'emily.rodriguez@company.com',
        EV_ROSTER_EMILY_GRANT, '2026-06-01T00:00:03.000000Z',
    );
    assertStrictEquals(emilyGrant.status, 200);
    const emilyDecline = await declineAs(
        'CJrglMsNBxOWWfbihHQSeg', INV_ROSTER_EMILY,
        EV_ROSTER_EMILY_DECLINE, '2026-06-01T00:00:04.000000Z',
    );
    assertStrictEquals(emilyDecline.status, 204);
    const emilyRow = (await deriveInvitations(db)).find(
        (row) => row.id === INV_ROSTER_EMILY,
    )!;
    assertStrictEquals(emilyRow.state, 'declined');

    // D: revoke.
    const marcusGrant = await grantTo(
        INV_ROSTER_MARCUS, 'marcus@acmecorp.com',
        EV_ROSTER_MARCUS_GRANT, '2026-06-01T00:00:05.000000Z',
    );
    assertStrictEquals(marcusGrant.status, 200);
    const marcusRevoke = await revoke(
        INV_ROSTER_MARCUS, EV_ROSTER_MARCUS_REVOKE,
        '2026-06-01T00:00:06.000000Z',
    );
    assertStrictEquals(marcusRevoke.status, 204);
    const marcusRow = (await deriveInvitations(db)).find(
        (row) => row.id === INV_ROSTER_MARCUS,
    )!;
    assertStrictEquals(marcusRow.state, 'revoked');

    // E: duplicate grant for Sarah's SAME (org, identity) pair —
    // NO phantom invitation document.
    const beforeDerived = (await deriveInvitations(db)).length;
    const sarahDuplicate = await grantTo(
        INV_ROSTER_SARAH_DUP, 'sarah.chen@company.com',
        EV_ROSTER_SARAH_DUP_GRANT, '2026-06-01T00:00:07.000000Z',
    );
    assertStrictEquals(sarahDuplicate.status, 200);
    assertStrictEquals(
        (await deriveInvitations(db)).length, beforeDerived,
    );
    const derivedAfterDuplicate = await deriveInvitations(db);
    assertStrictEquals(
        derivedAfterDuplicate.filter(
            (row) => row.identity_id === 'MQFcPtrZPIGjMCRAXtZUnA'
                && row.organization_id === organization,
        ).length, 1,
    );

    // F: no-op re-accept — state stable, no new state event.
    const statesBefore =
        0 /* states table retired */;
    const jessicaReaccept = await acceptAs(
        jessicaId, INV_ROSTER_JESSICA, MS_ROSTER_JESSICA_2,
        EV_ROSTER_JESSICA_REACCEPT,
        '2026-06-01T00:00:08.000000Z',
    );
    assertStrictEquals(jessicaReaccept.status, 204);
    assertStrictEquals(
        0 /* states table retired */,
        statesBefore,
    );
});

// -- 7. method-filter proof: the create-op POST pairs are never -
// -- derived heads; exactly one document head per address after -
// -- create ---------------------------------------------------------

Deno.test('PUT ai-agents and PUT identities land exactly one'
+ ' document message pair at each address — no composing POST',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = AI_DRIFT_METHOD_FILTER_1;
    const humanId = HUMAN_DRIFT_METHOD_FILTER_1;

    const aiCreated = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Filter AI'),
    ));
    assertStrictEquals(aiCreated.status, 201);

    const aiPrefix = canonicalUriCollection(
        undefined, '/ai-agents/',
    );
    const [aiRequests] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', aiPrefix),
        db.messagePairs.getAllWhere('uri_collection', aiPrefix),
    ]);
    const aiDocumentMessagePairs = documentMessagePairsAt(
        aiRequests, aiPrefix,
    ).filter((messagePair) => messagePair.uriId === aiId);
    assertStrictEquals(aiDocumentMessagePairs.length, 1);
    assertStrictEquals(aiDocumentMessagePairs[0]!.method, 'PUT');

    const humanCreated = await handleRequest(db, req(
        'PUT', '/identities/' + humanId, token, {
            kind: 'person',
            title: 't',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(humanCreated.status, 201);

    const humanPrefix = canonicalUriCollection(
        undefined, '/identities/',
    );
    const [humanRequests] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', humanPrefix),
        db.messagePairs.getAllWhere('uri_collection', humanPrefix),
    ]);
    const humanDocumentMessagePairs = documentMessagePairsAt(
        humanRequests, humanPrefix,
    ).filter((messagePair) => messagePair.uriId === humanId);
    assertStrictEquals(humanDocumentMessagePairs.length, 1);
    assertStrictEquals(humanDocumentMessagePairs[0]!.method, 'PUT');
});

// -- 8. resend idempotency at drift altitude --------------------

Deno.test('resend idempotency: a byte-identical ai-agents/:id PUT'
+ ' resend replays the stored response and appends NO second'
+ ' pair (the E6 fast-path at drift altitude)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = generateIdentifier();

    const beforeCount = (await db.messagePairs.getAll()).length;
    const body = aiMemberDocumentBody('Resend AI Facet');
    const first = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token, body,
    ));
    assertStrictEquals(first.status, 201);
    const afterFirst = (await db.messagePairs.getAll()).length;
    assertStrictEquals(afterFirst, beforeCount + 1);

    const second = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token, body,
    ));
    assertStrictEquals(second.status, 201);
    const afterSecond = (await db.messagePairs.getAll()).length;
    assertStrictEquals(afterSecond, afterFirst);
    assertStrictEquals(
        first.headers.get('Response-ID'),
        second.headers.get('Response-ID'),
    );

    const got = await handleRequest(
        db, req('GET', '/ai-agents/' + aiId, token),
    );
    assertStrictEquals(
        ((await got.json()) as { name: string }).name,
        'Resend AI Facet',
    );
});

// -- 8b. genesis-wins-under-skew on members GET ---------------
// case-7d mirror for members GET: a clock-skewed later
// arrival whose state_at sorts BELOW genesis does NOT
// displace genesis as lifecycle-current. Head body fields
// (`type`) may reflect the later arrival; the GET trio must
// stay genesis (state ← event.state, state_at ← event.at,
// state_event_id ← event.id). Members are GLOBAL plane —
// no organization stamp.

Deno.test('GET identity is the latest PUT under clock-skewed'
+ ' later arrival (stateless document, arrival order)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const memberId = generateIdentifier();

    const genesis = await handleRequest(db, req(
        'PUT', '/identities/' + memberId, token, {
            kind: 'person',
            title: 'first',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(genesis.status, 201);

    const skewed = await handleRequest(db, req(
        'PUT', '/identities/' + memberId, token, {
            kind: 'person',
            title: 'second',
            department: 'd2',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(skewed.status, 201);

    const res = await handleRequest(
        db, req('GET', '/identities/' + memberId, token),
    );
    assertStrictEquals(res.status, 200);
    const got = await res.json() as { title: string };
    assertStrictEquals(got.title, 'second');
});

// -- 9. plain PUT-supersession at a membership address (NAMED --
// -- divergence from a literal genesis-wins-under-skew) ---------
//
// Memberships carry no lifecycle trio (MEMBERSHIPS_WIRING:
// lifecycle 'stateless') and no separate (state_at, id)-style
// reduction of their own. Envelope order and arrival order are
// STRUCTURALLY identical for a stateless document — nowUtc is
// globally monotonic and the response `at` is minted
// synchronously pre-commit (the drift-work-orders.test.ts case-7
// precedent makes the SAME admission for its own stateless
// document address) — so no live two-PUT sequence can decouple
// "the (at, id) reduction" from arrival order here, and there is
// no body timestamp to skew that any reduction other than
// arrival order consults. This case proves plain PUT
// supersession at a membership address instead, and separately
// proves deriveMembers' JOIN is insensitive to which PUT "won"
// (it reads identity_id alone, unaffected by the membership's
// own `at` field either way).

Deno.test('plain PUT-supersession at a seat address — a'
+ ' second PUT (an OLDER domain `at` than the first) still'
+ ' supersedes by ARRIVAL order on the message plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const identityId = 'zyGBRshxOnKHUfcyFRqowg'; // Jessica Park

    const first = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + identityId,
        token,
        {
            type: 'member',
            at: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    assert(firstId);

    const second = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + identityId,
        token,
        {
            type: 'member',
            at: '2020-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(second.status, 201);

    const derived = await derivedMembership(
        db, STARK_ORGANIZATION, identityId,
    );
    assertStrictEquals(derived.at, '2020-01-01T00:00:00.000000Z');

    const roster = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        roster.some((m) => m.id === identityId), true,
    );
});

// -- 10. THE ORPHANED-MEMBERSHIP CASE ----------------------------

Deno.test('THE UNSEATED-IDENTITY CASE: an identity created via'
+ ' postIdentityCreationOp has no seat — GET seats drops it;'
+ ' PUT seat then shows it',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const orphanId = generateIdentifier();

    const created = await handleRequest(db, req(
        'PUT', '/identities/' + orphanId, token, {
            kind: 'person',
            title: '',
            department: '',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(created.status, 201);
    const before = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        before.some((m) => m.id === orphanId), false,
    );

    const membershipPut = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + orphanId,
        token,
        { type: 'member', at: nowUtc() },
    ));
    assertStrictEquals(membershipPut.status, 201);

    const after = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        after.some((m) => m.id === orphanId), true,
    );
    const identityGot = await handleRequest(
        db, req('GET', '/identities/' + orphanId, token),
    );
    assertStrictEquals(identityGot.status, 200);
});
