import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    MemberEntity,
    MembershipEntity,
    AIMemberEntity,
    HumanMemberEntity,
} from '../api/types.ts';
import { nowUtc } from
    '../api/types.ts';
import { canonicalUriCollection } from '../api/message-pair.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    validateMemberDocumentBody,
    validateMembershipDocumentBody,
    validateAiMemberDocumentBody,
    validateHumanMemberDocumentBody,
} from '../api/validators.ts';
import {
    postMemberDocumentOp,
    postMembershipDocumentOp,
    postAiMemberDocumentOp,
    postHumanMemberDocumentOp,
    postIdentityCreationOp,
} from '../api/routes.ts';
import {
    deriveMemberParents,
    deriveMemberParent,
    deriveMembers,
} from '../api/derive-members.ts';
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
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
    storedCollectionText,
} from './http-fixtures.ts';

// Phase Final Task 2: roster (members / human_members /
// ai_members / memberships / invitations) dual-write stripped.
// This file no longer compares derive vs old-table oracles —
// the row plane is empty after seed. Coverage re-homes to
// wire-byte handleRequest assertions and pair-plane live
// fixtures (drift-identity-tokens craftsmanship).
//
// The roster is FOUR document families at once: members (the
// shared parent), memberships (the pure join relation), and
// ai-members/human-members (the two kind-specific facets) —
// plus invitations, whose grant/accept/decline/revoke side
// channel this file also covers (deriveInvitations). Hand-
// builds FOUR *_TEST_WIRING mirrors of routes.ts's private
// wiring rows so generic-handler cases exercise the ACTUAL
// documentCollectionGetHandler/documentGetHandler.
//
// THE STATES/:ID ESCAPE HATCH RETIRED (roster edition): the
// generic, member-tier-reachable PUT states/:id route is
// gone. Member lifecycle archive/reactivate rides PUT
// members/:id (document trio); work-order unclaim rides POST
// work-orders/:id/release. EntityStore tombstone scans are
// retired with the row plane. Outside that retired path, the
// deleted-filter is otherwise VACUOUS for
// every roster family across this entire file (finding 15 as
// corrected) — no shipped route ever posts a 'deleted' state for
// a member/membership/ai_member/human_member id (MEMBER_STATES is
// ['active', 'pending', 'archived'] — 'deleted' is not even in
// the alphabet), so old-plane and derived-plane parity holds
// throughout every case below.

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

// -- test-side wiring mirrors (routes.ts's private rows, by ----
// -- content — every family's wiring row is module-private) -----

const MEMBERS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'members',
    lifecycle: 'trio',
    notFoundTable: 'members',
    validateDocument: validateMemberDocumentBody,
    documentOp: postMemberDocumentOp,
    // Mirror routes.ts memberDocumentEntityOf: stamp trio
    // from lifecycle-current (required on trio path).
    entityOf: (document, _organization, current) => ({
        id: document.uriId,
        type: document.body['type'],
        state: current!.state,
        state_at: current!.at,
        state_event_id: current!.id,
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

const AI_MEMBERS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'ai-members',
    lifecycle: 'stateless',
    notFoundTable: 'ai_members',
    validateDocument: validateAiMemberDocumentBody,
    documentOp: postAiMemberDocumentOp,
    entityOf: (document, _organization) => ({
        id: document.uriId,
        ...document.body,
    }),
};

const HUMAN_MEMBERS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'human-members',
    lifecycle: 'stateless',
    notFoundTable: 'human_members',
    validateDocument: validateHumanMemberDocumentBody,
    documentOp: postHumanMemberDocumentOp,
    entityOf: (document, _organization) => ({
        id: document.uriId,
        ...document.body,
    }),
};

// Any Id works here — every generic read path ignores its
// `actor` argument entirely.
const READER_ACTOR: Id = 'drift-reader';

