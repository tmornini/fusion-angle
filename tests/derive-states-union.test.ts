import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    DEFAULT_LOCK_TIMEOUT, nowUtc, SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import {
    deriveStates,
    deriveStatesFor,
    deriveInvitationStates,
} from '../api/derive-states.ts';
import {
    formWritePair, appendMessagePair,
} from '../api/message-pair.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';

// Phase 11 Task 5: the six-source union (deriveStates) and its
// per-entity counterpart (deriveStatesFor) — the assembly this
// whole phase has been building toward. tests/derive-states-
// events.test.ts and tests/derive-states-work-orders.test.ts
// already prove each source's OWN mechanics (the pair-plane fence,
// the work-order replay); THIS file proves the ASSEMBLY: a hand-
// built, multi-family fixture drives ONE representative event
// through each of the six sources — a direct states/:id write, an
// idea's embedded trio, an AI member's create-op genesis, a work
// order's create-op birth, a flow-node delete AND restore, and an
// invitation's grant AND accept — across TWO organizations, so the
// assembled union's own fence and ordering are proven end to end,
// plus the dedup invariant's both branches (an identical collision
// is a harmless no-op; a divergent one crashes loud).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            ...(headers ?? {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom,
// the derive-states-events.test.ts precedent): every write below
// authorizes through organizationToken, whose gate check derives
// from the role_grants/memberships pair plane once they flip, so
// a raw row here would go derivation-invisible. Every id/field
// value stays IDENTICAL to the raw puts these replace — only the
// write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
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
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedRoleGrantPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/role-grants/' + id,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postRoleGrantDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

// Two orgs (A, B), one admin identity each — the derive-states-
// events.test.ts precedent, reused so every write below (ideas,
// ai-members, work-orders, flows, invitations, memberships) rides
// through ONE identity per org.
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    // Real organizations/:id documents (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves A/B
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRoleGrantPair(db, 'rg-a', {
        organization_id: 'A', identity_id: 'adminA',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedRoleGrantPair(db, 'rg-b', {
        organization_id: 'B', identity_id: 'adminB',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'adminA', at: AT,
    });
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B', identity_id: 'adminB', at: AT,
    });
    return db;
}

async function person(
    db: MemoryDbAdapter, id: string, name: string, email: string,
): Promise<void> {
    await db.members.put(id, { type: 'human' });
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, {
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
        state: 'active', state_at: at,
        state_event_id: stateEventId,
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
    initialState: string, initialStateEventId: string,
    initialStateAt: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/ai-members', token,
        {
            id,
            detail: aiMemberDetail('Bot ' + id),
            initialState, initialStateEventId, initialStateAt,
        },
    ));
    assert.equal(res.status, 204, 'ai-member create failed');
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

function emptyGraph(): string {
    return JSON.stringify({ nodes: [], edges: [] });
}

async function createFlowWithNodes(
    db: MemoryDbAdapter, token: string,
    flowId: string, nodeIds: readonly string[],
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/flows', token,
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
    assert.equal(res.status, 204, 'flow creation POST failed');
}

async function headResponseId(
    db: MemoryDbAdapter, token: string, flowId: string,
): Promise<string> {
    const got = await handleRequest(
        db, req('GET', '/flows/' + flowId, token),
    );
    const id = got.headers.get('Response-ID');
    assert.ok(id, 'no Response-ID on GET /flows/' + flowId);
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
    const headId = await headResponseId(db, token, flowId);
    const res = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
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
        { 'if-response-id': headId },
    ));
    assert.equal(res.status, 200, 'flow save PUT failed');
}

function workOrderBody(
    id: string, flowWorkOrderId: string, flowId: string,
    ats: readonly [string, string, string],
) {
    return {
        id,
        workOrder: {
            display_id: 'union-' + id,
            flow_graph: JSON.stringify({
                name: 'Union Fixture Flow',
                lockTimeout: 8 * 60 * 60,
                nodes: [], edges: [],
            }),
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
        'POST', '/work-orders', token,
        workOrderBody(
            id, id + '-fwo', 'flow-union-wo-placeholder',
            [
                '2026-02-01T00:00:00.000000Z',
                '2026-02-01T00:00:00.000001Z',
                '2026-02-01T00:00:00.000002Z',
            ],
        ),
    ));
    assert.equal(res.status, 204, 'work order create failed');
}

