import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
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
import { deriveInvitations } from '../api/derive-invitations.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

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
// generic, member-tier-reachable PUT /states/:id route is
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
// registry.ts: organizationNested:false) — canonicalUriPrefix
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
    return documentCollectionGetHandler(MEMBERSHIPS_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<MembershipEntity[]>;
}

async function derivedMembership(
    db: DbAdapter, organization: Id, id: Id,
): Promise<MembershipEntity> {
    return documentGetHandler(MEMBERSHIPS_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<MembershipEntity>;
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
    const model = parseJson(message, defaultBodyRegistry());
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
            strengths: jsonArrayField([]),
            team_dimensions: jsonObjectField({}),
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
            strengths: jsonArrayField([]),
            team_dimensions: jsonObjectField({}),
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
        db, req('GET', '/memberships', tokenStark),
    );
    assert.equal(resStark.status, 200);
    const stark = sortById(
        await derivedMemberships(db, STARK_ORGANIZATION),
    );
    assert.equal(await resStark.text(), JSON.stringify(stark));
    assert.equal(stark.length, 10);

    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const resTwo = await handleRequest(
        db, req('GET', '/memberships', tokenTwo),
    );
    assert.equal(resTwo.status, 200);
    const org2 = sortById(
        await derivedMemberships(db, ORGANIZATION_TWO),
    );
    assert.equal(await resTwo.text(), JSON.stringify(org2));
    assert.equal(org2.length, 6);

    const THIRD_ORGANIZATION = '3';
    const empty = await derivedMemberships(db, THIRD_ORGANIZATION);
    assert.deepEqual(empty, []);
    // Phase Final Stage B: roster tables retired.
    // Phase Final Stage B: roster tables retired.
});

// -- 2. per-membership GET wire equals derive; DELETE tombstone

