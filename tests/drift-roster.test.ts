import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    MembershipEntity,
} from '../shared/types.ts';
import { canonicalPath } from '../api/message-pair.ts';
import { documentMessagePairsAt } from '../api/derive-documents.ts';
import type { ViewQuery } from '../api/membership-gate.ts';
import {
    membershipOf,
    membershipOfHead,
    organizationMembershipHeads,
} from '../api/memberships.ts';
import { deriveInvitations } from '../api/derive-invitations.ts';
import { deriveIdentityKinds } from
    '../api/derive-identity-spine.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    assertPartsAreHeads,
    membershipJoinReader,
    pairIdOf,
    partBodiesOf,
    partsOf,
    invitationLatched,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

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
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
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

const ACCEPTED_VIEW: ViewQuery = {
    kind: 'state',
    state: 'accepted',
};

async function acceptedMemberships(
    db: DbAdapter, organization: Id,
): Promise<MembershipEntity[]> {
    const heads = await organizationMembershipHeads(
        db, organization, ACCEPTED_VIEW,
    );
    return heads.map(membershipOfHead);
}

// The wire joins each seat's identity kind to the stored
// membership; every seeded seat's identity has a document.
function withIdentityKind(
    rows: readonly MembershipEntity[],
    kinds: ReadonlyMap<Id, string>,
) {
    return rows.map((row) => ({
        ...row,
        identity_kind: kinds.get(row.identity_id),
    }));
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

Deno.test('seeded GET memberships wire equals the accepted'
+ ' view, both orgs (the 10/6 split), plus the empty-'
+ ' organization leg',
async () => {
    const db = await seededDb();
    const kinds = await deriveIdentityKinds(db);

    const tokenStark = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const resStark = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/memberships/?state=accepted',
            tokenStark,
        ),
    );
    assertStrictEquals(resStark.status, 200);
    const stark = await acceptedMemberships(
        db, STARK_ORGANIZATION,
    );
    const starkParts = await partsOf<MembershipEntity>(resStark);
    await assertPartsAreHeads(
        db, starkParts, await membershipJoinReader(db, starkParts),
    );
    assertEquals(
        sortById(starkParts.map((part) => part.body().toValue())),
        sortById(withIdentityKind(stark, kinds)),
    );
    assertStrictEquals(stark.length, 10);
    const starkSeats = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + STARK_ORGANIZATION
                + '/members/',
            tokenStark,
        ),
    );
    assertStrictEquals(starkSeats.status, 404);

    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const resTwo = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/memberships/?state=accepted',
            tokenTwo,
        ),
    );
    assertStrictEquals(resTwo.status, 200);
    const org2 = await acceptedMemberships(
        db, ORGANIZATION_TWO,
    );
    const twoParts = await partsOf<MembershipEntity>(resTwo);
    await assertPartsAreHeads(
        db, twoParts, await membershipJoinReader(db, twoParts),
    );
    assertEquals(
        sortById(twoParts.map((part) => part.body().toValue())),
        sortById(withIdentityKind(org2, kinds)),
    );
    assertStrictEquals(org2.length, 6);

    const THIRD_ORGANIZATION = '3';
    const empty = await acceptedMemberships(
        db, THIRD_ORGANIZATION,
    );
    assertEquals(empty, []);
});

// -- 3. ai-members + human-members wire equals derive ----------

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

