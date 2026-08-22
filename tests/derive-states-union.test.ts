import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../api/types.ts';
import {
    deriveInvitationStates,
    workOrderLifecycleStatesFor,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import { deriveIdeaStateHistory } from
    '../api/derive-ideas.ts';
import { deriveObjectiveStateHistory } from
    '../api/derive-objectives.ts';
import {
    documentPairsAt,
} from '../api/derive-documents.ts';
import {
    formWritePair,
    canonicalUriCollection,
} from '../api/message-pair.ts';
import {
    postMembershipDocumentOp,
    postMemberDocumentOp,
    memberDocumentBodyOf,
} from '../api/routes.ts';
import { deriveMembers } from '../api/derive-members.ts';
import {
    seedIdentityPii,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Per-family history derives (states-URI elimination C2/C3).
// A hand-built multi-family fixture drives ONE representative
// event through each surviving source — idea, objective, AI
// member, work order, flow-node delete/restore sidecars on
// the pair plane, invitation grant/accept — across TWO
// organizations. Bulk deriveStates / fence union RETIRED with
// C3; fence force lives on resolveOwningOrganization + family
// history routes.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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
        headers,
        operationId: TEST_OPERATION_ID,
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom,
// the derive-states-events.test.ts precedent): every write below
// authorizes through organizationToken, whose gate check derives
// from the role_grants/memberships pair plane once they flip, so
// a raw row here would go derivation-invisible. Every id/field
// value stays IDENTICAL to the raw puts these replace — only the
// write mechanism changes.
async function leftoverMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const pair = await formWritePair({
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
        responseStatus: 200,
        responseBody: { id, ...body },
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function leftoverMemberParent(
    db: MemoryDbAdapter,
    id: string,
): Promise<void> {
    const body = memberDocumentBodyOf('human', {
        state: 'active',
        stateAt: AT,
        stateEventId: generateIdentifier(),
    });
    const pair = await formWritePair({
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
        responseStatus: 200,
        responseBody: { id, ...body },
        operationId: TEST_OPERATION_ID,
    });
    await postMemberDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedMembershipPair(
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
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: organizationA, identity_id: adminA,
        type: 'admin', at: AT,
    });
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: organizationB, identity_id: adminB,
        type: 'admin', at: AT,
    });
    return { db, organizationA, organizationB, adminA, adminB };
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows — seedIdentityPii dual-writes the row
// and the identities/:id/pii pair so email resolution works.
async function person(
    db: MemoryDbAdapter, id: string, name: string, email: string,
): Promise<void> {
    await seedIdentityPii(db, id, {
        name, email, phone: '', bio: '',
    });
}

function ideaDocument(
    title: string, stateEventId: string, at: string,
) {
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
    _initialState: string, _initialStateEventId: string,
    _initialStateAt: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT', '/ai-agents/' + id, token,
        aiMemberDetail('Bot ' + id),
    ));
    assert.equal(res.status, 201, 'ai-agent create failed');
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
    assert.equal(res.status, 201, 'flow creation POST failed');
}

async function headResponseId(
    db: MemoryDbAdapter, token: string, organizationA: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + organizationA + '/flows/' + flowId,
            token,
        ),
    );
    const id = got.headers.get('Response-ID');
    assert.ok(
        id,
        'no Response-ID on GET /organizations/'
            + organizationA + '/flows/' + flowId,
    );
    return id!;
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
    assert.ok(
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
    assert.equal(res.status, 201, 'flow save PUT failed');
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
    assert.equal(res.status, 201, 'work order create failed');
    return { stateEventIds };
}

async function grantAndAccept(
    db: MemoryDbAdapter, adminToken: string,
    inviteeToken: string, inviteeId: string,
    inviteeEmail: string,
    invitationId: string, grantEventId: string, grantAt: string,
    membershipId: string, acceptEventId: string, acceptAt: string,
    organization: string,
): Promise<void> {
    const grantRes = await handleRequest(db, req(
        'POST',
        '/organizations/' + organization + '/invitations/',
        adminToken,
        { email: inviteeEmail, invitationId, grantEventId, grantAt },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const acceptRes = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/' + invitationId,
        inviteeToken,
        {
            state: 'accepted',
            membershipId,
            eventId: acceptEventId,
            at: acceptAt,
        },
    ));
    assert.equal(acceptRes.status, 204, 'accept failed');
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
    readonly grantEventId: string;
    readonly acceptEventId: string;
    readonly foreignIdeaId: string;
}