async function grantAndAccept(
    db: MemoryDbAdapter, adminToken: string,
    inviteeToken: string, inviteeEmail: string,
    invitationId: string, grantEventId: string, grantAt: string,
    membershipId: string, acceptEventId: string, acceptAt: string,
): Promise<void> {
    const grantRes = await handleRequest(db, req(
        'POST', '/invitations', adminToken,
        { email: inviteeEmail, invitationId, grantEventId, grantAt },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const acceptRes = await handleRequest(db, req(
        'POST', '/invitations/' + invitationId + '/acceptance',
        inviteeToken,
        { membershipId, acceptEventId, acceptAt },
    ));
    assert.equal(acceptRes.status, 204, 'accept failed');
}

interface UnionFixture {
    readonly db: MemoryDbAdapter;
    readonly ideaId: string;
    readonly aiMemberId: string;
    readonly workOrderId: string;
    readonly deletedNodeId: string;
    readonly restoredNodeId: string;
    readonly invitationId: string;
    readonly ghostEntityId: string;
    readonly foreignIdeaId: string;
}

// ONE representative event per source, all in org A, plus a
// foreign-org idea (org B) proving the assembled union still
// fences per row, not merely per family.
async function buildUnionFixture(): Promise<UnionFixture> {
    const db = await seed();
    const tokenA = await organizationToken('adminA', 'A');
    const tokenB = await organizationToken('adminB', 'B');

    // (a) a direct states/:id write, naming a genuine orphan —
    // no document pair anywhere names this entity.
    const ghostEntityId = 'ghost-union';
    const ghost = await handleRequest(db, req(
        'PUT', '/states/ev-ghost-union', tokenA,
        { entity_id: ghostEntityId, state: 'active', at: AT },
    ));
    assert.equal(ghost.status, 200);

    // (b) an idea's own embedded genesis trio, in org A — plus a
    // FOREIGN idea in org B (never included in A's own union).
    const ideaId = 'idea-union';
    const ideaRes = await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, tokenA,
        ideaDocument(
            'Union Idea', ideaId + '-genesis',
            '2026-01-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(ideaRes.status, 200);

    const foreignIdeaId = 'idea-union-foreign';
    const foreignIdeaRes = await handleRequest(db, req(
        'PUT', '/ideas/' + foreignIdeaId, tokenB,
        ideaDocument(
            'Foreign Idea', foreignIdeaId + '-genesis',
            '2026-01-02T00:00:00.000001Z',
        ),
    ));
    assert.equal(foreignIdeaRes.status, 200);

    // (c) an AI member's create-op genesis — membered into org A
    // so the fence resolves it there rather than as an orphan
    // (ai-members/human-members are GLOBAL plane; ownership rides
    // the membership pair plane, gate 4's leg (b)).
    const aiMemberId = 'ai-union';
    await createAiMember(
        db, tokenA, aiMemberId, 'active',
        aiMemberId + '-genesis', '2026-01-03T00:00:00.000000Z',
    );
    const membershipRes = await handleRequest(db, req(
        'PUT', '/memberships/ms-ai-union', tokenA,
        { organization_id: 'A', identity_id: aiMemberId, at: AT },
    ));
    assert.equal(membershipRes.status, 200);

    // (d) a work order's create-op birth (3 events).
    const workOrderId = 'wo-union';
    await createWorkOrder(db, tokenA, workOrderId);

    // (e) a flow with two nodes, then ONE save that deletes one
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

    // (f) an invitation's grant + accept.
    await person(
        db, 'invitee-union', 'Union Invitee',
        'invitee-union@x.com',
    );
    const inviteeToken = await organizationToken(
        'invitee-union', 'A',
    );
    const invitationId = 'inv-union';
    await grantAndAccept(
        db, tokenA, inviteeToken, 'invitee-union@x.com',
        invitationId, 'ev-union-grant',
        '2026-01-05T00:00:00.000000Z',
        'ms-union-accept', 'ev-union-accept',
        '2026-01-05T00:00:00.000001Z',
    );

    return {
        db, ideaId, aiMemberId, workOrderId,
        deletedNodeId, restoredNodeId, invitationId,
        ghostEntityId, foreignIdeaId,
    };
}

// ---- 1. the assembled union: coverage, dedup, fence, order ------

test('deriveStates: every family\'s event appears exactly once,'
+ ' the foreign org\'s row is fenced out, and the result is'
+ ' id-lex ordered', async () => {
    const fx = await buildUnionFixture();
    const rowsA = await deriveStates(fx.db, 'A');

    const expectedIds = [
        'ev-ghost-union',
        fx.ideaId + '-genesis',
        fx.aiMemberId + '-genesis',
        fx.workOrderId + '-ev1',
        fx.workOrderId + '-ev2',
        fx.workOrderId + '-ev3',
        'ev-union-deleted',
        'ev-union-restored',
        'ev-union-grant',
        'ev-union-accept',
    ];
    for (const id of expectedIds) {
        const matches = rowsA.filter((row) => row.id === id);
        assert.equal(
            matches.length, 1, id + ' must appear exactly once',
        );
    }

    // The foreign org's idea never leaks into A's fenced union.
    assert.equal(
        rowsA.some(
            (row) => row.id === fx.foreignIdeaId + '-genesis',
        ),
        false,
    );

    // byIdAscending — the states table's own id-lex order.
    const ids = rowsA.map((row) => row.id);
    assert.deepEqual(ids, [...ids].sort());

    // The foreign idea IS visible from org B's own union.
    const rowsB = await deriveStates(fx.db, 'B');
    assert.equal(
        rowsB.some(
            (row) => row.id === fx.foreignIdeaId + '-genesis',
        ),
        true,
    );
});

test('deriveStates: an identical cross-source id collision is a'
+ ' harmless duplicate — no crash, one row survives', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const sharedId = 'shared-id-identical';
    const sharedEventId = 'ev-shared-identical';
    const sharedAt = '2026-03-01T00:00:00.000000Z';

    const ideaRes = await handleRequest(db, req(
        'PUT', '/ideas/' + sharedId, token,
        ideaDocument('Shared', sharedEventId, sharedAt),
    ));
    assert.equal(ideaRes.status, 200);
    await createAiMember(
        db, token, sharedId, 'active', sharedEventId, sharedAt,
    );

    const rows = await deriveStates(db, 'A');
    const matches = rows.filter((row) => row.id === sharedEventId);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.entity_id, sharedId);
    assert.equal(matches[0]!.state, 'active');
    assert.equal(matches[0]!.at, sharedAt);
});

// A DIVERGENT collision cannot be constructed through two LIVE
// routes: both an idea's document write and an AI-member's
// create-op ALSO post to the real (old-plane) states table via
// states.postEvent, whose OWN LedgerImmutabilityError already
// rejects a differing re-put of the same event id before either
// write's message pair could ever be appended — the invariant
// this union's dedup-assert exists to catch is, for these two
// sources, already unreachable via any legitimate write sequence.
// So this test injects the colliding pairs directly at the
// message plane (formWritePair + appendMessagePair, which touch
// ONLY requests/responses, never the states table) — a forced,
// otherwise-impossible id collision, standing in for a genuine
// bug in one of the six derivations.
test('deriveStates: a DIVERGENT cross-source id collision crashes'
+ ' loud rather than silently picking a winner', async () => {
    const db = await seed();
    const collidingEventId = 'ev-collide-divergent';

    const ideaPair = await formWritePair({
        method: 'PUT',
        pathname: '/ideas/idea-collide',
        routePattern: 'ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', 'idea-collide'],
        headerFields: [],
        body: {
            state_event_id: collidingEventId,
            state: 'active',
            state_at: '2026-03-03T00:00:00.000000Z',
        },
        requesterIdentityId: 'adminA',
        requestAt: '2026-03-03T00:00:00.000000Z',
        organization: 'A',
        responseStatus: 200,
        responseBody: undefined,
        headPairId: undefined,
    });
    await appendMessagePair(db, ideaPair);

    const aiPair = await formWritePair({
        method: 'POST',
        pathname: '/ai-members',
        routePattern: 'ai-members',
        routeSegments: ['ai-members'],
        pathSegments: ['ai-members'],
        headerFields: [],
        body: {
            id: 'ai-collide',
            initialStateEventId: collidingEventId,
            initialState: 'archived',
            initialStateAt: '2026-03-03T00:00:00.000001Z',
        },
        requesterIdentityId: 'adminA',
        requestAt: '2026-03-03T00:00:00.000001Z',
        organization: undefined,
        responseStatus: 204,
        responseBody: undefined,
        headPairId: undefined,
    });
    await appendMessagePair(db, aiPair);

    await assert.rejects(
        () => deriveStates(db, 'A'),
        /colliding states rows/,
    );
});

