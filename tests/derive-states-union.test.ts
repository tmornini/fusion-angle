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
// only bakes admin for sub === 'current'.
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
        stateEventId: 'seed-member-' + id + '-active',
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
async function seed(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    // Real organizations/:id documents (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves A/B
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'adminA',
        type: 'admin', at: AT,
    });
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B', identity_id: 'adminB',
        type: 'admin', at: AT,
    });
    return db;
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
    db: MemoryDbAdapter, token: string,
    flowId: string, nodeIds: readonly string[],
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/A/flows/', token,
        {
            id: flowId,
            flow: flowFields('Flow ' + flowId),
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: 'proj-union', flow_id: flowId, at: AT,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
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
    db: MemoryDbAdapter, token: string, flowId: string,
): Promise<string> {
    const got = await handleRequest(
        db, req('GET', '/organizations/A/flows/' + flowId, token),
    );
    const id = got.headers.get('Response-ID');
    assert.ok(id, 'no Response-ID on GET /organizations/A/flows/' + flowId);
    return id!;
}

interface GraphSidecar {
    readonly eventId: string;
    readonly entityId: string;
    readonly at: string;
}

async function saveFlowWithSidecars(
    db: MemoryDbAdapter, token: string, flowId: string,
    deletions: readonly GraphSidecar[],
    revivals: readonly GraphSidecar[],
    stateEventId: string, stateAt: string,
): Promise<void> {
    const got = await handleRequest(
        db, req('GET', '/organizations/A/flows/' + flowId, token),
    );
    const etag = got.headers.get('ETag');
    assert.ok(etag, 'no ETag on GET /organizations/A/flows/' + flowId);
    const res = await handleRequest(db, req(
        'PUT', '/organizations/A/flows/' + flowId, token,
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
            display_id: 'union-' + id,
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
        stateEventIds: [id + '-ev1', id + '-ev2', id + '-ev3'],
        stateEventAts: ats,
        states: ['n-start', 'n-middle', 'active'],
    };
}

async function createWorkOrder(
    db: MemoryDbAdapter, token: string, id: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/A/work-orders/', token,
        workOrderBody(
            id, id + '-fwo', 'flow-union-wo-placeholder',
            [
                '2026-02-01T00:00:00.000000Z',
                '2026-02-01T00:00:00.000001Z',
                '2026-02-01T00:00:00.000002Z',
            ],
        ),
    ));
    assert.equal(res.status, 201, 'work order create failed');
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
    readonly ideaId: string;
    readonly objectiveId: string;
    readonly aiMemberId: string;
    readonly workOrderId: string;
    readonly deletedNodeId: string;
    readonly restoredNodeId: string;
    readonly invitationId: string;
    readonly foreignIdeaId: string;
}