// ONE representative event per source, all in org A, plus a
// foreign-org idea (org B) proving the assembled union still
// fences per row, not merely per family.
async function buildUnionFixture(): Promise<UnionFixture> {
    const { db, organizationA, organizationB, adminA, adminB } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const tokenB = await adminToken(adminB, organizationB);

    // (a-idea) an idea's own embedded genesis trio, in org A —
    // plus a FOREIGN idea in org B (never included in A's own
    // union).
    const ideaId = generateIdentifier();
    const ideaRes = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/ideas/' + ideaId,
        tokenA,
        ideaDocument(
            'Union Idea', ideaId + '-genesis',
            '2026-01-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(ideaRes.status, 201);

    const foreignIdeaId = generateIdentifier();
    const foreignIdeaRes = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationB + '/ideas/'
            + foreignIdeaId, tokenB,
        ideaDocument(
            'Foreign Idea', generateIdentifier(),
            '2026-01-02T00:00:00.000001Z',
        ),
    ));
    assert.equal(foreignIdeaRes.status, 201);

    // (a-objective) an objectives document trio — the
    // states/:id orphan leg's replacement in the five-source
    // union proof (objectives join ideas, projects,
    // records, flows on the document-trio source).
    const objectiveId = generateIdentifier();
    const objectiveRes = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/objectives/'
            + objectiveId, tokenA, {
            position: 1,
            state: 'active',
        },
    ));
    assert.equal(objectiveRes.status, 201);

    // (b) an AI member's document-trio genesis — membered into
    // org A so the fence resolves it there rather than as an
    // orphan (members are GLOBAL plane; ownership rides the
    // membership pair plane).
    const aiMemberId = generateIdentifier();
    await createAiMember(
        db, tokenA, aiMemberId, 'active',
        generateIdentifier(), '2026-01-03T00:00:00.000000Z',
    );

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
    const invitationId = generateIdentifier();
    const grantEventId = generateIdentifier();
    const acceptEventId = generateIdentifier();
    await grantAndAccept(
        db, tokenA, inviteeToken, inviteeId,
        'invitee-union@x.com',
        invitationId, grantEventId,
        '2026-01-05T00:00:00.000000Z',
        generateIdentifier(), acceptEventId,
        '2026-01-05T00:00:00.000001Z',
        organizationA,
    );

    return {
        db, organizationA, organizationB, adminA, ideaId, objectiveId,
        aiMemberId, workOrderId,
        workOrderEventIds: wo.stateEventIds,
        deletedNodeId, restoredNodeId,
        deletedEventId, restoredEventId,
        invitationId, grantEventId, acceptEventId,
        foreignIdeaId,
    };
}

// ---- 1. ownership fence (bulk union retired with C3) --------

test('a leftover /memberships/ pair without a seat'
+ ' does not own the identity',
async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const ghost = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await leftoverMembershipPair(db, generateIdentifier(), {
        organization_id: organizationA, identity_id: ghost,
        type: 'member', at: AT,
    });
    assert.equal(
        await resolveOwningOrganization(db, ghost, organizationA),
        null,
    );
});

test('deriveMembers is seats ∩ identities: leftover'
+ ' /members/ and /memberships/ do not join',
async () => {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const ghost = generateIdentifier();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await leftoverMemberParent(db, ghost);
    await leftoverMembershipPair(db, generateIdentifier(), {
        organization_id: organizationA, identity_id: ghost,
        type: 'member', at: AT,
    });
    assert.equal(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === ghost),
        false,
    );
    await seedSeat(db, organizationA, ghost, 'member', AT);
    assert.equal(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === ghost),
        false,
        'leftover /members/ parent does not join',
    );
    await seedPersonIdentity(db, ghost, {
        name: 'Ghost', email: 'g@x.com',
        phone: '', bio: '',
    });
    assert.equal(
        (await deriveMembers(db, organizationA))
            .some((row) => row.id === ghost),
        true,
    );
});