// ---- 2. deriveStatesFor: per-family subsets, (at, id) order -----

test('deriveStatesFor: each family\'s own entity subset', async () => {
    const fx = await buildUnionFixture();

    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.ghostEntityId))
            .map((row) => row.id),
        ['ev-ghost-union'],
    );
    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.ideaId))
            .map((row) => row.id),
        [fx.ideaId + '-genesis'],
    );
    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.aiMemberId))
            .map((row) => row.id),
        [fx.aiMemberId + '-genesis'],
    );
    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.workOrderId))
            .map((row) => row.id),
        [
            fx.workOrderId + '-ev1', fx.workOrderId + '-ev2',
            fx.workOrderId + '-ev3',
        ],
    );
    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.deletedNodeId))
            .map((row) => row.id),
        ['ev-union-deleted'],
    );
    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.restoredNodeId))
            .map((row) => row.id),
        ['ev-union-restored'],
    );
    assert.deepEqual(
        (await deriveStatesFor(fx.db, 'A', fx.invitationId))
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
    const tokenA = await organizationToken('adminA', 'A');
    await person(
        db, 'invitee-dup', 'Dup Invitee', 'invitee-dup@x.com',
    );

    const first = await handleRequest(db, req(
        'POST', '/invitations', tokenA,
        {
            email: 'invitee-dup@x.com',
            invitationId: 'inv-dup-a',
            grantEventId: 'ev-dup-grant-a',
            grantAt: '2026-04-01T00:00:00.000000Z',
        },
    ));
    assert.equal(first.status, 200, 'first grant failed');

    const second = await handleRequest(db, req(
        'POST', '/invitations', tokenA,
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
        await db.states.getAllFor('inv-dup-b'), [],
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
    const tokenA = await organizationToken('adminA', 'A');
    await person(
        db, 'invitee-reaccept', 'Reaccept Invitee',
        'invitee-reaccept@x.com',
    );
    const inviteeToken = await organizationToken(
        'invitee-reaccept', 'A',
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/invitations', tokenA,
        {
            email: 'invitee-reaccept@x.com',
            invitationId: 'inv-reaccept',
            grantEventId: 'ev-reaccept-grant',
            grantAt: '2026-04-02T00:00:00.000000Z',
        },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const firstAccept = await handleRequest(db, req(
        'POST', '/invitations/inv-reaccept/acceptance',
        inviteeToken,
        {
            membershipId: 'ms-reaccept-1',
            acceptEventId: 'ev-reaccept-accept-1',
            acceptAt: '2026-04-02T00:00:00.000001Z',
        },
    ));
    assert.equal(firstAccept.status, 204, 'first accept failed');

    const secondAccept = await handleRequest(db, req(
        'POST', '/invitations/inv-reaccept/acceptance',
        inviteeToken,
        {
            membershipId: 'ms-reaccept-2',
            acceptEventId: 'ev-reaccept-accept-2',
            acceptAt: '2026-04-02T00:00:00.000002Z',
        },
    ));
    assert.equal(
        secondAccept.status, 204, 're-accept must stay a no-op',
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
    const tokenA = await organizationToken('adminA', 'A');
    await person(
        db, 'invitee-redecline', 'Redecline Invitee',
        'invitee-redecline@x.com',
    );
    const inviteeToken = await organizationToken(
        'invitee-redecline', 'A',
    );

    const grantRes = await handleRequest(db, req(
        'POST', '/invitations', tokenA,
        {
            email: 'invitee-redecline@x.com',
            invitationId: 'inv-redecline',
            grantEventId: 'ev-redecline-grant',
            grantAt: '2026-04-03T00:00:00.000000Z',
        },
    ));
    assert.equal(grantRes.status, 200, 'grant failed');

    const firstDecline = await handleRequest(db, req(
        'POST', '/invitations/inv-redecline/decline',
        inviteeToken,
        {
            declineEventId: 'ev-redecline-decline-1',
            declineAt: '2026-04-03T00:00:00.000001Z',
        },
    ));
    assert.equal(firstDecline.status, 204, 'first decline failed');

    const secondDecline = await handleRequest(db, req(
        'POST', '/invitations/inv-redecline/decline',
        inviteeToken,
        {
            declineEventId: 'ev-redecline-decline-2',
            declineAt: '2026-04-03T00:00:00.000002Z',
        },
    ));
    assert.equal(
        secondDecline.status, 204,
        're-decline must stay a no-op',
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