Deno.test('ai-agents wire is global; identities wire is'
+ ' the accepted roster', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const resAi = await handleRequest(
        db, req(
            'GET', '/organizations/' + STARK_ORGANIZATION + '/ai-agents/',
            token,
        ),
    );
    assertStrictEquals(resAi.status, 200);
    const agents = await partBodiesOf<{ id: string }>(resAi);
    assertStrictEquals(agents.length, 4);

    const resHuman = await handleRequest(
        db, req('GET', '/identities/', token),
    );
    assertStrictEquals(resHuman.status, 200);
    const identities = await partBodiesOf<{
        id: string;
        kind: string;
    }>(resHuman);
    const heads = await organizationMembershipHeads(
        db, STARK_ORGANIZATION, {
            kind: 'state', state: 'accepted',
        },
    );
    const seatedIds = new Set(heads.map(
        (head) => membershipOfHead(head).identity_id,
    ));
    const people = identities.filter(
        (row) => row.kind === 'person',
    );
    assert(people.length > 0);
    assert(identities.every((row) => seatedIds.has(row.id)));

    for (const row of agents) {
        const res = await handleRequest(
            db, req(
                'GET', '/organizations/' + STARK_ORGANIZATION
                    + '/ai-agents/' + row.id,
                token,
            ),
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
        db, req(
            'GET', '/organizations/' + STARK_ORGANIZATION
                + '/ai-agents/' + missingId,
            token,
        ),
    );
    assertStrictEquals(aiMissingRes.status, 404);
    assertStrictEquals(
        (await aiMissingRes.json() as { error: string }).error,
        expectedAiMessage,
    );

    const missingPath = '/identities/' + missingId;
    const humanMissingRes = await handleRequest(
        db, req('GET', missingPath, token),
    );
    assertStrictEquals(humanMissingRes.status, 403);
    assertEquals(await humanMissingRes.json(), {
        error: outside('GET', missingPath),
    });
});

// -- 4. current identity wire ---------------------------------

Deno.test('GET the current identity returns the person',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
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
});

// -- 5. live-write chain on the message plane ------------------