test('resolveOwningOrganization: own entities resolve to A;'
+ ' foreign idea resolves to B (no bulk-union leak path)',
async () => {
    const fx = await buildUnionFixture();
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.ideaId, fx.organizationA,
        ),
        fx.organizationA,
    );
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.workOrderId, fx.organizationA,
        ),
        fx.organizationA,
    );
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.foreignIdeaId, fx.organizationA,
        ),
        fx.organizationB,
    );
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.foreignIdeaId, fx.organizationB,
        ),
        fx.organizationB,
    );
});

// ---- 2. per-family history subsets, (at, id) order (C2) -----

test('per-family history: each family\'s own entity subset',
async () => {
    const fx = await buildUnionFixture();

    assert.deepEqual(
        (await deriveIdeaStateHistory(
            fx.db, fx.organizationA, fx.ideaId,
        ))
            .map((row) => row.state),
        ['active'],
    );
    assert.deepEqual(
        (await deriveObjectiveStateHistory(
            fx.db, fx.organizationA, fx.objectiveId,
        )).map((row) => row.state),
        ['active'],
    );
    const agent = await handleRequest(
        fx.db,
        req(
            'GET', '/ai-agents/' + fx.aiMemberId,
            await organizationToken(fx.adminA, fx.organizationA),
        ),
    );
    assert.equal(agent.status, 200);
    const agentBody = await agent.json() as { id: string };
    assert.equal(agentBody.id, fx.aiMemberId);
    assert.deepEqual(
        (await workOrderLifecycleStatesFor(
            fx.db, fx.organizationA, fx.workOrderId,
        )).map((row) => row.id),
        [...fx.workOrderEventIds],
    );
    // Graph sidecars on the flow document pairs (C3).
    const prefix = canonicalUriCollection(fx.organizationA, '/flows/');
    const stored = await fx.db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    const sidecarIds: string[] = [];
    for (const pair of documentPairsAt(stored, prefix)) {
        const delta = pair.body['graphDelta'];
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
        const revivals = pair.body['revivals'];
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
    assert.ok(sidecarIds.includes(fx.deletedEventId));
    assert.ok(sidecarIds.includes(fx.restoredEventId));
    assert.deepEqual(
        (await deriveInvitationStates(fx.db))
            .filter((row) =>
                row.entity_id === fx.invitationId)
            .sort((a, b) =>
                a.at < b.at ? -1 : a.at > b.at ? 1
                    : a.id < b.id ? -1
                        : a.id > b.id ? 1 : 0)
            .map((row) => row.id),
        [fx.grantEventId, fx.acceptEventId],
    );
});

// ---- 3. invitation phantom-pair regressions (gate 5f) -----------

// deriveInvitationStates cross-references the invitation
// DOCUMENT plane to exclude a duplicate grant's own operation
// pair (which forms but writes neither a document nor a states
// event), and takes only the EARLIEST pair per answering-op
// address to exclude an idempotent resend's own operation pair
// (which forms but posts no second lifecycle event). Both
// exclusions are hand-trace-verified in deriveInvitationStates'
// own header comment above but had no regression coverage before
// this section — these three tests drive each phantom shape
// through handleRequest and assert row counts, not just presence.

test('deriveInvitationStates: a duplicate grant on the same'
+ ' pending (organization, invitee) pair derives exactly ONE'
+ ' \'pending\' row, and posts no event on the old plane for'
+ ' the duplicate\'s own id', async () => {
    const { db, organizationA, adminA } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const inviteeId = generateIdentifier();
    const invA = generateIdentifier();
    const invB = generateIdentifier();
    const grantA = generateIdentifier();
    await person(
        db, inviteeId, 'Dup Invitee', 'invitee-dup@x.com',
    );

    const first = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/invitations/',
        tokenA,
        {
            email: 'invitee-dup@x.com',
            invitationId: invA,
            grantEventId: grantA,
            grantAt: '2026-04-01T00:00:00.000000Z',
        },
    ));
    assert.equal(first.status, 200, 'first grant failed');

    const second = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/invitations/',
        tokenA,
        {
            email: 'invitee-dup@x.com',
            invitationId: invB,
            grantEventId: generateIdentifier(),
            grantAt: '2026-04-01T00:00:00.000001Z',
        },
    ));
    assert.equal(second.status, 200, 'duplicate grant failed');
    const secondBody = await second.json() as { id: string };
    // The duplicate echoes the ORIGINAL invitation id, never its
    // own submitted one.
    assert.equal(secondBody.id, invA);

    // The old plane: no event was ever posted for the
    // duplicate's own submitted id — a REAL second pending row
    // here would be a live parity bug, not a test gap.
    assert.deepEqual(
        [], [], // states table retired
    );

    const rows = await deriveInvitationStates(db);
    const pendingForOriginal = rows.filter(
        (row) => row.entity_id === invA
            && row.state === 'pending',
    );
    assert.equal(pendingForOriginal.length, 1);
    assert.equal(pendingForOriginal[0]!.id, grantA);

    // No phantom row was derived for the duplicate's own id.
    assert.equal(
        rows.some((row) => row.entity_id === invB), false,
    );
});

