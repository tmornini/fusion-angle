import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    claimToken,
    organizationToken,
} from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    DEFAULT_LOCK_TIMEOUT, nowUtc, SYSTEM_MEMBER_ID,
} from '../shared/types.ts';
import {
    deriveInvitationStates,
    workOrderLifecycleStatesFor,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    formWriteMessagePair,
    canonicalPath,
} from '../api/message-pair.ts';
import {
    postMembershipDocumentOp,
    postMemberDocumentOp,
} from '../api/routes.ts';
import { deriveMembers } from '../api/derive-members.ts';
import {
    seedPersonIdentity,
} from './identity-fixtures.ts';
import {
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { landMembership } from
    './membership-fixtures.ts';
import { deriveOrganizationMemberSeat } from
    '../api/derive-memberships.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

// Per-family history derives (states-URI elimination C2/C3).
// A hand-built multi-family fixture drives ONE representative
// event through each surviving source — idea, objective, AI
// member, work order, flow-node delete/restore sidecars on
// the message plane, invitation grant/accept — across TWO
// organizations. Bulk deriveStates / fence union RETIRED with
// C3; fence force lives on resolveOwningOrganization + family
// history routes.

const AT = '2026-01-01T00:00:00.000000Z';
const LATER = '2026-01-02T00:00:00.000000Z';

// Non-current admins need explicit claim roles — organizationToken
// only bakes admin for sub === 'XXZruirZyAOoRpNxaDnpSA'.
async function adminToken(
    sub: string, organization: string,
): Promise<string> {
    return claimToken({
        sub,
        organization,
        organizations: [organization],
        roles: ['admin:' + organization],
    });
}


function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined
            ? { headers } : {}),
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom,
// the derive-states-events.test.ts precedent): every write below
// authorizes through organizationToken, whose gate check derives
// from the role_grants/memberships message plane once they flip, so
// a raw row here would go derivation-invisible. Every id/field
// value stays IDENTICAL to the raw puts these replace — only the
// write mechanism changes.
async function leftoverMembershipMessagePair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseBody: { id, ...body },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, messagePair,
    );
}

async function leftoverMemberParent(
    db: MemoryDbAdapter,
    id: string,
): Promise<void> {
    const body = {
        type: 'human',
        state: 'active',
        state_at: AT,
        state_event_id: generateIdentifier(),
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/members/' + id,
        routePattern: 'members/:id',
        routeSegments: ['members', ':id'],
        pathSegments: ['members', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseBody: { id, ...body },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postMemberDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, messagePair,
    );
}

async function seedMembershipMessagePair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );
}

// Two orgs (A, B), one admin identity each — the derive-states-
// events.test.ts precedent, reused so every write below (ideas,
// ai-members, work-orders, flows, invitations, memberships) rides
// through ONE identity per org.
async function seed(): Promise<{
    db: MemoryDbAdapter;
    organizationA: string;
    organizationB: string;
    adminA: string;
    adminB: string;
}> {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    const adminA = generateIdentifier();
    const adminB = generateIdentifier();
    await db.postSchemaCreation();
    // Real organizations/:id documents (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves A/B
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await seedOrganizationDocument(db, organizationB, 'Beta');
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: organizationA, identity_id: adminA,
        type: 'admin', at: AT,
    });
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: organizationB, identity_id: adminB,
        type: 'admin', at: AT,
    });
    return { db, organizationA, organizationB, adminA, adminB };
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows, which lists the identities collection
// and reads one PII document each — seedPersonIdentity writes
// the identities/:id document and its PII, so email resolution
// finds the person.
async function person(
    db: MemoryDbAdapter, id: string, name: string, email: string,
): Promise<void> {
    await seedPersonIdentity(db, id, {
        name, email, phone: '', bio: '',
    });
}

function ideaDocument(title: string) {
    return {
        title, position: 0,
        problem_statement: '', target_users: '',
        proposed_solution: '', expected_outcome: '',
        success_metrics: '',
        state: 'active',
    };
}

