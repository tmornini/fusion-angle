import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
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
import { organizationScopedAdapter } from
    '../api/db-organization-scoped.ts';
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

// The E10 drift check (Phase 8 Task 7): message-derived reads
// proven equal to the old-table-derived reads Task 8 flips onto
// them. NOTHING reads api/derive-members.ts in production yet —
// this file alone gates that flip; it stays as a regression guard
// through Phase Final.
//
// The roster is FOUR document families at once: members (the
// shared parent), memberships (the pure join relation), and
// ai-members/human-members (the two kind-specific facets) — plus
// invitations, whose grant/accept/decline/revoke side channel
// this file also drift-proves (deriveInvitations, Task 6), since
// an accept's membership synthesis is the roster's own last write
// path. Hand-builds FOUR *_TEST_WIRING mirrors of routes.ts's
// module-private wiring rows (the drift-records/drift-objectives
// precedent) so the generic-handler cases exercise the ACTUAL
// documentCollectionGetHandler/documentGetHandler — the same code
// path Task 8 wires live, never a reimplementation. Old plane
// reads via organizationScopedAdapter (org-nested memberships)
// and the BASE adapter (the global directory + invitations) —
// NEVER through handleRequest, so the comparison survives the
// flip.
//
// H7: id-lex explicit sorts bind EVERY case below, not only the
// collection ones — the memory tier's own getAll/getAllWhere is
// insertion-ordered, while every derived collection (api/derive-
// members.ts, api/derive-invitations.ts, and the generic
// document-family.ts handlers alike) sorts byIdAscending by
// construction. A case that skipped the old-plane sort would
// pass or fail by ACCIDENT of insertion order, never by the
// property it claims to prove.
//
// THE STATES/:ID ESCAPE HATCH (roster edition, Author gate 12 as
// RE-GRADED): every EntityStore — members, memberships,
// ai_members, human_members alike — consults the SAME shared
// states-log tombstone (EntityStore.getById/getAll/getAllWhere
// each call StateStore.isDeletedIn/getDeletedIdsIn) before
// answering. A hand-crafted 'deleted' state event posted through
// the generic, member-tier-reachable PUT /states/:id route (a
// pre-existing, cross-family fact — MEMBER_VERBS['/states'] =
// ['GET', 'PUT'] in api/authorization.ts) would hide such a row
// on the OLD plane while api/derive-members.ts's own ledger
// derivation — which consults no states row at all — still shows
// it. This is a NAMED divergence acceptance, NOT drift-tested
// here: pinning parity for it would pin a divergence the OLD
// plane loses, not a property this migration owns. Outside that
// one escape hatch, the deleted-filter is otherwise VACUOUS for
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
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// -- test-side wiring mirrors (routes.ts's private rows, by ----
// -- content — every family's wiring row is module-private) -----

const MEMBERS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'members',
    lifecycle: 'stateless',
    notFoundTable: 'members',
    validateDocument: validateMemberDocumentBody,
    documentOp: postMemberDocumentOp,
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