Deno.test('live-write chain: PUT ai-agents, PUT identity'
+ ' — message plane only',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = generateIdentifier();

    const beforeCreate = (await db.messagePairs.getAll()).length;
    const created = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Chain AI'),
    ));
    assertStrictEquals(created.status, 201);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, beforeCreate + 1,
    );
    const agent1 = await handleRequest(
        db, req(
            'GET', '/organizations/' + STARK_ORGANIZATION
                + '/ai-agents/' + aiId,
            token,
        ),
    );
    assertStrictEquals(agent1.status, 200);
    assertStrictEquals(
        ((await agent1.json()) as { name: string }).name,
        'Chain AI',
    );

    const facetPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Chain AI Facet'),
    ));
    assertStrictEquals(facetPut.status, 200);
    const agent2 = await handleRequest(
        db, req(
            'GET', '/organizations/' + STARK_ORGANIZATION
                + '/ai-agents/' + aiId,
            token,
        ),
    );
    assertStrictEquals(
        ((await agent2.json()) as { name: string }).name,
        'Chain AI Facet',
    );

    const humanId = generateIdentifier();
    const beforeHumanCreate = (await db.messagePairs.getAll()).length;
    const humanPath = '/identities/' + humanId;
    const humanCreated = await handleRequest(db, req(
        'PUT', humanPath, token, {
            kind: 'person',
            title: 't',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(humanCreated.status, 403);
    assertEquals(await humanCreated.json(), {
        error: outside('PUT', humanPath),
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        beforeHumanCreate,
    );
});

// -- 6. invitations lifecycle on the message plane -------------

Deno.test('invitations lifecycle: fresh grant → pending; accept →'
+ ' accepted + membership on message plane; decline; revoke;'
+ ' duplicate grant stores nothing; a repeated accept is 409',
async () => {
    const db = await seededDb();
    const organization = ORGANIZATION_TWO;
    const adminToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const sarahId = 'MQFcPtrZPIGjMCRAXtZUnA';
    const jessicaId = 'zyGBRshxOnKHUfcyFRqowg';
    const emilyId = 'CJrglMsNBxOWWfbihHQSeg';
    const marcusId = 'SsVAZghfSzMZRZmxNKIizw';
    const sarahName = membershipNameOf(organization, sarahId);
    const jessicaName = membershipNameOf(
        organization, jessicaId,
    );
    const emilyName = membershipNameOf(organization, emilyId);
    const marcusName = membershipNameOf(
        organization, marcusId,
    );

    async function inviteTo(
        email: string, at: string,
    ): Promise<Response> {
        return handleRequest(db, req(
            'POST',
            '/organizations/' + organization
                + '/invitations/',
            adminToken,
            {
                email,
                at,
                expiresAt: '2099-12-31T00:00:00.000000Z',
            },
        ));
    }

    async function acceptAs(
        invitee: string, acceptAt: string,
    ): Promise<Response> {
        const name = membershipNameOf(organization, invitee);
        return handleRequest(db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + invitee
                + '/invitations/' + name,
            await organizationToken(invitee, STARK_ORGANIZATION),
            { state: 'accepted', at: acceptAt },
        )));
    }

    async function declineAs(
        invitee: string, declineAt: string,
    ): Promise<Response> {
        const name = membershipNameOf(organization, invitee);
        return handleRequest(db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + invitee
                + '/invitations/' + name,
            await organizationToken(invitee, STARK_ORGANIZATION),
            { state: 'declined', at: declineAt },
        )));
    }

    async function revoke(
        identity: string, revokeAt: string,
    ): Promise<Response> {
        const name = membershipNameOf(organization, identity);
        return handleRequest(db, await invitationLatched(db, req(
            'PUT',
            '/organizations/' + organization
                + '/invitations/' + name,
            adminToken,
            { state: 'revoked', at: revokeAt },
        )));
    }

    // A: fresh grant — pending, named by the pair.
    const sarahGrant = await inviteTo(
        'sarah.chen@company.com',
        '2026-06-01T00:00:00.000000Z',
    );
    assertStrictEquals(sarahGrant.status, 201);
    const sarahRow = (await deriveInvitations(db)).find(
        (row) => row.id === sarahName,
    )!;
    assertStrictEquals(sarahRow.state, 'pending');
    // Phase Final Stage B: roster tables retired.

    // B: accept — accepted + the membership on the message plane.
    const jessicaGrant = await inviteTo(
        'jessica.park@company.com',
        '2026-06-01T00:00:01.000000Z',
    );
    assertStrictEquals(jessicaGrant.status, 201);
    const jessicaAccept = await acceptAs(
        jessicaId, '2026-06-01T00:00:02.000000Z',
    );
    assertStrictEquals(jessicaAccept.status, 200);
    const jessicaRow = (await deriveInvitations(db)).find(
        (row) => row.id === jessicaName,
    )!;
    assertStrictEquals(jessicaRow.state, 'accepted');
    const jessicaMembership = await membershipOf(
        db, organization, jessicaId,
    );
    assert(jessicaMembership !== null);
    assertStrictEquals(
        jessicaMembership.identity_id, jessicaId,
    );
    assertStrictEquals(
        jessicaMembership.organization_id, organization,
    );
    assertStrictEquals(jessicaMembership.state, 'accepted');
    const acceptedView = await handleRequest(db, req(
        'GET',
        '/organizations/' + organization
            + '/memberships/?state=accepted',
        adminToken,
    ));
    assertStrictEquals(acceptedView.status, 200);
    const acceptedBodies = await partBodiesOf<MembershipEntity>(
        acceptedView,
    );
    assert(
        acceptedBodies.some((row) =>
            row.identity_id === jessicaId
            && row.organization_id === organization
            && row.state === 'accepted'
        ),
    );
    const seats = await handleRequest(db, req(
        'GET',
        '/organizations/' + organization + '/members/',
        adminToken,
    ));
    assertStrictEquals(seats.status, 404);

    // C: decline.
    const emilyGrant = await inviteTo(
        'emily.rodriguez@company.com',
        '2026-06-01T00:00:03.000000Z',
    );
    assertStrictEquals(emilyGrant.status, 201);
    const emilyDecline = await declineAs(
        emilyId, '2026-06-01T00:00:04.000000Z',
    );
    assertStrictEquals(emilyDecline.status, 200);
    const emilyRow = (await deriveInvitations(db)).find(
        (row) => row.id === emilyName,
    )!;
    assertStrictEquals(emilyRow.state, 'declined');

    // D: revoke.
    const marcusGrant = await inviteTo(
        'marcus@acmecorp.com',
        '2026-06-01T00:00:05.000000Z',
    );
    assertStrictEquals(marcusGrant.status, 201);
    const marcusRevoke = await revoke(
        marcusId, '2026-06-01T00:00:06.000000Z',
    );
    assertStrictEquals(marcusRevoke.status, 200);
    const marcusRow = (await deriveInvitations(db)).find(
        (row) => row.id === marcusName,
    )!;
    assertStrictEquals(marcusRow.state, 'revoked');

    // E: a second grant of Sarah's pending membership stores
    // nothing and does not open another document.
    const beforeDerived = (await deriveInvitations(db)).length;
    const sarahDuplicate = await inviteTo(
        'sarah.chen@company.com',
        '2026-06-01T00:00:07.000000Z',
    );
    assertStrictEquals(sarahDuplicate.status, 200);
    assertStrictEquals(
        (await deriveInvitations(db)).length, beforeDerived,
    );
    const derivedAfterDuplicate = await deriveInvitations(db);
    assertStrictEquals(
        derivedAfterDuplicate.filter(
            (row) => row.identity_id === sarahId
                && row.organization_id === organization,
        ).length, 1,
    );

    // F: a repeated accept latched on the accepted head is 409.
    const statesBefore =
        0 /* states table retired */;
    const jessicaReaccept = await acceptAs(
        jessicaId, '2026-06-01T00:00:08.000000Z',
    );
    assertStrictEquals(jessicaReaccept.status, 409);
    assertStrictEquals(
        (await deriveInvitations(db)).find(
            (row) => row.id === jessicaName,
        )!.state,
        'accepted',
    );
    assertStrictEquals(
        0 /* states table retired */,
        statesBefore,
    );
});