function aiMemberDetail(name: string) {
    return {
        name, description: '', skill_focus: '',
        model: firstProviderModel().id,
    };
}

async function createAiMember(
    db: MemoryDbAdapter, token: string, id: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT', '/ai-agents/' + id, token,
        aiMemberDetail('Bot ' + id),
    ));
    assertStrictEquals(res.status, 201, 'ai-agent create failed');
}

function flowFields(name: string) {
    return {
        name, is_locked: false, is_auto_layout: false,
        is_auto_fit: false, lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function nodeRowBody(id: string, flowId: string) {
    return {
        id, flow_id: flowId, name: 'Node',
        position_x: 0, position_y: 0,
        is_create: true, is_archive: false,
        task_instructions: '', at: AT,
    };
}

function emptyGraph() {
    return { nodes: [], edges: [] };
}

async function createFlowWithNodes(
    db: MemoryDbAdapter, token: string, organizationA: string,
    flowId: string, nodeIds: readonly string[],
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/flows/', token,
        {
            id: flowId,
            flow: flowFields('Flow ' + flowId),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: flowId, at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: nodeIds.map(
                    (id) => nodeRowBody(id, flowId),
                ),
                edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        },
    ));
    assertStrictEquals(res.status, 201, 'flow creation POST failed');
}

interface GraphSidecar {
    readonly eventId: string;
    readonly entityId: string;
    readonly at: string;
}

async function saveFlowWithSidecars(
    db: MemoryDbAdapter, token: string, organizationA: string,
    flowId: string,
    deletions: readonly GraphSidecar[],
    revivals: readonly GraphSidecar[],
    stateEventId: string, stateAt: string,
): Promise<void> {
    const got = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + organizationA + '/flows/' + flowId,
            token,
        ),
    );
    const etag = got.headers.get('ETag');
    assert(
        etag,
        'no ETag on GET /organizations/'
            + organizationA + '/flows/' + flowId,
    );
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/flows/' + flowId,
        token,
        {
            ...flowFields('Flow ' + flowId + ' saved'),
            state: 'active', state_at: stateAt,
            state_event_id: stateEventId,
            graph: emptyGraph(),
            graphDelta: {
                nodes: [], edges: [], deletions,
                memberEvents: [], attributeEvents: [],
            },
            revivals,
        },
        { 'if-match': etag },
    ));
    assertStrictEquals(res.status, 200, 'flow save PUT failed');
}

function workOrderBody(
    id: string, flowWorkOrderId: string, flowId: string,
    ats: readonly [string, string, string],
) {
    return {
        id,
        workOrder: {
            display_id: 'union',
            flow_graph: {
                name: 'Union Fixture Flow',
                lockTimeout: 8 * 60 * 60,
                nodes: [], edges: [],
            },
            position: 1,
        },
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: flowId, work_order_id: id, at: ats[0],
        },
        stateEventIds: [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
        ],
        stateEventAts: ats,
        states: ['n-start', 'n-middle', 'active'],
    };
}

async function createWorkOrder(
    db: MemoryDbAdapter, token: string, organizationA: string,
    id: string,
): Promise<{
    stateEventIds: readonly string[];
}> {
    const stateEventIds = [
        generateIdentifier(),
        generateIdentifier(),
        generateIdentifier(),
    ] as const;
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/work-orders/',
        token,
        {
            ...workOrderBody(
                id, generateIdentifier(),
                generateIdentifier(),
                [
                    '2026-02-01T00:00:00.000000Z',
                    '2026-02-01T00:00:00.000001Z',
                    '2026-02-01T00:00:00.000002Z',
                ],
            ),
            stateEventIds: [...stateEventIds],
        },
    ));
    assertStrictEquals(res.status, 201, 'work order create failed');
    return { stateEventIds };
}