// members/ai-members/human-members are GLOBAL plane (family-
// registry.ts: organizationNested:false) — canonicalUriCollection
// ignores whatever organization value a caller passes for these
// three families, so this fixed placeholder is never load-
// bearing; requireOrganization (document-family.ts) merely
// demands a defined value to dispatch through.
const GLOBAL_PLANE_PLACEHOLDER: Id = STARK_ORGANIZATION;

async function derivedMembersDirect(
    db: DbAdapter, organization: Id,
): Promise<MemberEntity[]> {
    return documentCollectionGetHandler(MEMBERS_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<MemberEntity[]>;
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

async function derivedAiMembers(
    db: DbAdapter, organization: Id,
): Promise<AIMemberEntity[]> {
    return documentCollectionGetHandler(AI_MEMBERS_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<AIMemberEntity[]>;
}

async function derivedAiMember(
    db: DbAdapter, organization: Id, id: Id,
): Promise<AIMemberEntity> {
    return documentGetHandler(AI_MEMBERS_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<AIMemberEntity>;
}

async function derivedHumanMembers(
    db: DbAdapter, organization: Id,
): Promise<HumanMemberEntity[]> {
    return documentCollectionGetHandler(HUMAN_MEMBERS_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<HumanMemberEntity[]>;
}

async function derivedHumanMember(
    db: DbAdapter, organization: Id, id: Id,
): Promise<HumanMemberEntity> {
    return documentGetHandler(HUMAN_MEMBERS_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<HumanMemberEntity>;
}

// -- decode helper (mirrors tests/drift-records.test.ts's own ---
// -- decodeRequestMessage) ---------------------------------------

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseWire(message);
    if (model.startLine.kind !== 'request') {
        throw new Error(
            'stored message carries no request line',
        );
    }
    const body = HttpMessage.fromModel(model).body();
    return {
        method: model.startLine.method,
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// -- shared live-write body builders -----------------------------

function aiMemberCreateBody(
    id: string,
    name: string,
    stateEventId: string,
    stateAt: string,
): Record<string, unknown> {
    return {
        id,
        detail: {
            name,
            description: 'd',
            skill_focus: 'sf',
            model: 'mnte677fU2G1V2B9vJp9z7',
        },
        initialState: 'active',
        initialStateEventId: stateEventId,
        initialStateAt: stateAt,
    };
}

function aiMemberEditBody(
    name: string,
    stateEventId: string,
    stateAt: string,
): Record<string, unknown> {
    return {
        detail: {
            name,
            description: 'd2',
            skill_focus: 'sf2',
            model: 'mnte677fU2G1V2B9vJp9z7',
        },
        state: 'active',
        stateAt,
        stateEventId,
    };
}

function aiMemberDocumentBody(
    name: string,
): Record<string, unknown> {
    return {
        name,
        description: 'd3',
        skill_focus: 'sf3',
        model: 'mnte677fU2G1V2B9vJp9z7',
    };
}

// PII no longer rides the create body (Phase 10 Task 2's intake
// decomposition) — `name` stays a parameter so callers keep one
// literal call shape even though this builder no longer uses it.
function humanMemberCreateBody(
    id: string,
    _name: string,
    stateEventId: string,
    stateAt: string,
): Record<string, unknown> {
    return {
        id,
        detail: {
            title: 't', department: 'd',
            strengths: [],
            team_dimensions: {},
        },
        initialState: 'active',
        initialStateEventId: stateEventId,
        initialStateAt: stateAt,
    };
}

// PII no longer rides the edit body (Phase 10 Task 2's intake
// decomposition) — it changes ONLY via a separate PUT
// identities/:id/pii, which this drift chain does not exercise.
function humanMemberEditBody(
    stateEventId: string,
    stateAt: string,
): Record<string, unknown> {
    return {
        detail: {
            title: 't2', department: 'd2',
            strengths: [],
            team_dimensions: {},
        },
        state: 'active',
        stateAt,
        stateEventId,
    };
}

// -- 1. seeded memberships wire equals derive ------------------

test('seeded GET /memberships wire equals derive, both orgs'
+ ' (the 10/6 split), plus the empty-organization leg',
async () => {
    const db = await seededDb();

    const tokenStark = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const resStark = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members',
            tokenStark,
        ),
    );
    assert.equal(resStark.status, 200);
    const stark = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assert.deepEqual(
        sortById(await resStark.json() as MembershipEntity[]),
        sortById(stark),
    );
    assert.equal(stark.length, 6);

    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const resTwo = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/members',
            tokenTwo,
        ),
    );
    assert.equal(resTwo.status, 200);
    const org2 = await deriveOrganizationMemberSeats(
        db, ORGANIZATION_TWO,
    );
    assert.deepEqual(
        sortById(await resTwo.json() as MembershipEntity[]),
        sortById(org2),
    );
    assert.equal(org2.length, 6);

    const THIRD_ORGANIZATION = '3';
    const empty = await deriveOrganizationMemberSeats(
        db, THIRD_ORGANIZATION,
    );
    assert.deepEqual(empty, []);
    // Phase Final Stage B: roster tables retired.
    // Phase Final Stage B: roster tables retired.
});

// -- 2. per-membership GET wire equals derive; DELETE tombstone

test('per-seat GET wire equals derive (all 12); missing-'
+ 'id 404; a DELETE-then-derive tombstone', async () => {
    const db = await seededDb();
    const allMemberships = sortById([
        ...await derivedMemberships(db, STARK_ORGANIZATION),
        ...await derivedMemberships(db, ORGANIZATION_TWO),
    ]);
    assert.equal(allMemberships.length, 12);

    for (const membership of allMemberships) {
        const token = await organizationToken(
            'current', membership.organization_id,
        );
        const path = '/organizations/'
            + membership.organization_id
            + '/members/' + membership.id;
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assert.equal(res.status, 200);
        const derived = await derivedMembership(
            db, membership.organization_id, membership.id,
        );
        assert.equal(derived.id, membership.id);
        const wire = await res.json() as MembershipEntity;
        assert.equal(wire.id, derived.id);
        assert.equal(
            wire.organization_id, derived.organization_id,
        );
        assert.equal(wire.identity_id, derived.identity_id);
    }

    const missingId = 'no-such-membership';
    const expectedMessage =
        'Not found: organization_members/' + missingId;
    await assert.rejects(
        () => derivedMembership(
            db, STARK_ORGANIZATION, missingId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
    const missingRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members/' + missingId,
            await organizationToken(
                'current', STARK_ORGANIZATION,
            ),
        ),
    );
    assert.equal(missingRes.status, 404);
    assert.equal(
        (await missingRes.json() as { error: string }).error,
        expectedMessage,
    );

    const target = allMemberships[0]!;
    const deleteResponse = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + target.organization_id
            + '/members/' + target.id,
        await organizationToken(
            'current', target.organization_id,
        ),
    ));
    assert.equal(deleteResponse.status, 204);
    const expectedTargetMessage =
        'Not found: organization_members/' + target.id;
    await assert.rejects(
        () => derivedMembership(
            db, target.organization_id, target.id,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedTargetMessage,
    );
    const tombstoneRes = await handleRequest(db, req(
        'GET',
        '/organizations/' + target.organization_id
            + '/members/' + target.id,
        await organizationToken(
            'current', target.organization_id,
        ),
    ));
    assert.equal(tombstoneRes.status, 404);
    assert.equal(
        (await tombstoneRes.json() as { error: string }).error,
        expectedTargetMessage,
    );
});

// -- 3. ai-members + human-members wire equals derive ----------

test('ai-agents + identities wire equals GET (GLOBAL)'
+ ' + per-entity get + 404-byte parity', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const resAi = await handleRequest(
        db, req('GET', '/ai-agents', token),
    );
    assert.equal(resAi.status, 200);
    const agents = await resAi.json() as { id: string }[];
    assert.equal(agents.length, 4);

    const resHuman = await handleRequest(
        db, req('GET', '/identities', token),
    );
    assert.equal(resHuman.status, 200);
    const identities = await resHuman.json() as {
        id: string;
        kind: string;
    }[];
    assert.equal(
        identities.filter((row) => row.kind === 'person')
            .length,
        11,
    );

    for (const row of agents) {
        const res = await handleRequest(
            db, req('GET', '/ai-agents/' + row.id, token),
        );
        assert.equal(res.status, 200);
        const got = await res.json() as { id: string };
        assert.equal(got.id, row.id);
    }
    for (const row of identities) {
        const res = await handleRequest(
            db, req('GET', '/identities/' + row.id, token),
        );
        assert.equal(res.status, 200);
        const got = await res.json() as { id: string };
        assert.equal(got.id, row.id);
    }

    const missingId = 'no-such-detail';
    const expectedAiMessage =
        'Not found: ai-agents/' + missingId;
    const aiMissingRes = await handleRequest(
        db, req('GET', '/ai-agents/' + missingId, token),
    );
    assert.equal(aiMissingRes.status, 404);
    assert.equal(
        (await aiMissingRes.json() as { error: string }).error,
        expectedAiMessage,
    );

    const expectedHumanMessage =
        'Not found: identities/' + missingId;
    const humanMissingRes = await handleRequest(
        db, req('GET', '/identities/' + missingId, token),
    );
    assert.equal(humanMissingRes.status, 404);
    assert.equal(
        (await humanMissingRes.json() as { error: string }).error,
        expectedHumanMessage,
    );
});

// -- 4. members wire equals derive; roster counts; 404 -------

test('seat collection counts per org; current identity;'
+ ' missing-seat 404', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const resMembers = await handleRequest(
        db, req(
            'GET',
            '/organizations/1/members',
            token,
        ),
    );
    assert.equal(resMembers.status, 200);

    const starkRoster = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    const org2Roster = await deriveOrganizationMemberSeats(
        db, ORGANIZATION_TWO,
    );
    assert.equal(starkRoster.length, 6);
    assert.equal(org2Roster.length, 6);

    const resStark = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members',
            await organizationToken(
                'current', STARK_ORGANIZATION,
            ),
        ),
    );
    assert.equal(resStark.status, 200);
    assert.deepEqual(
        sortById(await resStark.json() as MembershipEntity[]),
        sortById(starkRoster),
    );

    const resCurrent = await handleRequest(
        db, req(
            'GET',
            '/identities/current',
            token,
        ),
    );
    assert.equal(resCurrent.status, 200);
    const current = await resCurrent.json() as {
        id: string;
        kind: string;
    };
    assert.equal(current.id, 'current');
    assert.equal(current.kind, 'person');

    const missingId = 'no-such-member';
    const expectedMessage =
        'Not found: organization_members/' + missingId;
    await assert.rejects(
        () => deriveOrganizationMemberSeat(
            db, STARK_ORGANIZATION, missingId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

// -- 5. live-write chain on the pair plane ---------------------

test('live-write chain: PUT ai-agents, PUT identity, PUT'
+ ' seat, DELETE seat — pair plane only',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-chain-1';

    const beforeCreate = (await db.requests.getAll()).length;
    const created = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Chain AI'),
    ));
    assert.equal(created.status, 201);
    assert.equal(
        (await db.requests.getAll()).length, beforeCreate + 1,
    );
    const agent1 = await handleRequest(
        db, req('GET', '/ai-agents/' + aiId, token),
    );
    assert.equal(agent1.status, 200);
    assert.equal(
        ((await agent1.json()) as { name: string }).name,
        'Chain AI',
    );

    const facetPut = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Chain AI Facet'),
    ));
    assert.equal(facetPut.status, 201);
    const agent2 = await handleRequest(
        db, req('GET', '/ai-agents/' + aiId, token),
    );
    assert.equal(
        ((await agent2.json()) as { name: string }).name,
        'Chain AI Facet',
    );

    const humanId = 'human-drift-chain-1';
    const beforeHumanCreate = (await db.requests.getAll()).length;
    const humanCreated = await handleRequest(db, req(
        'PUT', '/identities/' + humanId, token, {
            kind: 'person',
            title: 't',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assert.equal(humanCreated.status, 201);
    assert.equal(
        (await db.requests.getAll()).length,
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
    assert.equal(humanEdited.status, 201);
    const identityGot = await handleRequest(
        db, req('GET', '/identities/' + humanId, token),
    );
    assert.equal(
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
    assert.equal(membershipPut.status, 201);
    const rosterAfterMembership =
        await deriveOrganizationMemberSeats(
            db, STARK_ORGANIZATION,
        );
    assert.equal(
        rosterAfterMembership.some((m) => m.id === humanId),
        true,
    );

    const membershipDelete = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + humanId,
        token,
    ));
    assert.equal(membershipDelete.status, 204);
    const rosterAfterDelete =
        await deriveOrganizationMemberSeats(
            db, STARK_ORGANIZATION,
        );
    assert.equal(
        rosterAfterDelete.some((m) => m.id === humanId),
        false,
    );
    const surviving = await handleRequest(
        db, req('GET', '/identities/' + humanId, token),
    );
    assert.equal(surviving.status, 200);
    assert.equal(
        ((await surviving.json()) as { id: string }).id,
        humanId,
    );
});

// -- 6. invitations lifecycle on the pair plane ----------------

test('invitations lifecycle: fresh grant → pending; accept →'
+ ' accepted + membership on pair plane; decline; revoke;'
+ ' duplicate grant → no phantom; no-op re-accept → stable',
async () => {
    const db = await seededDb();
    const organization = ORGANIZATION_TWO;
    const adminToken = await organizationToken(
        'current', organization,
    );

    async function grantTo(
        invitationId: string, email: string,
        grantEventId: string, grantAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'POST', '/invitations', adminToken,
            { email, invitationId, grantEventId, grantAt },
        ));
    }

    async function acceptAs(
        invitee: string, invitationId: string,
        membershipId: string, acceptEventId: string,
        acceptAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'POST',
            '/invitations/' + invitationId + '/acceptance',
            await organizationToken(invitee, STARK_ORGANIZATION),
            { membershipId, acceptEventId, acceptAt },
        ));
    }

    async function declineAs(
        invitee: string, invitationId: string,
        declineEventId: string, declineAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'POST', '/invitations/' + invitationId + '/decline',
            await organizationToken(invitee, STARK_ORGANIZATION),
            { declineEventId, declineAt },
        ));
    }

    async function revoke(
        invitationId: string, revokeEventId: string,
        revokeAt: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'POST',
            '/invitations/' + invitationId + '/revocation',
            adminToken, { revokeEventId, revokeAt },
        ));
    }

    // A: fresh grant — pending.
    const sarahGrant = await grantTo(
        'inv-roster-sarah', 'sarah.chen@company.com',
        'ev-roster-sarah-grant', '2026-06-01T00:00:00.000000Z',
    );
    assert.equal(sarahGrant.status, 201);
    const sarahRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-sarah',
    )!;
    assert.equal(sarahRow.state, 'pending');
    // Phase Final Stage B: roster tables retired.

    // B: accept — accepted + the membership on the pair plane.
    const jessicaId = 'zyTbfbjcGEfbpCsNTP0XjX';
    const jessicaGrant = await grantTo(
        'inv-roster-jessica', 'jessica.park@company.com',
        'ev-roster-jessica-grant', '2026-06-01T00:00:01.000000Z',
    );
    assert.equal(jessicaGrant.status, 201);
    const jessicaAccept = await acceptAs(
        jessicaId, 'inv-roster-jessica', 'ms-roster-jessica',
        'ev-roster-jessica-accept', '2026-06-01T00:00:02.000000Z',
    );
    assert.equal(jessicaAccept.status, 201);
    const jessicaRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-jessica',
    )!;
    assert.equal(jessicaRow.state, 'accepted');
    const derivedJessicaMembership =
        await deriveOrganizationMemberSeat(
            db, organization, jessicaId,
        );
    assert.equal(
        derivedJessicaMembership.identity_id, jessicaId,
    );
    assert.equal(
        derivedJessicaMembership.organization_id, organization,
    );

    // C: decline.
    const emilyGrant = await grantTo(
        'inv-roster-emily', 'emily.rodriguez@company.com',
        'ev-roster-emily-grant', '2026-06-01T00:00:03.000000Z',
    );
    assert.equal(emilyGrant.status, 201);
    const emilyDecline = await declineAs(
        '53J8h9dr76XFqCjYcNVwIR', 'inv-roster-emily',
        'ev-roster-emily-decline', '2026-06-01T00:00:04.000000Z',
    );
    assert.equal(emilyDecline.status, 201);
    const emilyRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-emily',
    )!;
    assert.equal(emilyRow.state, 'declined');

    // D: revoke.
    const marcusGrant = await grantTo(
        'inv-roster-marcus', 'marcus@acmecorp.com',
        'ev-roster-marcus-grant', '2026-06-01T00:00:05.000000Z',
    );
    assert.equal(marcusGrant.status, 201);
    const marcusRevoke = await revoke(
        'inv-roster-marcus', 'ev-roster-marcus-revoke',
        '2026-06-01T00:00:06.000000Z',
    );
    assert.equal(marcusRevoke.status, 201);
    const marcusRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-marcus',
    )!;
    assert.equal(marcusRow.state, 'revoked');

    // E: duplicate grant for Sarah's SAME (org, identity) pair —
    // NO phantom invitation document.
    const beforeDerived = (await deriveInvitations(db)).length;
    const sarahDuplicate = await grantTo(
        'inv-roster-sarah-dup', 'sarah.chen@company.com',
        'ev-roster-sarah-dup-grant', '2026-06-01T00:00:07.000000Z',
    );
    assert.equal(sarahDuplicate.status, 201);
    assert.equal(
        (await deriveInvitations(db)).length, beforeDerived,
    );
    const derivedAfterDuplicate = await deriveInvitations(db);
    assert.equal(
        derivedAfterDuplicate.filter(
            (row) => row.identity_id === 'LhfaUUf4IumVsCSGB4xjdK'
                && row.organization_id === organization,
        ).length, 1,
    );

    // F: no-op re-accept — state stable, no new state event.
    const statesBefore =
        0 /* states table retired */;
    const jessicaReaccept = await acceptAs(
        jessicaId, 'inv-roster-jessica', 'ms-roster-jessica-2',
        'ev-roster-jessica-reaccept',
        '2026-06-01T00:00:08.000000Z',
    );
    assert.equal(jessicaReaccept.status, 201);
    assert.equal(
        0 /* states table retired */,
        statesBefore,
    );
});

