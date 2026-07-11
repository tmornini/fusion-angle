import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    organizationRow,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';

// Flow-graph entity deletion events must be fenced by the
// flow's owning org. A 'deleted' states event whose entity_id
// is a flow_nodes or flow_edges id must NOT be visible through
// another tenant's /states or entity-states/:id/history
// reads.
//
// Before the two-hop probe in ownerOrganizationOfEntity, these ids
// matched NO org-owned probe and fell through to the membership
// ledger (also no match) → null → orphan → VISIBLE to every
// tenant (the leak). This test suite pins that the fence is
// closed.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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

// Flow-graph deletion/revival sidecar events ride a locked
// flows/:id PUT's graphDelta.deletions / revivals (states/:id
// retired). Caller supplies the If-Response-ID of the current
// document head.
async function seedGraphDeletions(
    db: MemoryDbAdapter,
    organization: string,
    flowId: string,
    deletions: readonly {
        eventId: string;
        entityId: string;
        at: string;
    }[],
    ifResponseId: string,
): Promise<void> {
    const token = await organizationToken(
        'current', organization,
    );
    const res = await handleRequest(db, new Request(
        BASE + '/flows/' + flowId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
                'If-Response-ID': ifResponseId,
            },
            body: JSON.stringify({
                name: 'Flow A',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 0,
                state: 'updated',
                state_at: AT,
                state_event_id: flowId + '-del-save',
                graph: JSON.stringify({
                    nodes: [], edges: [],
                }),
                graphDelta: {
                    nodes: [], edges: [],
                    deletions,
                    memberEvents: [],
                    attributeEvents: [],
                },
                revivals: [],
            }),
        },
    ));
    assert.equal(res.status, 200);
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the org-A/org-B admin checks below derive from the pair plane
// once role_grants/memberships flip, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw puts these replace — only the write mechanism changes.
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