// ONE representative event per source, all in org A, plus a
// foreign-org idea (org B) proving the assembled union still
// fences per row, not merely per family.
async function buildUnionFixture(): Promise<UnionFixture> {
    const db = await seed();
    const tokenA = await adminToken('adminA', 'A');
    const tokenB = await adminToken('adminB', 'B');

    // (a-idea) an idea's own embedded genesis trio, in org A —
    // plus a FOREIGN idea in org B (never included in A's own
    // union).
    const ideaId = 'idea-union';
    const ideaRes = await handleRequest(db, req(
        'PUT', '/organizations/A/ideas/' + ideaId, tokenA,
        ideaDocument(
            'Union Idea', ideaId + '-genesis',
            '2026-01-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(ideaRes.status, 201);

    const foreignIdeaId = 'idea-union-foreign';
    const foreignIdeaRes = await handleRequest(db, req(
        'PUT', '/organizations/B/ideas/' + foreignIdeaId, tokenB,
        ideaDocument(
            'Foreign Idea', foreignIdeaId + '-genesis',
            '2026-01-02T00:00:00.000001Z',
        ),
    ));
    assert.equal(foreignIdeaRes.status, 201);

    // (a-objective) an objectives document trio — the
    // states/:id orphan leg's replacement in the five-source
    // union proof (objectives join ideas, projects,
    // records, flows on the document-trio source).
    const objectiveId = 'obj-union';
    const objectiveRes = await handleRequest(db, req(
        'PUT', '/organizations/A/objectives/' + objectiveId, tokenA, {
            position: 1,
            state: 'active',
        },
    ));
    assert.equal(objectiveRes.status, 201);

    // (b) an AI member's document-trio genesis — membered into
    // org A so the fence resolves it there rather than as an
    // orphan (members are GLOBAL plane; ownership rides the
    // membership pair plane).
    const aiMemberId = 'ai-union';
    await createAiMember(
        db, tokenA, aiMemberId, 'active',
        aiMemberId + '-genesis', '2026-01-03T00:00:00.000000Z',
    );

    // (c) a work order's create-op birth (3 events).
    const workOrderId = 'wo-union';
    await createWorkOrder(db, tokenA, workOrderId);

    // (d) a flow with two nodes, then ONE save that deletes one
    // node and restores the other — both sidecar kinds in one
    // write.
    const flowId = 'flow-union';
    const deletedNodeId = 'node-union-deleted';
    const restoredNodeId = 'node-union-restored';
    await createFlowWithNodes(
        db, tokenA, flowId, [deletedNodeId, restoredNodeId],
    );
    await saveFlowWithSidecars(
        db, tokenA, flowId,
        [{
            eventId: 'ev-union-deleted',
            entityId: deletedNodeId,
            at: '2026-01-04T00:00:00.000000Z',
        }],
        [{
            eventId: 'ev-union-restored',
            entityId: restoredNodeId,
            at: '2026-01-04T00:00:00.000001Z',
        }],
        'flow-union-saved', '2026-01-04T00:00:00.000002Z',
    );

    // (e) an invitation's grant + accept.
    await person(
        db, 'invitee-union', 'Union Invitee',
        'invitee-union@x.com',
    );
    const inviteeToken = await organizationToken(
        'invitee-union', 'A',
    );
    const invitationId = 'inv-union';
    await grantAndAccept(
        db, tokenA, inviteeToken, 'invitee-union',
        'invitee-union@x.com',
        invitationId, 'ev-union-grant',
        '2026-01-05T00:00:00.000000Z',
        'ms-union-accept', 'ev-union-accept',
        '2026-01-05T00:00:00.000001Z',
        'A',
    );

    return {
        db, ideaId, objectiveId, aiMemberId, workOrderId,
        deletedNodeId, restoredNodeId, invitationId,
        foreignIdeaId,
    };
}

// ---- 1. ownership fence (bulk union retired with C3) --------

test('a leftover /memberships/ pair without a seat'
+ ' does not own the identity',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'A', 'Acme');
    await leftoverMembershipPair(db, 'm-leftover', {
        organization_id: 'A', identity_id: 'ghost',
        type: 'member', at: AT,
    });
    assert.equal(
        await resolveOwningOrganization(db, 'ghost', 'A'),
        null,
    );
});

test('deriveMembers is seats ∩ identities: leftover'
+ ' /members/ and /memberships/ do not join',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'A', 'Acme');
    await leftoverMemberParent(db, 'ghost');
    await leftoverMembershipPair(db, 'm-leftover', {
        organization_id: 'A', identity_id: 'ghost',
        type: 'member', at: AT,
    });
    assert.equal(
        (await deriveMembers(db, 'A'))
            .some((row) => row.id === 'ghost'),
        false,
    );
    await seedSeat(db, 'A', 'ghost', 'member', AT);
    assert.equal(
        (await deriveMembers(db, 'A'))
            .some((row) => row.id === 'ghost'),
        false,
        'leftover /members/ parent does not join',
    );
    await seedPersonIdentity(db, 'ghost', {
        name: 'Ghost', email: 'g@x.com',
        phone: '', bio: '',
    });
    assert.equal(
        (await deriveMembers(db, 'A'))
            .some((row) => row.id === 'ghost'),
        true,
    );
});