// -- 7. method-filter proof: the create-op POST pairs are never -
// -- derived heads; exactly one document head per address after -
// -- create ---------------------------------------------------------

test('PUT ai-agents and PUT identities land exactly one'
+ ' document pair at each address — no composing POST',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-method-filter-1';
    const humanId = 'human-drift-method-filter-1';

    const aiCreated = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Filter AI'),
    ));
    assert.equal(aiCreated.status, 201);

    const aiPrefix = canonicalUriCollection(
        undefined, '/ai-agents/',
    );
    const [aiRequests, aiResponses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', aiPrefix),
        db.responses.getAllWhere('uri_collection', aiPrefix),
    ]);
    const aiDocumentPairs = documentPairsAt(
        aiRequests, aiResponses, aiPrefix,
    ).filter((pair) => pair.uriId === aiId);
    assert.equal(aiDocumentPairs.length, 1);
    assert.equal(aiDocumentPairs[0]!.method, 'PUT');

    const humanCreated = await handleRequest(db, req(
        'PUT', '/identities/' + humanId, token, {
            kind: 'person',
            title: 't',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assert.equal(humanCreated.status, 201);

    const humanPrefix = canonicalUriCollection(
        undefined, '/identities/',
    );
    const [humanRequests, humanResponses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', humanPrefix),
        db.responses.getAllWhere('uri_collection', humanPrefix),
    ]);
    const humanDocumentPairs = documentPairsAt(
        humanRequests, humanResponses, humanPrefix,
    ).filter((pair) => pair.uriId === humanId);
    assert.equal(humanDocumentPairs.length, 1);
    assert.equal(humanDocumentPairs[0]!.method, 'PUT');
});

