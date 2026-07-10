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

// A states-log event, posted through the SAME wire-reachable
// PUT states/:id the live route serves (NAMED re-pin, Task 7):
// the flipped GET /states and GET entity-states/:id/history
// routes derive from the message ledger, not the raw states
// table — a raw db.states.put leaves no pair at this address,
// so this suite's fence assertions must land through the wire.
async function seedStateEvent(
    db: MemoryDbAdapter,
    organization: string,
    id: string,
    entityId: string,
    state: string,
): Promise<void> {
    const token = await organizationToken('current', organization);
    const res = await handleRequest(db, req(
        'PUT', '/states/' + id, token,
        { entity_id: entityId, state, at: AT },
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
    // Post 'deleted' state events with the node/edge ids as
    // entity_id — these are the events that must be fenced.
    await seedStateEvent(
        db, 'A', 'se-node-del', 'node-a', 'deleted',
    );
    await seedStateEvent(
        db, 'A', 'se-edge-del', 'edge-a', 'deleted',
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
    // Phase Final Task 1(b): event lives on the pair plane
    // only (row half stripped). Prove the pair EXISTS —
    // exclusion is the fence, not an absent write.
    const nodePairs = await db.responses.getAllWhere(
        'uri_id', 'se-node-del',
    );
    assert.ok(
        nodePairs.some((r) =>
            /\/states\/$/.test(r.uri_prefix)
            && r.status >= 200 && r.status < 300),
        'se-node-del must exist as a states/:id pair',
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
    // Phase Final Task 1(b): pair-plane existence pin (row
    // half stripped).
    const edgePairs = await db.responses.getAllWhere(
        'uri_id', 'se-edge-del',
    );
    assert.ok(
        edgePairs.some((r) =>
            /\/states\/$/.test(r.uri_prefix)
            && r.status >= 200 && r.status < 300),
        'se-edge-del must exist as a states/:id pair',
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

// ---- Orphan path: entity_id matches nothing → null → visible
// This preserves the existing orphan rule — do NOT break it.
// An event whose entity matches no org-owned store, no
// flow_node, no flow_edge, and no membership is visible.

test('orphan deletion event remains visible to all orgs',
async () => {
    const db = await seed();
    await seedStateEvent(db, 'A', 'se-ghost', 'ghost', 'deleted');
    const rows = await getStates(db, 'A');
    const ids = rows.map(r => r.id);
    assert.ok(ids.includes('se-ghost'),
        'orphan event must stay visible (null owner rule)');
});