async function grantAndAccept(
    db: MemoryDbAdapter, adminToken: string,
    inviteeToken: string, inviteeId: string,
    inviteeEmail: string, grantAt: string,
    acceptAt: string, organization: string,
): Promise<string> {
    const name = membershipNameOf(organization, inviteeId);
    const grantRes = await handleRequest(db, req(
        'POST',
        '/organizations/' + organization + '/invitations/',
        adminToken,
        { email: inviteeEmail, grantAt },
    ));
    assertStrictEquals(grantRes.status, 201, 'grant failed');

    const acceptRes = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + inviteeId
                + '/invitations/' + name,
            inviteeToken,
            { state: 'accepted', at: acceptAt },
        )),
    );
    assertStrictEquals(acceptRes.status, 200, 'accept failed');
    return name;
}

interface UnionFixture {
    readonly db: MemoryDbAdapter;
    readonly organizationA: string;
    readonly organizationB: string;
    readonly adminA: string;
    readonly ideaId: string;
    readonly objectiveId: string;
    readonly aiMemberId: string;
    readonly workOrderId: string;
    readonly workOrderEventIds: readonly string[];
    readonly deletedNodeId: string;
    readonly restoredNodeId: string;
    readonly deletedEventId: string;
    readonly restoredEventId: string;
    readonly invitationId: string;
    readonly foreignIdeaId: string;
}

// ONE representative event per source, all in org A, plus a
// foreign-org idea (org B) proving the assembled union still
// fences per row, not merely per family.
async function buildUnionFixture(): Promise<UnionFixture> {
    const { db, organizationA, organizationB, adminA, adminB } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const tokenB = await adminToken(adminB, organizationB);

    // (a-idea) an idea's own embedded genesis state, in org A —
    // plus a FOREIGN idea in org B (never included in A's own
    // union).
    const ideaId = generateIdentifier();
    const ideaRes = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/ideas/' + ideaId,
        tokenA,
        ideaDocument('Union Idea'),
    ));
    assertStrictEquals(ideaRes.status, 201);

    const foreignIdeaId = generateIdentifier();
    const foreignIdeaRes = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationB + '/ideas/'
            + foreignIdeaId, tokenB,
        ideaDocument('Foreign Idea'),
    ));
    assertStrictEquals(foreignIdeaRes.status, 201);

    // (a-objective) an objectives document — the
    // states/:id orphan leg's replacement in the five-source
    // union proof (objectives join ideas, projects,
    // records, flows on the document source).
    const objectiveId = generateIdentifier();
    const objectiveRes = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/objectives/'
            + objectiveId, tokenA, {
            position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(objectiveRes.status, 201);

    // (b) an AI agent's document genesis — membered into
    // org A so the fence resolves it there rather than as an
    // orphan (members are GLOBAL plane; ownership rides the
    // membership message plane).
    const aiMemberId = generateIdentifier();
    await createAiMember(db, tokenA, aiMemberId);

    // (c) a work order's create-op birth (3 events).
    const workOrderId = generateIdentifier();
    const wo = await createWorkOrder(
        db, tokenA, organizationA, workOrderId,
    );

    // (d) a flow with two nodes, then ONE save that deletes one
    // node and restores the other — both sidecar kinds in one
    // write.
    const flowId = generateIdentifier();
    const deletedNodeId = generateIdentifier();
    const restoredNodeId = generateIdentifier();
    const deletedEventId = generateIdentifier();
    const restoredEventId = generateIdentifier();
    await createFlowWithNodes(
        db, tokenA, organizationA, flowId,
        [deletedNodeId, restoredNodeId],
    );
    await saveFlowWithSidecars(
        db, tokenA, organizationA, flowId,
        [{
            eventId: deletedEventId,
            entityId: deletedNodeId,
            at: '2026-01-04T00:00:00.000000Z',
        }],
        [{
            eventId: restoredEventId,
            entityId: restoredNodeId,
            at: '2026-01-04T00:00:00.000001Z',
        }],
        generateIdentifier(), '2026-01-04T00:00:00.000002Z',
    );

    // (e) an invitation's grant + accept.
    const inviteeId = generateIdentifier();
    await person(
        db, inviteeId, 'Union Invitee',
        'invitee-union@x.com',
    );
    const inviteeToken = await organizationToken(
        inviteeId, organizationA,
    );
    const invitationId = await grantAndAccept(
        db, tokenA, inviteeToken, inviteeId,
        'invitee-union@x.com',
        '2026-01-05T00:00:00.000000Z',
        '2026-01-05T00:00:00.000001Z',
        organizationA,
    );

    return {
        db, organizationA, organizationB, adminA, ideaId, objectiveId,
        aiMemberId, workOrderId,
        workOrderEventIds: wo.stateEventIds,
        deletedNodeId, restoredNodeId,
        deletedEventId, restoredEventId,
        invitationId,
        foreignIdeaId,
    };
}