// -- 8. resend idempotency at drift altitude --------------------

test('resend idempotency: a byte-identical ai-agents/:id PUT'
+ ' resend replays the stored response and appends NO second'
+ ' pair (the E6 fast-path at drift altitude)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-resend-1';

    const beforeCount = (await db.requests.getAll()).length;
    const body = aiMemberDocumentBody('Resend AI Facet');
    const first = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token, body,
    ));
    assert.equal(first.status, 201);
    const afterFirst = (await db.requests.getAll()).length;
    assert.equal(afterFirst, beforeCount + 1);

    const second = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiId, token, body,
    ));
    assert.equal(second.status, 201);
    const afterSecond = (await db.requests.getAll()).length;
    assert.equal(afterSecond, afterFirst);
    assert.equal(
        first.headers.get('Response-ID'),
        second.headers.get('Response-ID'),
    );

    const got = await handleRequest(
        db, req('GET', '/ai-agents/' + aiId, token),
    );
    assert.equal(
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

test('GET identity is the latest PUT under clock-skewed'
+ ' later arrival (stateless document, arrival order)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const memberId = 'mem-drift-skew-1';

    const genesis = await handleRequest(db, req(
        'PUT', '/identities/' + memberId, token, {
            kind: 'person',
            title: 'first',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assert.equal(genesis.status, 201);

    const skewed = await handleRequest(db, req(
        'PUT', '/identities/' + memberId, token, {
            kind: 'person',
            title: 'second',
            department: 'd2',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assert.equal(skewed.status, 201);

    const res = await handleRequest(
        db, req('GET', '/identities/' + memberId, token),
    );
    assert.equal(res.status, 200);
    const got = await res.json() as { title: string };
    assert.equal(got.title, 'second');
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

test('plain PUT-supersession at a seat address — a'
+ ' second PUT (an OLDER domain `at` than the first) still'
+ ' supersedes by ARRIVAL order on the pair plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const identityId = 'zyTbfbjcGEfbpCsNTP0XjX'; // Jessica Park

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
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);

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
    assert.equal(second.status, 201);

    const derived = await derivedMembership(
        db, STARK_ORGANIZATION, identityId,
    );
    assert.equal(derived.at, '2020-01-01T00:00:00.000000Z');

    const roster = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        roster.some((m) => m.id === identityId), true,
    );
});

// -- 10. THE ORPHANED-MEMBERSHIP CASE ----------------------------

test('THE UNSEATED-IDENTITY CASE: an identity created via'
+ ' postIdentityCreationOp has no seat — GET seats drops it;'
+ ' PUT seat then shows it',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const orphanId = 'orphan-drift-1';

    const created = await handleRequest(db, req(
        'PUT', '/identities/' + orphanId, token, {
            kind: 'person',
            title: '',
            department: '',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assert.equal(created.status, 201);
    const before = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        before.some((m) => m.id === orphanId), false,
    );

    const membershipPut = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/members/' + orphanId,
        token,
        { type: 'member', at: nowUtc() },
    ));
    assert.equal(membershipPut.status, 201);

    const after = await deriveOrganizationMemberSeats(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        after.some((m) => m.id === orphanId), true,
    );
    const identityGot = await handleRequest(
        db, req('GET', '/identities/' + orphanId, token),
    );
    assert.equal(identityGot.status, 200);
});