test('resolveOwningOrganization: own entities resolve to A;'
+ ' foreign idea resolves to B (no bulk-union leak path)',
async () => {
    const fx = await buildUnionFixture();
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.ideaId, 'A',
        ),
        'A',
    );
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.workOrderId, 'A',
        ),
        'A',
    );
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.foreignIdeaId, 'A',
        ),
        'B',
    );
    assert.equal(
        await resolveOwningOrganization(
            fx.db, fx.foreignIdeaId, 'B',
        ),
        'B',
    );
});

// ---- 2. per-family history subsets, (at, id) order (C2) -----

test('per-family history: each family\'s own entity subset',
async () => {
    const fx = await buildUnionFixture();

    assert.deepEqual(
        (await deriveIdeaStateHistory(fx.db, 'A', fx.ideaId))
            .map((row) => row.state),
        ['active'],
    );
    assert.deepEqual(
        (await deriveObjectiveStateHistory(
            fx.db, 'A', fx.objectiveId,
        )).map((row) => row.state),
        ['active'],
    );
    const agent = await handleRequest(
        fx.db,
        req(
            'GET', '/ai-agents/' + fx.aiMemberId,
            await organizationToken('adminA', 'A'),
        ),
    );
    assert.equal(agent.status, 200);
    const agentBody = await agent.json() as { id: string };
    assert.equal(agentBody.id, fx.aiMemberId);
    assert.deepEqual(
        (await workOrderLifecycleStatesFor(
            fx.db, 'A', fx.workOrderId,
        )).map((row) => row.id),
        [
            fx.workOrderId + '-ev1', fx.workOrderId + '-ev2',
            fx.workOrderId + '-ev3',
        ],
    );
    // Graph sidecars on the flow document pairs (C3).
    const prefix = canonicalUriCollection('A', '/flows/');
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
    assert.ok(sidecarIds.includes('ev-union-deleted'));
    assert.ok(sidecarIds.includes('ev-union-restored'));
    assert.deepEqual(
        (await deriveInvitationStates(fx.db))
            .filter((row) =>
                row.entity_id === fx.invitationId)
            .sort((a, b) =>
                a.at < b.at ? -1 : a.at > b.at ? 1
                    : a.id < b.id ? -1
                        : a.id > b.id ? 1 : 0)
            .map((row) => row.id),
        ['ev-union-grant', 'ev-union-accept'],
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
    const db = await seed();
    const tokenA = await adminToken('adminA', 'A');
    await person(
        db, 'invitee-dup', 'Dup Invitee', 'invitee-dup@x.com',
    );

    const first = await handleRequest(db, req(
        'POST', '/organizations/A/invitations/', tokenA,
        {
            email: 'invitee-dup@x.com',
            invitationId: 'inv-dup-a',
            grantEventId: 'ev-dup-grant-a',
            grantAt: '2026-04-01T00:00:00.000000Z',
        },
    ));
    assert.equal(first.status, 200, 'first grant failed');

    const second = await handleRequest(db, req(
        'POST', '/organizations/A/invitations/', tokenA,
        {
            email: 'invitee-dup@x.com',
            invitationId: 'inv-dup-b',
            grantEventId: 'ev-dup-grant-b',
            grantAt: '2026-04-01T00:00:00.000001Z',
        },
    ));
    assert.equal(second.status, 200, 'duplicate grant failed');
    const secondBody = await second.json() as { id: string };
    // The duplicate echoes the ORIGINAL invitation id, never its
    // own submitted one.
    assert.equal(secondBody.id, 'inv-dup-a');

    // The old plane: no event was ever posted for the
    // duplicate's own submitted id — a REAL second pending row
    // here would be a live parity bug, not a test gap.
    assert.deepEqual(
        [], [], // states table retired
    );

    const rows = await deriveInvitationStates(db);
    const pendingForOriginal = rows.filter(
        (row) => row.entity_id === 'inv-dup-a'
            && row.state === 'pending',
    );
    assert.equal(pendingForOriginal.length, 1);
    assert.equal(pendingForOriginal[0]!.id, 'ev-dup-grant-a');

    // No phantom row was derived for the duplicate's own id.
    assert.equal(
        rows.some((row) => row.entity_id === 'inv-dup-b'), false,
    );
});

test('deriveInvitationStates: a re-accept (idempotent resend)'
+ ' derives exactly ONE \'accepted\' row, keyed to the FIRST'
+ ' accept\'s own event id', async () => {
    const db = await seed();
    const tokenA = await adminToken('adminA', 'A');
    await person(
        db, 'invitee-reaccept', 'Reaccept Invitee',
        'invitee-reaccept@x.com',
    );
    const inviteeToken = await organizationToken(
        'invitee-reaccept', 'A',
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/A/invitations/', tokenA,
        {
            email: 'invitee-reaccept@x.com',
            invitationId: 'inv-reaccept',
            grantEventId: 'ev-reaccept-grant',
            grantAt: '2026-04-02T00:00:00.000000Z',
        },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const firstAccept = await handleRequest(db, req(
        'PUT',
        '/identities/invitee-reaccept/invitations/inv-reaccept',
        inviteeToken,
        {
            state: 'accepted',
            membershipId: 'ms-reaccept-1',
            eventId: 'ev-reaccept-accept-1',
            at: '2026-04-02T00:00:00.000001Z',
        },
    ));
    assert.equal(firstAccept.status, 204, 'first accept failed');

    const secondAccept = await handleRequest(db, req(
        'PUT',
        '/identities/invitee-reaccept/invitations/inv-reaccept',
        inviteeToken,
        {
            state: 'accepted',
            membershipId: 'ms-reaccept-2',
            eventId: 'ev-reaccept-accept-2',
            at: '2026-04-02T00:00:00.000002Z',
        },
    ));
    assert.equal(
        secondAccept.status, 409, 're-accept is not pending',
    );

    const rows = await deriveInvitationStates(db);
    const accepted = rows.filter(
        (row) => row.entity_id === 'inv-reaccept'
            && row.state === 'accepted',
    );
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]!.id, 'ev-reaccept-accept-1');
    assert.equal(
        rows.some((row) => row.id === 'ev-reaccept-accept-2'),
        false,
    );
});