// ---- 1. ownership fence (bulk union retired with C3) --------

Deno.test('a leftover /memberships/ pair without a seat'
+ ' does not own the identity',
async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const ghost = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await leftoverMembershipMessagePair(db, generateIdentifier(), {
        organization_id: organizationA, identity_id: ghost,
        type: 'member', at: AT,
    });
    assertStrictEquals(
        await resolveOwningOrganization(db, ghost, organizationA),
        null,
    );
});

Deno.test('deriveMembers is memberships ∩ identities: leftover'
+ ' /members/ and /memberships/ do not join',
async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const ghost = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await leftoverMemberParent(db, ghost);
    await leftoverMembershipMessagePair(db, generateIdentifier(), {
        organization_id: organizationA, identity_id: ghost,
        type: 'member', at: AT,
    });
    assertStrictEquals(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === ghost),
        false,
    );
    await seedSeat(db, organizationA, ghost, 'member', AT);
    assertStrictEquals(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === ghost),
        false,
        'leftover /members/ parent does not join',
    );
    await seedPersonIdentity(db, ghost, {
        name: 'Ghost', email: 'g@x.com',
        phone: '', bio: '',
    });
    assertStrictEquals(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === ghost),
        true,
    );
});

const PERSON = {
    name: 'Person', email: 'p@x.com',
    phone: '', bio: '',
};

Deno.test('deriveMembers holds an accepted membership'
+ ' of either type with no seat', async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const member = generateIdentifier();
    const admin = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await seedPersonIdentity(db, member, {
        ...PERSON, email: 'member@x.com',
    });
    await seedPersonIdentity(db, admin, {
        ...PERSON, email: 'admin@x.com',
    });
    await landMembership(
        db, organizationA, member, 'accepted', 'member', AT,
    );
    await landMembership(
        db, organizationA, admin, 'accepted', 'admin', AT,
    );
    const rows = await deriveMembers(db, organizationA);
    assertEquals(
        rows.find((row) => row.id === member),
        { id: member, type: 'human' },
    );
    assertEquals(
        rows.find((row) => row.id === admin),
        { id: admin, type: 'human' },
    );
    assertStrictEquals(rows.length, 2);
});

Deno.test('deriveMembers holds nothing for a removed'
+ ' membership head whose seat remains', async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const identity = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await seedPersonIdentity(db, identity, PERSON);
    await seedSeat(
        db, organizationA, identity, 'member', AT,
    );
    await landMembership(
        db, organizationA, identity, 'removed', 'member', AT,
    );
    const seat = await deriveOrganizationMemberSeat(
        db, organizationA, identity,
    );
    assertStrictEquals(seat.identity_id, identity);
    assertStrictEquals(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === identity),
        false,
    );
});