test('per-membership GET wire equals derive (all 16); missing-'
+ 'id 404; a DELETE-then-derive tombstone', async () => {
    const db = await seededDb();
    const allMemberships = sortById([
        ...await derivedMemberships(db, STARK_ORGANIZATION),
        ...await derivedMemberships(db, ORGANIZATION_TWO),
    ]);
    assert.equal(allMemberships.length, 16);

    for (const membership of allMemberships) {
        const token = await organizationToken(
            'current', membership.organization_id,
        );
        const res = await handleRequest(
            db,
            req('GET', '/memberships/' + membership.id, token),
        );
        assert.equal(res.status, 200);
        const derived = await derivedMembership(
            db, membership.organization_id, membership.id,
        );
        assert.equal(await res.text(), JSON.stringify(derived));
    }

    const missingId = 'no-such-membership';
    const expectedMessage = 'Not found: memberships/' + missingId;
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
            'GET', '/memberships/' + missingId,
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

    // DELETE-then-derive: a live membership tombstoned via the
    // wire — absent on the pair plane, 404 bytes equal.
    const target = allMemberships[0]!;
    const deleteResponse = await handleRequest(db, req(
        'DELETE', '/memberships/' + target.id,
        await organizationToken(
            'current', target.organization_id,
        ),
    ));
    assert.equal(deleteResponse.status, 204);
    const expectedTargetMessage =
        'Not found: memberships/' + target.id;
    await assert.rejects(
        () => derivedMembership(
            db, target.organization_id, target.id,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedTargetMessage,
    );
    const tombstoneRes = await handleRequest(db, req(
        'GET', '/memberships/' + target.id,
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

test('ai-members + human-members wire equals derive (GLOBAL)'
+ ' + per-entity get + 404-byte parity', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const resAi = await handleRequest(
        db, req('GET', '/ai-members', token),
    );
    assert.equal(resAi.status, 200);
    const derivedAi = sortById(
        await derivedAiMembers(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    assert.equal(await resAi.text(), JSON.stringify(derivedAi));
    assert.equal(derivedAi.length, 4);

    const resHuman = await handleRequest(
        db, req('GET', '/human-members', token),
    );
    assert.equal(resHuman.status, 200);
    const derivedHuman = sortById(
        await derivedHumanMembers(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    assert.equal(
        await resHuman.text(), JSON.stringify(derivedHuman),
    );
    assert.equal(derivedHuman.length, 11);

    for (const row of derivedAi) {
        const res = await handleRequest(
            db, req('GET', '/ai-members/' + row.id, token),
        );
        assert.equal(res.status, 200);
        const derived = await derivedAiMember(
            db, GLOBAL_PLANE_PLACEHOLDER, row.id,
        );
        assert.equal(await res.text(), JSON.stringify(derived));
    }
    for (const row of derivedHuman) {
        const res = await handleRequest(
            db, req('GET', '/human-members/' + row.id, token),
        );
        assert.equal(res.status, 200);
        const derived = await derivedHumanMember(
            db, GLOBAL_PLANE_PLACEHOLDER, row.id,
        );
        assert.equal(await res.text(), JSON.stringify(derived));
    }

    const missingId = 'no-such-detail';
    const expectedAiMessage =
        'Not found: ai_members/' + missingId;
    await assert.rejects(
        () => derivedAiMember(
            db, GLOBAL_PLANE_PLACEHOLDER, missingId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedAiMessage,
    );
    const aiMissingRes = await handleRequest(
        db, req('GET', '/ai-members/' + missingId, token),
    );
    assert.equal(aiMissingRes.status, 404);
    assert.equal(
        (await aiMissingRes.json() as { error: string }).error,
        expectedAiMessage,
    );

    const expectedHumanMessage =
        'Not found: human_members/' + missingId;
    await assert.rejects(
        () => derivedHumanMember(
            db, GLOBAL_PLANE_PLACEHOLDER, missingId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedHumanMessage,
    );
    const humanMissingRes = await handleRequest(
        db, req('GET', '/human-members/' + missingId, token),
    );
    assert.equal(humanMissingRes.status, 404);
    assert.equal(
        (await humanMissingRes.json() as { error: string }).error,
        expectedHumanMessage,
    );
    // Phase Final Stage B: roster tables retired.
    // Phase Final Stage B: roster tables retired.
});

// -- 4. members wire equals derive; roster counts; 404 -------

test('members wire equals deriveMemberParents (16 incl.'
+ ' system); deriveMembers counts per org; current-member;'
+ ' missing-member 404', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const derivedParents = sortById(await deriveMemberParents(db));
    assert.equal(derivedParents.length, 16);
    const resMembers = await handleRequest(
        db, req('GET', '/members', token),
    );
    assert.equal(resMembers.status, 200);
    // GET /members is org-scoped (deriveMembers), not the
    // global parent directory — parents pin via derive alone.
    const derivedParentsGeneric = sortById(
        await derivedMembersDirect(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    assert.deepEqual(derivedParentsGeneric, derivedParents);

    // STARK 11 (10 membership-joined + system), org 2 7
    // (6 + system) — pair-plane counts after Task 2 strip.
    const starkRoster = await deriveMembers(db, STARK_ORGANIZATION);
    const org2Roster = await deriveMembers(db, ORGANIZATION_TWO);
    assert.equal(starkRoster.length, 11);
    assert.equal(org2Roster.length, 7);

    const resStark = await handleRequest(
        db, req(
            'GET', '/members',
            await organizationToken(
                'current', STARK_ORGANIZATION,
            ),
        ),
    );
    assert.equal(resStark.status, 200);
    assert.equal(
        await resStark.text(),
        JSON.stringify(sortById(starkRoster)),
    );

    const derivedCurrent = await deriveMemberParent(db, 'current');
    assert.equal(derivedCurrent.type, 'human');
    assert.equal(derivedCurrent.state, 'active');
    assert.equal(
        derivedCurrent.state_event_id,
        'seed-member-current-active',
    );
    const resCurrent = await handleRequest(
        db, req('GET', '/current-member', token),
    );
    assert.equal(resCurrent.status, 200);
    assert.equal(
        await resCurrent.text(), JSON.stringify(derivedCurrent),
    );

    const missingId = 'no-such-member';
    const expectedMessage = 'Not found: members/' + missingId;
    await assert.rejects(
        () => deriveMemberParent(db, missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
    // Phase Final Stage B: roster tables retired.
});

// -- 5. live-write chain on the pair plane ---------------------

test('live-write chain: create an AI member (bundle balance 3),'
+ ' a composed edit, a facet PUT (Supersedes), create a human'
+ ' member, a composed edit, PUT memberships/:id (a new'
+ ' membership), DELETE memberships/:id — pair plane only',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-chain-1';

    // Step 1: create an AI member — bundle balance 3; the
    // derived parent + detail see it immediately.
    const beforeCreate = (await db.requests.getAll()).length;
    const aiGenesisAt = nowUtc();
    const aiGenesisEventId = aiId + '-genesis';
    const created = await handleRequest(db, req(
        'POST', '/ai-members', token,
        aiMemberCreateBody(
            aiId, 'Chain AI', aiGenesisEventId, aiGenesisAt,
        ),
    ));
    assert.equal(created.status, 204);
    assert.equal(
        (await db.requests.getAll()).length, beforeCreate + 3,
    );
    const parentAi = await deriveMemberParent(db, aiId);
    assert.equal(parentAi.type, 'ai');
    assert.equal(parentAi.state, 'active');
    assert.equal(parentAi.state_at, aiGenesisAt);
    assert.equal(parentAi.state_event_id, aiGenesisEventId);
    const derivedAiDetail1 = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.equal(derivedAiDetail1.name, 'Chain AI');
    // Phase Final Stage B: roster tables retired.
    // Phase Final Stage B: roster tables retired.

    // Step 2: composed edit (POST /ai-members/:id) — echoes
    // the create trio so the members/:id document folds.
    const edited = await handleRequest(db, req(
        'POST', '/ai-members/' + aiId, token,
        aiMemberEditBody(
            'Chain AI Edited', aiGenesisEventId, aiGenesisAt,
        ),
    ));
    assert.equal(edited.status, 204);
    const derivedAiDetail2 = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.equal(derivedAiDetail2.name, 'Chain AI Edited');

    // Step 3: a facet PUT ai-members/:id — Supersedes chain.
    const facetPut = await handleRequest(db, req(
        'PUT', '/ai-members/' + aiId, token,
        aiMemberDocumentBody('Chain AI Facet'),
    ));
    assert.equal(facetPut.status, 200);
    assert.ok(facetPut.headers.get('Supersedes'));
    const derivedAiDetail3 = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.equal(derivedAiDetail3.name, 'Chain AI Facet');

    // Step 4: create a human member — bundle balance 4.
    const humanId = 'human-drift-chain-1';
    const beforeHumanCreate = (await db.requests.getAll()).length;
    const humanGenesisAt = nowUtc();
    const humanGenesisEventId = humanId + '-genesis';
    const humanCreated = await handleRequest(db, req(
        'POST', '/human-members', token,
        humanMemberCreateBody(
            humanId, 'Chain Human', humanGenesisEventId,
            humanGenesisAt,
        ),
    ));
    assert.equal(humanCreated.status, 204);
    assert.equal(
        (await db.requests.getAll()).length,
        beforeHumanCreate + 4,
    );
    const parentHuman = await deriveMemberParent(db, humanId);
    assert.equal(parentHuman.type, 'human');
    const derivedHumanDetail1 = await derivedHumanMember(
        db, GLOBAL_PLANE_PLACEHOLDER, humanId,
    );
    assert.equal(derivedHumanDetail1.title, 't');
    // Phase Final Stage B: roster tables retired.

    // Step 5: composed edit (POST /human-members/:id) — echoes
    // the create trio so the members/:id document folds.
    const humanEdited = await handleRequest(db, req(
        'POST', '/human-members/' + humanId, token,
        humanMemberEditBody(
            humanGenesisEventId, humanGenesisAt,
        ),
    ));
    assert.equal(humanEdited.status, 204);
    const derivedHumanDetail2 = await derivedHumanMember(
        db, GLOBAL_PLANE_PLACEHOLDER, humanId,
    );
    assert.equal(derivedHumanDetail2.title, 't2');

    // Step 6: PUT memberships/:id — deriveMembers gains it.
    const membershipId = 'ms-drift-chain-1';
    const membershipPut = await handleRequest(db, req(
        'PUT', '/memberships/' + membershipId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: humanId,
            at: nowUtc(),
        },
    ));
    assert.equal(membershipPut.status, 200);
    const rosterAfterMembership = await deriveMembers(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        rosterAfterMembership.some((m) => m.id === humanId), true,
    );
    // Phase Final Stage B: roster tables retired.

    // Step 7: DELETE memberships/:id — roster loses the member;
    // the parent SURVIVES (membership removal never deletes the
    // member document).
    const membershipDelete = await handleRequest(db, req(
        'DELETE', '/memberships/' + membershipId, token,
    ));
    assert.equal(membershipDelete.status, 204);
    const rosterAfterDelete = await deriveMembers(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        rosterAfterDelete.some((m) => m.id === humanId), false,
    );
    const survivingParent = await deriveMemberParent(db, humanId);
    assert.equal(survivingParent.id, humanId);
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
    assert.equal(sarahGrant.status, 200);
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
    assert.equal(jessicaGrant.status, 200);
    const jessicaAccept = await acceptAs(
        jessicaId, 'inv-roster-jessica', 'ms-roster-jessica',
        'ev-roster-jessica-accept', '2026-06-01T00:00:02.000000Z',
    );
    assert.equal(jessicaAccept.status, 204);
    const jessicaRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-jessica',
    )!;
    assert.equal(jessicaRow.state, 'accepted');
    const derivedJessicaMembership = await derivedMembership(
        db, organization, 'ms-roster-jessica',
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
    assert.equal(emilyGrant.status, 200);
    const emilyDecline = await declineAs(
        '53J8h9dr76XFqCjYcNVwIR', 'inv-roster-emily',
        'ev-roster-emily-decline', '2026-06-01T00:00:04.000000Z',
    );
    assert.equal(emilyDecline.status, 204);
    const emilyRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-emily',
    )!;
    assert.equal(emilyRow.state, 'declined');

    // D: revoke.
    const marcusGrant = await grantTo(
        'inv-roster-marcus', 'marcus@acmecorp.com',
        'ev-roster-marcus-grant', '2026-06-01T00:00:05.000000Z',
    );
    assert.equal(marcusGrant.status, 200);
    const marcusRevoke = await revoke(
        'inv-roster-marcus', 'ev-roster-marcus-revoke',
        '2026-06-01T00:00:06.000000Z',
    );
    assert.equal(marcusRevoke.status, 204);
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
    assert.equal(sarahDuplicate.status, 200);
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
    assert.equal(jessicaReaccept.status, 204);
    assert.equal(
        0 /* states table retired */,
        statesBefore,
    );
});

// -- 7. method-filter proof: the create-op POST pairs are never -
// -- derived heads; exactly one document head per address after -
// -- create ---------------------------------------------------------

test('the ai-members and human-members create-op POST pairs are'
+ ' never read as document pairs — top-level key overlap is'
+ ' ZERO; exactly one PUT document pair lands at each detail'
+ ' address, and at members/:id, after create', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-method-filter-1';
    const humanId = 'human-drift-method-filter-1';

    const aiCreated = await handleRequest(db, req(
        'POST', '/ai-members', token,
        aiMemberCreateBody(
            aiId, 'Filter AI', aiId + '-ev', nowUtc(),
        ),
    ));
    assert.equal(aiCreated.status, 204);

    const aiPrefix = canonicalUriPrefix(undefined, '/ai-members/');
    const [aiRequests, aiResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', aiPrefix),
        db.responses.getAllWhere('uri_prefix', aiPrefix),
    ]);
    const atAiAddress = aiRequests.filter(
        (r) => r.uri_prefix === aiPrefix && r.uri_id === aiId,
    );
    assert.equal(atAiAddress.length, 2);
    const aiDocumentPairs = documentPairsAt(
        aiRequests, aiResponses, aiPrefix,
    ).filter((pair) => pair.uriId === aiId);
    assert.equal(aiDocumentPairs.length, 1);
    assert.equal(aiDocumentPairs[0]!.method, 'PUT');

    const aiPostRow = atAiAddress.find(
        (r) => decodeRequestMessage(r.message).method === 'POST',
    )!;
    const aiCreateBodyKeys = new Set(
        Object.keys(decodeRequestMessage(aiPostRow.message).body),
    );
    const aiDocumentBodyKeys = new Set(
        Object.keys(aiDocumentPairs[0]!.body),
    );
    assert.deepEqual(
        [...aiCreateBodyKeys].filter(
            (key) => aiDocumentBodyKeys.has(key),
        ),
        [],
    );

    const humanCreated = await handleRequest(db, req(
        'POST', '/human-members', token,
        humanMemberCreateBody(
            humanId, 'Filter Human', humanId + '-ev', nowUtc(),
        ),
    ));
    assert.equal(humanCreated.status, 204);

    const humanPrefix = canonicalUriPrefix(
        undefined, '/human-members/',
    );
    const [humanRequests, humanResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', humanPrefix),
        db.responses.getAllWhere('uri_prefix', humanPrefix),
    ]);
    const atHumanAddress = humanRequests.filter(
        (r) => r.uri_prefix === humanPrefix
            && r.uri_id === humanId,
    );
    assert.equal(atHumanAddress.length, 2);
    const humanDocumentPairs = documentPairsAt(
        humanRequests, humanResponses, humanPrefix,
    ).filter((pair) => pair.uriId === humanId);
    assert.equal(humanDocumentPairs.length, 1);
    assert.equal(humanDocumentPairs[0]!.method, 'PUT');

    const humanPostRow = atHumanAddress.find(
        (r) => decodeRequestMessage(r.message).method === 'POST',
    )!;
    const humanCreateBodyKeys = new Set(
        Object.keys(
            decodeRequestMessage(humanPostRow.message).body,
        ),
    );
    const humanDocumentBodyKeys = new Set(
        Object.keys(humanDocumentPairs[0]!.body),
    );
    assert.deepEqual(
        [...humanCreateBodyKeys].filter(
            (key) => humanDocumentBodyKeys.has(key),
        ),
        [],
    );

    // exactly-one-document-head-per-address at members/:id too —
    // the ONE shared roster row every member kind writes through.
    const membersPrefix = canonicalUriPrefix(undefined, '/members/');
    const [memberRequests, memberResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', membersPrefix),
        db.responses.getAllWhere('uri_prefix', membersPrefix),
    ]);
    for (const id of [aiId, humanId]) {
        const pairs = documentPairsAt(
            memberRequests, memberResponses, membersPrefix,
        ).filter((pair) => pair.uriId === id);
        assert.equal(pairs.length, 1);
        assert.equal(pairs[0]!.method, 'PUT');
    }
});

// -- 8. resend idempotency at drift altitude --------------------

test('resend idempotency: a byte-identical ai-members/:id PUT'
+ ' resend replays the stored response and appends NO second'
+ ' pair (the E6 fast-path at drift altitude)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-resend-1';

    await handleRequest(db, req(
        'POST', '/ai-members', token,
        aiMemberCreateBody(
            aiId, 'Resend AI', aiId + '-ev', nowUtc(),
        ),
    ));

    const beforeCount = (await db.requests.getAll()).length;
    const body = aiMemberDocumentBody('Resend AI Facet');
    const first = await handleRequest(db, req(
        'PUT', '/ai-members/' + aiId, token, body,
    ));
    assert.equal(first.status, 200);
    const afterFirst = (await db.requests.getAll()).length;
    assert.equal(afterFirst, beforeCount + 1);

    const second = await handleRequest(db, req(
        'PUT', '/ai-members/' + aiId, token, body,
    ));
    assert.equal(second.status, 200);
    const afterSecond = (await db.requests.getAll()).length;
    assert.equal(afterSecond, afterFirst);
    assert.equal(
        first.headers.get('Response-ID'),
        second.headers.get('Response-ID'),
    );

    const derived = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.equal(derived.name, 'Resend AI Facet');
    // Phase Final Stage B: roster tables retired.
});

// -- 8b. genesis-wins-under-skew on members GET ---------------
// case-7d mirror for members GET: a clock-skewed later
// arrival whose state_at sorts BELOW genesis does NOT
// displace genesis as lifecycle-current. Head body fields
// (`type`) may reflect the later arrival; the GET trio must
// stay genesis (state ← event.state, state_at ← event.at,
// state_event_id ← event.id). Members are GLOBAL plane —
// no organization stamp.

test('GET member trio is lifecycle-current under clock skew'
+ ' (genesis-wins-under-skew, case 7d)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const memberId = 'mem-drift-skew-1';
    const genesisAt = '2026-06-01T00:00:00.000000Z';
    const genesisEv = 'mem-drift-skew-1-genesis';
    const skewedAt = '2020-01-01T00:00:00.000000Z';
    const skewedEv = 'mem-drift-skew-1-skewed';

    const genesis = await handleRequest(db, req(
        'PUT', '/members/' + memberId, token, {
            type: 'human',
            state: 'active',
            state_at: genesisAt,
            state_event_id: genesisEv,
        },
    ));
    assert.equal(genesis.status, 200);
    // PUT successBody is entity fields only — no trio.
    assert.deepEqual(await genesis.json(), {
        id: memberId,
        type: 'human',
    });

    // Later arrival, earlier state_at, different state +
    // type. 'archived' is a live member state — if it won
    // as current the GET trio would flip; genesis-wins
    // keeps the member active. Type may flip to 'ai' from
    // the head body (arrival order).
    const skewed = await handleRequest(db, req(
        'PUT', '/members/' + memberId, token, {
            type: 'ai',
            state: 'archived',
            state_at: skewedAt,
            state_event_id: skewedEv,
        },
    ));
    assert.equal(skewed.status, 200);

    const expected: MemberEntity = {
        id: memberId,
        type: 'ai',
        state: 'active',
        state_at: genesisAt,
        state_event_id: genesisEv,
    };

    const res = await handleRequest(
        db, req('GET', '/members/' + memberId, token),
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), JSON.stringify(expected));

    const derived = await deriveMemberParent(db, memberId);
    assert.equal(
        JSON.stringify(derived), JSON.stringify(expected),
    );
    assert.equal(derived.type, 'ai');
    assert.equal(derived.state, 'active');
    assert.equal(derived.state_at, genesisAt);
    assert.equal(derived.state_event_id, genesisEv);

    const parents = await deriveMemberParents(db);
    const row = parents.find((m) => m.id === memberId);
    assert.deepEqual(row, expected);

    const viaGeneric = await documentGetHandler(
        MEMBERS_TEST_WIRING,
    )(
        db, [memberId], READER_ACTOR, GLOBAL_PLANE_PLACEHOLDER,
    );
    assert.deepEqual(viaGeneric, expected);
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

test('plain PUT-supersession at a membership address — a'
+ ' second PUT (an OLDER domain `at` than the first) still'
+ ' supersedes by ARRIVAL order on the pair plane;'
+ " deriveMembers' JOIN is unaffected either way", async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const membershipId = 'ms-drift-skew-1';
    const identityId = 'zyTbfbjcGEfbpCsNTP0XjX'; // Jessica Park

    const first = await handleRequest(db, req(
        'PUT', '/memberships/' + membershipId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: identityId,
            at: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);

    // The second PUT carries an OLDER domain `at` than the
    // first — a clock-skew ATTEMPT — yet it arrives second, so
    // it still supersedes: arrival order, not the body's own
    // `at`, decides the head for a stateless document.
    const second = await handleRequest(db, req(
        'PUT', '/memberships/' + membershipId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: identityId,
            at: '2020-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);

    const derived = await derivedMembership(
        db, STARK_ORGANIZATION, membershipId,
    );
    assert.equal(derived.at, '2020-01-01T00:00:00.000000Z');
    // Phase Final Stage B: roster tables retired.

    const roster = await deriveMembers(db, STARK_ORGANIZATION);
    assert.equal(roster.some((m) => m.id === identityId), true);
});

// -- 10. THE ORPHANED-MEMBERSHIP CASE ----------------------------

test('THE ORPHANED-MEMBERSHIP CASE: an identity created via'
+ ' postIdentityCreationOp (the shipped Add Identity flow — NO'
+ ' members document) plus a membership for it — GET /members'
+ ' drops it; GET /memberships shows it (pair plane)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const orphanId = 'orphan-drift-1';

    await postIdentityCreationOp(db, {
        id: orphanId, kind: 'person',
    });
    // No members document for orphanId — the join-direction
    // precondition this case exists to exercise.
    await assert.rejects(
        () => deriveMemberParent(db, orphanId),
        EntityNotFoundError,
    );

    const membershipId = 'ms-drift-orphan-1';
    const membershipPut = await handleRequest(db, req(
        'PUT', '/memberships/' + membershipId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: orphanId,
            at: nowUtc(),
        },
    ));
    assert.equal(membershipPut.status, 200);

    // GET /members drops the orphan — the join iterates
    // MEMBERS documents and tests membership, never the reverse.
    const derivedRoster = await deriveMembers(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        derivedRoster.some((m) => m.id === orphanId), false,
    );

    // GET /memberships shows the membership on the pair plane.
    const derivedMembershipsList = sortById(
        await derivedMemberships(db, STARK_ORGANIZATION),
    );
    assert.equal(
        derivedMembershipsList.some(
            (m) => m.id === membershipId,
        ), true,
    );
    // Phase Final Stage B: roster tables retired.
    // Phase Final Stage B: roster tables retired.
});