// Two orgs: A (admin = current) and B. A flow + node + edge
// seeded in org A. Deletion events posted for the node and
// edge (the 'deleted' state). `current` is admin+member of A;
// no membership in B.
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    // A's own organizations/:id document, FIRST and below-facade
    // (Phase 13 Task 3's fixture prerequisite): organizationIds
    // (Phase 12 Task 5, api/derive-states.ts) is the ALL-orgs scan
    // resolveFlowGraphOwner walks to find node-a/edge-a's true
    // owner, and deriveMembershipsForIdentity's own enumerate-
    // then-probe (via deriveOrganizations) needs A to already be
    // derivable before 'current's role-grant/membership pairs
    // below can resolve — a live PUT authenticated with a token
    // ALREADY scoped to A cannot bootstrap A itself. B stays a raw
    // row: resolveFlowGraphOwner always checks the BOUND org first
    // regardless of organizationIds' contents, so a B-bound read
    // below never needs B itself to be derivable, only A.
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedRoleGrantPair(db, 'rg-current-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-current-a', {
        organization_id: 'A', identity_id: 'current',
        at: AT,
    });
    // Phase Final Stage B: organizations table retired
    // — B need not derive for membership-filter
    // exclusion of non-members.
    // Seeded through the wire (NAMED re-pin: the READ-side
    // pair-plane fence, api/derive-states.ts's
    // resolveFlowGraphOwner, resolves a flow-node/edge's owner
    // ONLY by finding its id inside the flow's OWN document-pair
    // graphDelta — raw db.flows/flowNodes/flowEdges puts leave
    // no such pair, so node-a/edge-a's own deletion events would
    // resolve as visible ORPHANs instead of fenced-hidden A-owned
    // rows, once GET /states/GET entity-states/:id/history are
    // flipped. Mirrors tests/drift-states.test.ts's own case 5a
    // POST /flows precedent.
    const created = await handleRequest(db, req(
        'POST', '/flows', await organizationToken('current', 'A'),
        {
            id: 'flow-a',
            flow: {
                name: 'Flow A', is_locked: false,
                is_auto_layout: false, is_auto_fit: false,
                lock_timeout: 0,
            },
            projectFlowId: 'flow-a-pf',
            projectFlow: {
                project_id: 'flow-a-proj', flow_id: 'flow-a',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: 'flow-a-genesis',
            initialStateAt: AT,
            graphDelta: {
                nodes: [{
                    id: 'node-a', flow_id: 'flow-a',
                    name: 'Node A',
                    position_x: 0, position_y: 0,
                    is_create: false, is_archive: false,
                    task_instructions: '', at: AT,
                }],
                edges: [{
                    id: 'edge-a', flow_id: 'flow-a',
                    name: 'Edge A',
                    from_node_id: 'node-a', to_node_id: 'node-a',
                    at: AT,
                }],
                deletions: [], memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(created.status, 204);
    // Locked flows/:id PUT needs the DOCUMENT head's
    // Response-ID (GET, not the create operation pair).
    const token = await organizationToken('current', 'A');
    const got = await handleRequest(
        db, req('GET', '/flows/flow-a', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId, 'GET /flows must mint Response-ID');
    // Sidecar 'deleted' events for node-a / edge-a ride
    // graphDelta.deletions — these are the events that must
    // be fenced by the flow's owning org.
    await seedGraphDeletions(
        db, 'A', 'flow-a', [
            {
                eventId: 'se-node-del',
                entityId: 'node-a',
                at: AT,
            },
            {
                eventId: 'se-edge-del',
                entityId: 'edge-a',
                at: AT,
            },
        ],
        headId!,
    );
    return db;
}

// GET /organizations/{org}/states through the named facade.
async function getStates(
    db: MemoryDbAdapter, organization: string,
): Promise<{ id: string }[]> {
    const token = await organizationToken('current', organization);
    const res = await handleRequest(
        db, req('GET', '/organizations/' + organization + '/states', token),
    );
    assert.equal(res.status, 200);
    return res.json() as Promise<{ id: string }[]>;
}

// GET /organizations/{org}/entity-states/{entityId}/history
// status. bare entity-states/:id RETIRED (Phase 15 Task 7);
// re-pin pass-first onto surviving /history (same Region A
// ownership guard — 200 own / 404 foreign).
async function entityStatesHistoryStatus(
    db: MemoryDbAdapter, organization: string, entityId: string,
): Promise<number> {
    const token = await organizationToken('current', organization);
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/' + organization
            + '/entity-states/' + entityId + '/history',
        token,
    ));
    return res.status;
}

// ---- Node deletion event fence ----

test('node deletion event is visible through org A', async () => {
    const db = await seed();
    const rows = await getStates(db, 'A');
    const ids = rows.map(r => r.id);
    assert.ok(ids.includes('se-node-del'),
        'org A must see its own node deletion event');
});

test('node deletion event is hidden from org B', async () => {
    const db = await seed();
    // Sidecar event rides the flow document pair (graphDelta
    // deletions). Prove the derived collection carries it in
    // org A before proving B cannot see it.
    const aRows = await getStates(db, 'A');
    assert.ok(
        aRows.some(r => r.id === 'se-node-del'),
        'se-node-del must derive from graphDelta.deletions',
    );
    // Grant current admin access to B so the facade opens.
    // B's own organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; idempotent — a no-op if already
    // seeded): 'current' becomes a genuine member of B in THIS
    // case, so the tenancy fence (deriveMembershipsForIdentity's
    // enumerate-then-probe, via deriveOrganizations) needs B to be
    // derivable, unlike seed()'s own B-stays-raw precedent above
    // (which never grants 'current' membership in B).
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRoleGrantPair(db, 'rg-current-b', {
        organization_id: 'B', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-current-b', {
        organization_id: 'B', identity_id: 'current',
        at: AT,
    });
    const rows = await getStates(db, 'B');
    const ids = rows.map(r => r.id);
    assert.ok(!ids.includes('se-node-del'),
        'org B must NOT see the node deletion event');
});

// ---- Edge deletion event fence ----

test('edge deletion event is visible through org A', async () => {
    const db = await seed();
    const rows = await getStates(db, 'A');
    const ids = rows.map(r => r.id);
    assert.ok(ids.includes('se-edge-del'),
        'org A must see its own edge deletion event');
});

test('edge deletion event is hidden from org B', async () => {
    const db = await seed();
    const aRows = await getStates(db, 'A');
    assert.ok(
        aRows.some(r => r.id === 'se-edge-del'),
        'se-edge-del must derive from graphDelta.deletions',
    );
    // B's own organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; idempotent — a no-op if already
    // seeded): 'current' becomes a genuine member of B in THIS
    // case, so the tenancy fence (deriveMembershipsForIdentity's
    // enumerate-then-probe, via deriveOrganizations) needs B to be
    // derivable, unlike seed()'s own B-stays-raw precedent above
    // (which never grants 'current' membership in B).
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRoleGrantPair(db, 'rg-current-b', {
        organization_id: 'B', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-current-b', {
        organization_id: 'B', identity_id: 'current',
        at: AT,
    });
    const rows = await getStates(db, 'B');
    const ids = rows.map(r => r.id);
    assert.ok(!ids.includes('se-edge-del'),
        'org B must NOT see the edge deletion event');
});

// ---- entity-states history guard (bare route retired) ----

test('entity-states history for a node id is 200 in org A',
async () => {
    const db = await seed();
    const status = await entityStatesHistoryStatus(
        db, 'A', 'node-a');
    assert.equal(status, 200);
});

test('entity-states history for a node id is 404 in org B',
async () => {
    const db = await seed();
    // B's own organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; idempotent — a no-op if already
    // seeded): 'current' becomes a genuine member of B in THIS
    // case, so the tenancy fence (deriveMembershipsForIdentity's
    // enumerate-then-probe, via deriveOrganizations) needs B to be
    // derivable, unlike seed()'s own B-stays-raw precedent above
    // (which never grants 'current' membership in B).
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRoleGrantPair(db, 'rg-current-b', {
        organization_id: 'B', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-current-b', {
        organization_id: 'B', identity_id: 'current',
        at: AT,
    });
    const status = await entityStatesHistoryStatus(
        db, 'B', 'node-a');
    assert.equal(status, 404);
});

// ---- Orphan path retired with states/:id --------------------
// A standalone event whose entity_id matched nothing used to
// be visible to every org. No surviving writer can mint an
// orphan entity_id (document trios and ops name owned
// entities), so the wire pin is: PUT /states/:id is a router
// 404 even for a ghost body.

test('orphan states/:id write is a router 404',
async () => {
    const db = await seed();
    const token = await organizationToken('current', 'A');
    const res = await handleRequest(db, req(
        'PUT', '/states/se-ghost', token, {
            entity_id: 'ghost',
            state: 'deleted',
            at: AT,
        },
    ));
    assert.equal(res.status, 404);
    const rowsA = await getStates(db, 'A');
    assert.ok(
        !rowsA.some(r => r.id === 'se-ghost'),
        'no orphan event lands after the 404',
    );
});