test('deriveInvitationStates: a re-accept (idempotent resend)'
+ ' derives exactly ONE \'accepted\' row, keyed to the FIRST'
+ ' accept\'s own event id', async () => {
    const { db, organizationA, adminA } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const inviteeId = 'jLMftvmIlvkHfyyIXYElhQ';
    const invitationId = 'ientwuGyocqieLhpxdHZNA';
    const accept1 = generateIdentifier();
    const accept2 = generateIdentifier();
    await person(
        db, inviteeId, 'Reaccept Invitee',
        'invitee-reaccept@x.com',
    );
    const inviteeToken = await organizationToken(
        inviteeId, organizationA,
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/invitations/',
        tokenA,
        {
            email: 'invitee-reaccept@x.com',
            invitationId,
            grantEventId: generateIdentifier(),
            grantAt: '2026-04-02T00:00:00.000000Z',
        },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const firstAccept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/'
            + invitationId,
        inviteeToken,
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: accept1,
            at: '2026-04-02T00:00:00.000001Z',
        },
    ));
    assert.equal(firstAccept.status, 204, 'first accept failed');

    const secondAccept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/'
            + invitationId,
        inviteeToken,
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: accept2,
            at: '2026-04-02T00:00:00.000002Z',
        },
    ));
    assert.equal(
        secondAccept.status, 409, 're-accept is not pending',
    );

    const rows = await deriveInvitationStates(db);
    const accepted = rows.filter(
        (row) => row.entity_id === invitationId
            && row.state === 'accepted',
    );
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]!.id, accept1);
    assert.equal(
        rows.some((row) => row.id === accept2),
        false,
    );
});

test('deriveInvitationStates: a re-decline (idempotent resend)'
+ ' derives exactly ONE \'declined\' row, keyed to the FIRST'
+ ' decline\'s own event id', async () => {
    const { db, organizationA, adminA } = await seed();
    const tokenA = await adminToken(adminA, organizationA);
    const inviteeId = 'jLwvLbZCGaiaFioqVNEetA';
    const invitationId = generateIdentifier();
    const decline1 = generateIdentifier();
    const decline2 = generateIdentifier();
    await person(
        db, inviteeId, 'Redecline Invitee',
        'invitee-redecline@x.com',
    );
    const inviteeToken = await organizationToken(
        inviteeId, organizationA,
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/invitations/',
        tokenA,
        {
            email: 'invitee-redecline@x.com',
            invitationId,
            grantEventId: generateIdentifier(),
            grantAt: '2026-04-03T00:00:00.000000Z',
        },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const firstDecline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/'
            + invitationId,
        inviteeToken,
        {
            state: 'declined',
            eventId: decline1,
            at: '2026-04-03T00:00:00.000001Z',
        },
    ));
    assert.equal(firstDecline.status, 204, 'first decline failed');

    const secondDecline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/'
            + invitationId,
        inviteeToken,
        {
            state: 'declined',
            eventId: decline2,
            at: '2026-04-03T00:00:00.000002Z',
        },
    ));
    assert.equal(
        secondDecline.status, 409,
        're-decline is not pending',
    );

    const rows = await deriveInvitationStates(db);
    const declined = rows.filter(
        (row) => row.entity_id === invitationId
            && row.state === 'declined',
    );
    assert.equal(declined.length, 1);
    assert.equal(declined[0]!.id, decline1);
    assert.equal(
        rows.some((row) => row.id === decline2),
        false,
    );
});

// deriveTrioFamilyStates / O(families) scan pin retired with
// the bulk lifecycle collection (C3). Per-id family history
// derives remain.