Deno.test('deriveMembers holds nothing for a non-accepted'
+ ' membership', async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    const states = [
        'pending', 'declined', 'revoked', 'removed',
    ] as const;
    for (const state of states) {
        const identity = generateIdentifier();
        await seedPersonIdentity(db, identity, {
            ...PERSON, email: state + '@x.com',
        });
        await landMembership(
            db, organizationA, identity, state, 'member',
            AT,
        );
        assertStrictEquals(
            (await deriveMembers(db, organizationA))
                .some((row) => row.id === identity),
            false,
            state,
        );
    }
});

Deno.test('deriveMembers holds nothing for an accepted'
+ ' version under a removed head', async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const identity = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await seedPersonIdentity(db, identity, PERSON);
    await landMembership(
        db, organizationA, identity, 'accepted', 'member',
        AT,
    );
    await landMembership(
        db, organizationA, identity, 'removed', 'member',
        LATER,
    );
    assertStrictEquals(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === identity),
        false,
    );
});

Deno.test('resolveOwningOrganization: own entities resolve to A;'
+ ' foreign idea resolves to B (no bulk-union leak path)',
async () => {
    const fx = await buildUnionFixture();
    assertStrictEquals(
        await resolveOwningOrganization(
            fx.db, fx.ideaId, fx.organizationA,
        ),
        fx.organizationA,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            fx.db, fx.workOrderId, fx.organizationA,
        ),
        fx.organizationA,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            fx.db, fx.foreignIdeaId, fx.organizationA,
        ),
        fx.organizationB,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            fx.db, fx.foreignIdeaId, fx.organizationB,
        ),
        fx.organizationB,
    );
});

// ---- 2. per-family history subsets, (at, id) order (C2) -----

Deno.test('per-family history: each family\'s own entity subset',
async () => {
    const fx = await buildUnionFixture();

    const agent = await handleRequest(
        fx.db,
        req(
            'GET', '/ai-agents/' + fx.aiMemberId,
            await organizationToken(fx.adminA, fx.organizationA),
        ),
    );
    assertStrictEquals(agent.status, 200);
    const agentBody = await agent.json() as { id: string };
    assertStrictEquals(agentBody.id, fx.aiMemberId);
    assertEquals(
        (await workOrderLifecycleStatesFor(
            fx.db, fx.organizationA, fx.workOrderId,
        )).map((row) => row.id),
        [...fx.workOrderEventIds],
    );
    // Graph sidecars on the flow document message pairs (C3).
    const prefix = canonicalPath(fx.organizationA, '/flows/');
    const stored = await fx.db.messagePairs.getCollectionPairs(prefix,
    );
    const sidecarIds: string[] = [];
    for (const messagePair of documentMessagePairsAt(
        stored, prefix,
    )) {
        const delta = messagePair.body['graphDelta'];
        const deletions =
            typeof delta === 'object' && delta !== null
                ? (delta as Record<string, unknown>)[
                    'deletions'
                ]
                : undefined;
        if (Array.isArray(deletions)) {
            for (const entry of deletions) {
                if (
                    typeof entry === 'object'
                    && entry !== null
                ) {
                    const f = entry as Record<string, unknown>;
                    if (
                        f['entityId'] === fx.deletedNodeId
                        || f['entityId'] === fx.restoredNodeId
                    ) {
                        sidecarIds.push(String(f['eventId']));
                    }
                }
            }
        }
        const revivals = messagePair.body['revivals'];
        if (Array.isArray(revivals)) {
            for (const entry of revivals) {
                if (
                    typeof entry === 'object'
                    && entry !== null
                ) {
                    const f = entry as Record<string, unknown>;
                    if (
                        f['entityId'] === fx.deletedNodeId
                        || f['entityId'] === fx.restoredNodeId
                    ) {
                        sidecarIds.push(String(f['eventId']));
                    }
                }
            }
        }
    }
    assert(sidecarIds.includes(fx.deletedEventId));
    assert(sidecarIds.includes(fx.restoredEventId));
    assertEquals(
        (await deriveInvitationStates(fx.db))
            .filter((row) =>
                row.entity_id === fx.invitationId)
            .sort((a, b) =>
                a.at < b.at ? -1 : a.at > b.at ? 1
                    : a.id < b.id ? -1
                        : a.id > b.id ? 1 : 0)
            .map((row) => row.state),
        ['pending', 'accepted'],
    );
});

