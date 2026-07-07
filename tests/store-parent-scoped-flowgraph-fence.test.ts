import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { organizationRow } from './test-fixtures.ts';

// Flow-graph entity deletion events must be fenced by the
// flow's owning org. A 'deleted' states event whose entity_id
// is a flow_nodes or flow_edges id must NOT be visible through
// another tenant's /states or entity-states/:id reads.
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
// the flipped GET /states and GET /entity-states/:id routes
// derive from the message ledger, not the raw states table — a
// raw db.states.put leaves no pair at this address, so this
// suite's fence assertions must land through the wire.
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

// Two orgs: A (admin = current) and B. A flow + node + edge
// seeded in org A. Deletion events posted for the node and
// edge (the 'deleted' state). `current` is admin+member of A;
// no membership in B.
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.organizations.put('A', organizationRow('Acme'));
    await db.organizations.put('B', organizationRow('Beta'));
    await db.roleGrants.put('rg-current-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await db.memberships.put('m-current-a', {
        organization_id: 'A', identity_id: 'current',
        at: AT,
    });
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

// GET /organizations/{org}/entity-states/{entityId} status.
async function entityStatesStatus(
    db: MemoryDbAdapter, organization: string, entityId: string,
): Promise<number> {
    const token = await organizationToken('current', organization);
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/' + organization
            + '/entity-states/' + entityId,
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
    // Prove the row EXISTS in raw storage — exclusion is
    // the fence, not an absent row.
    assert.equal(
        (await db.states.getById('se-node-del')).id,
        'se-node-del',
    );
    // Grant current admin access to B so the facade opens.
    await db.roleGrants.put('rg-current-b', {
        organization_id: 'B', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await db.memberships.put('m-current-b', {
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
    assert.equal(
        (await db.states.getById('se-edge-del')).id,
        'se-edge-del',
    );
    await db.roleGrants.put('rg-current-b', {
        organization_id: 'B', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await db.memberships.put('m-current-b', {
        organization_id: 'B', identity_id: 'current',
        at: AT,
    });
    const rows = await getStates(db, 'B');
    const ids = rows.map(r => r.id);
    assert.ok(!ids.includes('se-edge-del'),
        'org B must NOT see the edge deletion event');
});

// ---- entity-states guard ----

test('entity-states for a node id is 200 in org A', async () => {
    const db = await seed();
    const status = await entityStatesStatus(
        db, 'A', 'node-a');
    assert.equal(status, 200);
});

test('entity-states for a node id is 404 in org B', async () => {
    const db = await seed();
    await db.roleGrants.put('rg-current-b', {
        organization_id: 'B', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await db.memberships.put('m-current-b', {
        organization_id: 'B', identity_id: 'current',
        at: AT,
    });
    const status = await entityStatesStatus(
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