test('deriveInvitationStates: a re-decline (idempotent resend)'
+ ' derives exactly ONE \'declined\' row, keyed to the FIRST'
+ ' decline\'s own event id', async () => {
    const db = await seed();
    const tokenA = await adminToken('adminA', 'A');
    await person(
        db, 'invitee-redecline', 'Redecline Invitee',
        'invitee-redecline@x.com',
    );
    const inviteeToken = await organizationToken(
        'invitee-redecline', 'A',
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/A/invitations/', tokenA,
        {
            email: 'invitee-redecline@x.com',
            invitationId: 'inv-redecline',
            grantEventId: 'ev-redecline-grant',
            grantAt: '2026-04-03T00:00:00.000000Z',
        },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const firstDecline = await handleRequest(db, req(
        'PUT',
        '/identities/invitee-redecline/invitations/'
            + 'inv-redecline',
        inviteeToken,
        {
            state: 'declined',
            eventId: 'ev-redecline-decline-1',
            at: '2026-04-03T00:00:00.000001Z',
        },
    ));
    assert.equal(firstDecline.status, 204, 'first decline failed');

    const secondDecline = await handleRequest(db, req(
        'PUT',
        '/identities/invitee-redecline/invitations/'
            + 'inv-redecline',
        inviteeToken,
        {
            state: 'declined',
            eventId: 'ev-redecline-decline-2',
            at: '2026-04-03T00:00:00.000002Z',
        },
    ));
    assert.equal(
        secondDecline.status, 409,
        're-decline is not pending',
    );

    const rows = await deriveInvitationStates(db);
    const declined = rows.filter(
        (row) => row.entity_id === 'inv-redecline'
            && row.state === 'declined',
    );
    assert.equal(declined.length, 1);
    assert.equal(declined[0]!.id, 'ev-redecline-decline-1');
    assert.equal(
        rows.some((row) => row.id === 'ev-redecline-decline-2'),
        false,
    );
});

// deriveTrioFamilyStates / O(families) scan pin retired with
// the bulk lifecycle collection (C3). Per-id family history
// derives remain.