// -- 7. method-filter proof: the create-op POST pairs are never -
// -- derived heads; exactly one document head per document after -
// -- create ---------------------------------------------------------

Deno.test('PUT ai-agents and PUT identities land exactly one'
+ ' document message pair at each document — no composing POST',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = AI_DRIFT_METHOD_FILTER_1;
    const humanId = HUMAN_DRIFT_METHOD_FILTER_1;

    const aiCreated = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/ai-agents/' + aiId, token,
        aiMemberDocumentBody('Filter AI'),
    ));
    assertStrictEquals(aiCreated.status, 201);

    const aiPrefix = canonicalPath(
        STARK_ORGANIZATION, '/ai-agents/',
    );
    const [aiRequests] = await Promise.all([
        db.messagePairs.getCollectionPairs(aiPrefix),
        db.messagePairs.getCollectionPairs(aiPrefix),
    ]);
    const aiDocumentMessagePairs = documentMessagePairsAt(
        aiRequests, aiPrefix,
    ).filter((messagePair) => messagePair.name === aiId);
    assertStrictEquals(aiDocumentMessagePairs.length, 1);
    assertStrictEquals(aiDocumentMessagePairs[0]!.method, 'PUT');

    const humanPath = '/identities/' + humanId;
    const humanCreated = await handleRequest(db, req(
        'PUT', humanPath, token, {
            kind: 'person',
            title: 't',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(humanCreated.status, 403);
    assertEquals(await humanCreated.json(), {
        error: outside('PUT', humanPath),
    });

    const humanPrefix = canonicalPath(
        undefined, '/identities/',
    );
    const [humanRequests] = await Promise.all([
        db.messagePairs.getCollectionPairs(humanPrefix),
        db.messagePairs.getCollectionPairs(humanPrefix),
    ]);
    const humanDocumentMessagePairs = documentMessagePairsAt(
        humanRequests, humanPrefix,
    ).filter((messagePair) => messagePair.name === humanId);
    assertStrictEquals(humanDocumentMessagePairs.length, 0);
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
    const operationId = generateIdentifier();
    const first = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/ai-agents/' + aiId, token, body,
        operationId,
    ));
    assertStrictEquals(first.status, 201);
    const afterFirst = (await db.messagePairs.getAll()).length;
    assertStrictEquals(afterFirst, beforeCount + 1);

    const second = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/ai-agents/' + aiId, token, body,
        operationId,
    ));
    assertStrictEquals(second.status, 200);
    const afterSecond = (await db.messagePairs.getAll()).length;
    assertStrictEquals(afterSecond, afterFirst);
    assertStrictEquals(
        pairIdOf(first),
        pairIdOf(second),
    );

    const got = await handleRequest(
        db, req(
            'GET', '/organizations/' + STARK_ORGANIZATION
                + '/ai-agents/' + aiId,
            token,
        ),
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

Deno.test('a membership-less identity PUT is forbidden',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const memberId = generateIdentifier();
    const path = '/identities/' + memberId;
    const before = (await db.messagePairs.getAll()).length;
    const genesis = await handleRequest(db, req(
        'PUT', path, token, {
            kind: 'person',
            title: 'first',
            department: 'd',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(genesis.status, 403);
    assertEquals(await genesis.json(), {
        error: outside('PUT', path),
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