function aiMemberEditBody(name: string): Record<string, unknown> {
    return {
        detail: {
            name,
            description: 'd2',
            skill_focus: 'sf2',
            model: 'mnte677fU2G1V2B9vJp9z7',
        },
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
function humanMemberEditBody(): Record<string, unknown> {
    return {
        detail: {
            title: 't2', department: 'd2',
            strengths: jsonArrayField([]),
            team_dimensions: jsonObjectField({}),
        },
    };
}

// -- old-plane invitations: invitations.getAll() + a per-row ---
// -- states.getCurrentFor reduction (invitations-domain.ts's ---
// -- own currentInvitationState, re-derived here rather than a --
// -- second, hand-rolled copy of its default-'pending' rule) ----

interface OldInvitationRow {
    readonly id: string;
    readonly organization_id: string;
    readonly identity_id: string;
    readonly at: string;
    readonly state: string;
}

async function oldInvitations(
    db: DbAdapter,
): Promise<OldInvitationRow[]> {
    const rows = await db.invitations.getAll();
    const out: OldInvitationRow[] = [];
    for (const row of rows) {
        const current = await db.states.getCurrentFor(row.id);
        out.push({
            id: row.id,
            organization_id: row.organization_id,
            identity_id: row.identity_id,
            at: row.at,
            state: current === null ? 'pending' : current.state,
        });
    }
    return out;
}

// -- 1. memberships collection parity, both orgs (the 10/6 -----
// -- split) + the empty-organization leg -------------------------

test('memberships collection: message-derived equals old-'
+ 'table-derived, both orgs (the 10/6 split), plus the empty-'
+ 'organization leg', async () => {
    const db = await seededDb();

    const stark = sortById(
        await derivedMemberships(db, STARK_ORGANIZATION),
    );
    const starkOld = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .memberships.getAll(),
    );
    assert.deepEqual(stark, starkOld);
    assert.equal(stark.length, 10);

    const org2 = sortById(
        await derivedMemberships(db, ORGANIZATION_TWO),
    );
    const org2Old = sortById(
        await organizationScopedAdapter(db, ORGANIZATION_TWO)
            .memberships.getAll(),
    );
    assert.deepEqual(org2, org2Old);
    assert.equal(org2.length, 6);

    const THIRD_ORGANIZATION = '3';
    const empty = await derivedMemberships(db, THIRD_ORGANIZATION);
    const emptyOld = await organizationScopedAdapter(
        db, THIRD_ORGANIZATION,
    ).memberships.getAll();
    assert.deepEqual(empty, []);
    assert.deepEqual(emptyOld, []);
});

// -- 2. per-membership getById parity (all 16); missing-id ------
// -- 404 byte parity; a DELETE-then-derive tombstone ------------

test('per-membership getById parity (all 16); missing-id 404'
+ ' parity, byte-equal body; a DELETE-then-derive tombstone —'
+ ' absent on both planes, 404 bytes equal', async () => {
    const db = await seededDb();
    const allMemberships = await db.memberships.getAll();
    assert.equal(allMemberships.length, 16);

    for (const membership of allMemberships) {
        const derived = await derivedMembership(
            db, membership.organization_id, membership.id,
        );
        const old = await organizationScopedAdapter(
            db, membership.organization_id,
        ).memberships.getById(membership.id);
        assert.deepEqual(derived, old);
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
    await assert.rejects(
        () => organizationScopedAdapter(db, STARK_ORGANIZATION)
            .memberships.getById(missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );

    // DELETE-then-derive: a live membership tombstoned via the
    // wire — absent on both planes, 404 bytes equal.
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
    await assert.rejects(
        () => organizationScopedAdapter(
            db, target.organization_id,
        ).memberships.getById(target.id),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedTargetMessage,
    );
});

// -- 3. ai-members + human-members collection parity (GLOBAL — --
// -- all orgs' rows on both planes, the unfenced-wire fact -----
// -- preserved) + per-entity getById parity + 404-byte parity --

test('ai-members + human-members collection parity (GLOBAL —'
+ ' the unfenced-wire fact preserved) + per-entity getById'
+ ' parity + 404-byte parity', async () => {
    const db = await seededDb();

    const derivedAi = sortById(
        await derivedAiMembers(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    const oldAi = sortById(await db.aiMembers.getAll());
    assert.deepEqual(derivedAi, oldAi);
    assert.equal(derivedAi.length, 4);

    const derivedHuman = sortById(
        await derivedHumanMembers(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    const oldHuman = sortById(await db.humanMembers.getAll());
    assert.deepEqual(derivedHuman, oldHuman);
    assert.equal(derivedHuman.length, 11);

    for (const row of oldAi) {
        const derived = await derivedAiMember(
            db, GLOBAL_PLANE_PLACEHOLDER, row.id,
        );
        const old = await db.aiMembers.getById(row.id);
        assert.deepEqual(derived, old);
    }
    for (const row of oldHuman) {
        const derived = await derivedHumanMember(
            db, GLOBAL_PLANE_PLACEHOLDER, row.id,
        );
        const old = await db.humanMembers.getById(row.id);
        assert.deepEqual(derived, old);
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
    await assert.rejects(
        () => db.aiMembers.getById(missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedAiMessage,
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
    await assert.rejects(
        () => db.humanMembers.getById(missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedHumanMessage,
    );
});

// -- 4. members parity: deriveMemberParents vs old-plane; -------
// -- deriveMembers vs the live-closure logic per org; current- --
// -- member parity; a missing-member 404-byte case ---------------

test('members parity: deriveMemberParents vs old-plane members'
+ '.getAll (16 incl. system); deriveMembers vs the live-'
+ "closure's own logic per org; current-member parity; a"
+ ' missing-member 404-byte case', async () => {
    const db = await seededDb();

    const derivedParents = sortById(await deriveMemberParents(db));
    const oldParents = sortById(await db.members.getAll());
    assert.deepEqual(derivedParents, oldParents);
    assert.equal(derivedParents.length, 16);

    // The generic-handler mirror agrees too (MEMBERS_TEST_WIRING
    // — the same code path Task 8 wires live for GET /members).
    const derivedParentsGeneric = sortById(
        await derivedMembersDirect(db, GLOBAL_PLANE_PLACEHOLDER),
    );
    assert.deepEqual(derivedParentsGeneric, oldParents);

    // deriveMembers vs route('members')'s OWN live closure
    // (api/routes.ts), re-derived here rather than a second,
    // hand-rolled copy of its filter.
    async function liveClosureRoster(
        organization: Id,
    ): Promise<MemberEntity[]> {
        const memberships = await organizationScopedAdapter(
            db, organization,
        ).memberships.getAll();
        const ids = new Set(memberships.map((m) => m.identity_id));
        const all = await db.members.getAll();
        return all.filter(
            (m) => ids.has(m.id) || m.type === 'system',
        );
    }

    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = sortById(
            await deriveMembers(db, organization),
        );
        const old = sortById(
            await liveClosureRoster(organization),
        );
        assert.deepEqual(derived, old);
    }

    // Counts VERIFIED at execution against the old plane (see
    // the Task 7 report) — the old plane governs: STARK 11 (10
    // membership-joined + the system member), org 2 7 (6 + the
    // system member).
    const starkRoster = await deriveMembers(db, STARK_ORGANIZATION);
    const org2Roster = await deriveMembers(db, ORGANIZATION_TWO);
    assert.equal(starkRoster.length, 11);
    assert.equal(org2Roster.length, 7);

    const derivedCurrent = await deriveMemberParent(db, 'current');
    const oldCurrent = await db.members.getById('current');
    assert.deepEqual(derivedCurrent, oldCurrent);

    const missingId = 'no-such-member';
    const expectedMessage = 'Not found: members/' + missingId;
    await assert.rejects(
        () => deriveMemberParent(db, missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
    await assert.rejects(
        () => db.members.getById(missingId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

// -- 5. live-write chain, re-compared on both planes at every ---
// -- step ---------------------------------------------------------

test('live-write chain: create an AI member (bundle balance 3),'
+ ' a composed edit, a facet PUT (Supersedes), create a human'
+ ' member, a composed edit, PUT memberships/:id (a new'
+ ' membership), DELETE memberships/:id — re-compared on both'
+ ' planes at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const aiId = 'ai-drift-chain-1';

    async function assertMemberParity(id: string): Promise<void> {
        const derived = await deriveMemberParent(db, id);
        const old = await db.members.getById(id);
        assert.deepEqual(derived, old);
    }

    async function assertRosterParity(
        organization: Id,
    ): Promise<void> {
        const derived = sortById(
            await deriveMembers(db, organization),
        );
        const memberships = await organizationScopedAdapter(
            db, organization,
        ).memberships.getAll();
        const ids = new Set(memberships.map((m) => m.identity_id));
        const all = await db.members.getAll();
        const old = sortById(
            all.filter((m) => ids.has(m.id) || m.type === 'system'),
        );
        assert.deepEqual(derived, old);
    }

    // Step 1: create an AI member — bundle balance 3 (operation
    // + member-document + detail-document pairs); the derived
    // parent + roster see it immediately (the synthesis proof).
    const beforeCreate = (await db.requests.getAll()).length;
    const created = await handleRequest(db, req(
        'POST', '/ai-members', token,
        aiMemberCreateBody(
            aiId, 'Chain AI', aiId + '-genesis', nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);
    assert.equal(
        (await db.requests.getAll()).length, beforeCreate + 3,
    );
    await assertMemberParity(aiId);
    const derivedAiDetail1 = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.deepEqual(
        derivedAiDetail1, await db.aiMembers.getById(aiId),
    );
    assert.equal(derivedAiDetail1.name, 'Chain AI');
    await assertRosterParity(STARK_ORGANIZATION);

    // Step 2: composed edit (POST /ai-members/:id) — detail
    // changes visible derived (the edit-synthesis proof).
    const edited = await handleRequest(db, req(
        'POST', '/ai-members/' + aiId, token,
        aiMemberEditBody('Chain AI Edited'),
    ));
    assert.equal(edited.status, 204);
    await assertMemberParity(aiId);
    const derivedAiDetail2 = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.deepEqual(
        derivedAiDetail2, await db.aiMembers.getById(aiId),
    );
    assert.equal(derivedAiDetail2.name, 'Chain AI Edited');

    // Step 3: a facet PUT ai-members/:id (documentPutHandler
    // (AI_MEMBERS_WIRING) — the generic machinery) — a fresh
    // Supersedes chain; the derived head updates.
    const facetPut = await handleRequest(db, req(
        'PUT', '/ai-members/' + aiId, token,
        aiMemberDocumentBody('Chain AI Facet'),
    ));
    assert.equal(facetPut.status, 200);
    assert.ok(facetPut.headers.get('Supersedes'));
    const derivedAiDetail3 = await derivedAiMember(
        db, GLOBAL_PLANE_PLACEHOLDER, aiId,
    );
    assert.deepEqual(
        derivedAiDetail3, await db.aiMembers.getById(aiId),
    );
    assert.equal(derivedAiDetail3.name, 'Chain AI Facet');

    // Step 4: create a human member — bundle balance 4 (Phase 10
    // Task 5 widens it from 3: operation + member-document +
    // detail-document + the synthesized identities/:id document,
    // a human member's own identity row an AI member never has —
    // finding 10).
    const humanId = 'human-drift-chain-1';
    const beforeHumanCreate = (await db.requests.getAll()).length;
    const humanCreated = await handleRequest(db, req(
        'POST', '/human-members', token,
        humanMemberCreateBody(
            humanId, 'Chain Human', humanId + '-genesis',
            nowUtc(),
        ),
    ));
    assert.equal(humanCreated.status, 204);
    assert.equal(
        (await db.requests.getAll()).length,
        beforeHumanCreate + 4,
    );
    await assertMemberParity(humanId);
    const derivedHumanDetail1 = await derivedHumanMember(
        db, GLOBAL_PLANE_PLACEHOLDER, humanId,
    );
    assert.deepEqual(
        derivedHumanDetail1,
        await db.humanMembers.getById(humanId),
    );
    await assertRosterParity(STARK_ORGANIZATION);

    // Step 5: composed edit (POST /human-members/:id).
    const humanEdited = await handleRequest(db, req(
        'POST', '/human-members/' + humanId, token,
        humanMemberEditBody(),
    ));
    assert.equal(humanEdited.status, 204);
    await assertMemberParity(humanId);
    const derivedHumanDetail2 = await derivedHumanMember(
        db, GLOBAL_PLANE_PLACEHOLDER, humanId,
    );
    assert.deepEqual(
        derivedHumanDetail2,
        await db.humanMembers.getById(humanId),
    );

    // Step 6: PUT memberships/:id — a NEW membership for the
    // human member just created; deriveMembers gains it.
    const membershipId = 'ms-drift-chain-1';
    const membershipPut = await handleRequest(db, req(
        'PUT', '/memberships/' + membershipId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: humanId,
            at: nowUtc(),
        },
    ));
    assert.equal(membershipPut.status, 200);
    await assertRosterParity(STARK_ORGANIZATION);
    const rosterAfterMembership = await deriveMembers(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        rosterAfterMembership.some((m) => m.id === humanId), true,
    );

    // Step 7: DELETE memberships/:id — deriveMembers loses the
    // member; the parent SURVIVES in deriveMemberParents
    // (membership removal never deletes the member).
    const membershipDelete = await handleRequest(db, req(
        'DELETE', '/memberships/' + membershipId, token,
    ));
    assert.equal(membershipDelete.status, 204);
    await assertRosterParity(STARK_ORGANIZATION);
    const rosterAfterDelete = await deriveMembers(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        rosterAfterDelete.some((m) => m.id === humanId), false,
    );
    await assertMemberParity(humanId);
    const survivingParent = await deriveMemberParent(db, humanId);
    assert.equal(survivingParent.id, humanId);
});

// -- 6. invitations parity: grant/accept/decline/revoke, a ------
// -- duplicate-grant no-phantom, a no-op re-accept --------------

test('invitations parity: fresh grant → pending; accept →'
+ ' accepted + the membership visible on both planes;'
+ ' decline; revoke; duplicate grant → no phantom row; no-op'
+ ' re-accept → stable, no new row', async () => {
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

    async function assertInvitationsParity(): Promise<void> {
        const derived = sortById(await deriveInvitations(db));
        const old = sortById(await oldInvitations(db));
        assert.deepEqual(derived, old);
    }

    // A: fresh grant — pending.
    const sarahGrant = await grantTo(
        'inv-roster-sarah', 'sarah.chen@company.com',
        'ev-roster-sarah-grant', '2026-06-01T00:00:00.000000Z',
    );
    assert.equal(sarahGrant.status, 200);
    await assertInvitationsParity();
    const sarahRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-sarah',
    )!;
    assert.equal(sarahRow.state, 'pending');

    // B: accept — accepted + the membership appears in BOTH
    // planes' memberships reads.
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
    await assertInvitationsParity();
    const jessicaRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-jessica',
    )!;
    assert.equal(jessicaRow.state, 'accepted');
    const derivedJessicaMembership = await derivedMembership(
        db, organization, 'ms-roster-jessica',
    );
    const oldJessicaMembership = await organizationScopedAdapter(
        db, organization,
    ).memberships.getById('ms-roster-jessica');
    assert.deepEqual(derivedJessicaMembership, oldJessicaMembership);

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
    await assertInvitationsParity();
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
    await assertInvitationsParity();
    const marcusRow = (await deriveInvitations(db)).find(
        (row) => row.id === 'inv-roster-marcus',
    )!;
    assert.equal(marcusRow.state, 'revoked');

    // E: duplicate grant for Sarah's SAME (org, identity) pair —
    // NO phantom row; derived count equals old-plane count.
    const beforeCount = (await db.invitations.getAll()).length;
    const sarahDuplicate = await grantTo(
        'inv-roster-sarah-dup', 'sarah.chen@company.com',
        'ev-roster-sarah-dup-grant', '2026-06-01T00:00:07.000000Z',
    );
    assert.equal(sarahDuplicate.status, 200);
    assert.equal(
        (await db.invitations.getAll()).length, beforeCount,
    );
    await assertInvitationsParity();
    const derivedAfterDuplicate = await deriveInvitations(db);
    assert.equal(
        derivedAfterDuplicate.filter(
            (row) => row.identity_id === 'LhfaUUf4IumVsCSGB4xjdK'
                && row.organization_id === organization,
        ).length, 1,
    );

    // F: no-op re-accept — state stable, no new row.
    const statesBefore =
        (await db.states.getAllFor('inv-roster-jessica')).length;
    const jessicaReaccept = await acceptAs(
        jessicaId, 'inv-roster-jessica', 'ms-roster-jessica-2',
        'ev-roster-jessica-reaccept',
        '2026-06-01T00:00:08.000000Z',
    );
    assert.equal(jessicaReaccept.status, 204);
    assert.equal(
        (await db.states.getAllFor('inv-roster-jessica')).length,
        statesBefore,
    );
    await assertInvitationsParity();
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
    assert.deepEqual(derived, await db.aiMembers.getById(aiId));
    assert.equal(derived.name, 'Resend AI Facet');
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
+ ' supersedes by ARRIVAL order on both planes; deriveMembers\''
+ ' JOIN is unaffected either way', async () => {
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
    const old = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).memberships.getById(membershipId);
    assert.deepEqual(derived, old);
    assert.equal(derived.at, '2020-01-01T00:00:00.000000Z');

    const roster = await deriveMembers(db, STARK_ORGANIZATION);
    assert.equal(roster.some((m) => m.id === identityId), true);
});

// -- 10. THE ORPHANED-MEMBERSHIP CASE ----------------------------

test('THE ORPHANED-MEMBERSHIP CASE: an identity created via'
+ ' postIdentityCreationOp (the shipped Add Identity flow — NO'
+ ' members row) plus a membership for it — GET /members drops'
+ ' it on BOTH planes; GET /memberships shows it on BOTH'
+ ' planes', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const orphanId = 'orphan-drift-1';

    await postIdentityCreationOp(db, {
        id: orphanId, kind: 'person',
    });
    // No members row exists for orphanId — verified on the OLD
    // plane directly (the join-direction precondition this case
    // exists to exercise).
    await assert.rejects(
        () => db.members.getById(orphanId), EntityNotFoundError,
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

    // GET /members drops the orphan on BOTH planes — the join
    // iterates MEMBERS and tests membership, never the reverse.
    const derivedRoster = await deriveMembers(
        db, STARK_ORGANIZATION,
    );
    const memberships = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).memberships.getAll();
    const ids = new Set(memberships.map((m) => m.identity_id));
    const allMembers = await db.members.getAll();
    const oldRoster = allMembers.filter(
        (m) => ids.has(m.id) || m.type === 'system',
    );
    assert.equal(
        derivedRoster.some((m) => m.id === orphanId), false,
    );
    assert.equal(
        oldRoster.some((m) => m.id === orphanId), false,
    );
    assert.deepEqual(sortById(derivedRoster), sortById(oldRoster));

    // GET /memberships shows it on BOTH planes.
    const derivedMembershipsList = sortById(
        await derivedMemberships(db, STARK_ORGANIZATION),
    );
    const oldMembershipsList = sortById(memberships);
    assert.deepEqual(derivedMembershipsList, oldMembershipsList);
    assert.equal(
        derivedMembershipsList.some(
            (m) => m.id === membershipId,
        ), true,
    );
    assert.equal(
        oldMembershipsList.some((m) => m.id === membershipId),
        true,
    );
});