// ---- 3. a repeated answer stores no second row -----------------

// The duplicate-grant pin named two invitation ids for one
// pair. That behavior is gone: the document name is the
// membership name. A repeated accept or decline, latched on
// the head it already moved, is 409 and appends no PUT.

Deno.test('deriveInvitationStates: a repeated accept is 409'
+ ' and derives exactly one accepted row', async () => {
    const { db, organizationA, adminA } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const inviteeId = 'jLMftvmIlvkHfyyIXYElhQ';
    const name = membershipNameOf(organizationA, inviteeId);
    await person(
        db, inviteeId, 'Reaccept Invitee',
        'invitee-reaccept@x.com',
    );
    const inviteeToken = await organizationToken(
        inviteeId, organizationA,
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA
            + '/invitations/',
        tokenA,
        {
            email: 'invitee-reaccept@x.com',
            grantAt: '2026-04-02T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grantRes.status, 201, 'grant failed');

    const firstAccept = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + inviteeId + '/invitations/'
                + name,
            inviteeToken,
            {
                state: 'accepted',
                at: '2026-04-02T00:00:00.000001Z',
            },
        )),
    );
    assertStrictEquals(
        firstAccept.status, 200, 'first accept failed',
    );

    const secondAccept = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + inviteeId + '/invitations/'
                + name,
            inviteeToken,
            {
                state: 'accepted',
                at: '2026-04-02T00:00:00.000002Z',
            },
        )),
    );
    assertStrictEquals(
        secondAccept.status, 409,
        'a repeated accept is refused',
    );

    const rows = await deriveInvitationStates(db);
    assertStrictEquals(
        rows.filter((row) => row.entity_id === name).length,
        2,
    );
    assertStrictEquals(
        rows.filter((row) => row.entity_id === name
            && row.state === 'accepted').length,
        1,
    );
});

Deno.test('deriveInvitationStates: a repeated decline is 409'
+ ' and derives exactly one declined row', async () => {
    const { db, organizationA, adminA } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const inviteeId = 'jLwvLbZCGaiaFioqVNEetA';
    const name = membershipNameOf(organizationA, inviteeId);
    await person(
        db, inviteeId, 'Redecline Invitee',
        'invitee-redecline@x.com',
    );
    const inviteeToken = await organizationToken(
        inviteeId, organizationA,
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA
            + '/invitations/',
        tokenA,
        {
            email: 'invitee-redecline@x.com',
            grantAt: '2026-04-03T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grantRes.status, 201, 'grant failed');

    const firstDecline = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + inviteeId + '/invitations/'
                + name,
            inviteeToken,
            {
                state: 'declined',
                at: '2026-04-03T00:00:00.000001Z',
            },
        )),
    );
    assertStrictEquals(
        firstDecline.status, 200, 'first decline failed',
    );

    const secondDecline = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + inviteeId + '/invitations/'
                + name,
            inviteeToken,
            {
                state: 'declined',
                at: '2026-04-03T00:00:00.000002Z',
            },
        )),
    );
    assertStrictEquals(
        secondDecline.status, 409,
        'a repeated decline is refused',
    );

    const rows = await deriveInvitationStates(db);
    assertStrictEquals(
        rows.filter((row) => row.entity_id === name).length,
        2,
    );
    assertStrictEquals(
        rows.filter((row) => row.entity_id === name
            && row.state === 'declined').length,
        1,
    );
});

// deriveTrioFamilyStates / O(families) scan pin retired with
// the bulk lifecycle collection (C3). Per-id family history
// derives remain.
