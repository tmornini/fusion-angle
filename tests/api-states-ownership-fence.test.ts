import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { jsonObjectField, nowUtc, SYSTEM_MEMBER_ID } from
    '../api/types.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';

// The state ownership WRITE fence (Phase 11 Task 1).
// MEMBER_VERBS permits member-tier PUT /states/:id
// (api/authorization.ts), and the body names entity_id
// itself — with no upstream ownership check, a member of one
// org could PUT a state event naming ANOTHER org's entity and
// forge or tombstone its lifecycle. The fence resolves
// ownership through the RAW probes (deleted-blind), so a
// foreign entity 404s whether it is live or already
// soft-deleted.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
// Strictly later than AT: at an EQUAL `at`, latestByKey's
// (at, id) tiebreak falls to the larger event id, and
// 'idea-b-genesis' sorts after 'ev-b-own-delete' — an
// equal-`at` delete would lose the tiebreak and idea-b
// would never genuinely read as deleted.
const LATER = '2026-06-01T00:00:00.000000Z';

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
            Authorization: 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

function tokenFor(
    sub: string,
    organization: string,
): Promise<string> {
    return organizationToken(sub, organization);
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the MEMBER_VERBS gate below authorizes through role_grants/
// memberships once they derive from the pair plane, so a raw
// row here would go derivation-invisible. Every id/field value
// stays IDENTICAL to the raw puts these replace — only the write
// mechanism changes.
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

// Two orgs (A, B), one member each (the tier MEMBER_VERBS
// actually grants PUT /states to), an idea owned by each org,
// plus a work order and an objective owned by A — the other
// organizationOwnedProbes table kinds case 4 exercises —
// and memberA's own member id, resolved through the
// membership-ledger fallback rather than any owned table.
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    // Real organizations/:id documents (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves the org
    // derivation-invisible, so deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations) never reaches
    // memberA's/memberB's membership prefix below.
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'memberA', at: AT,
    });
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B', identity_id: 'memberB', at: AT,
    });
    await seedRoleGrantPair(db, 'rg-a', {
        organization_id: 'A', identity_id: 'memberA',
        role: 'member', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedRoleGrantPair(db, 'rg-b', {
        organization_id: 'B', identity_id: 'memberB',
        role: 'member', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await db.ideas.put('idea-a', {
        organization_id: 'A', title: 'Idea A', position: 0,
        problem_statement: '', target_users: '',
        proposed_solution: '', expected_outcome: '',
        success_metrics: '',
    });
    // Seeded through the wire (NAMED re-pin: the READ-side
    // pair-plane fence, api/derive-states.ts's
    // resolveOwningOrganization, resolves an org-nested entity's
    // owner ONLY from a genuine response row at its own uri_id —
    // a raw db.ideas.put leaves none, so 'org B deleting its own
    // idea...' below would see idea-b's own events resolve as a
    // visible ORPHAN once GET /states/GET entity-states/:id/
    // history are flipped). idea-a stays a raw row — no test
    // here reads it through either flipped route.
    const ideaBWrite = await handleRequest(db, req(
        'PUT', '/ideas/idea-b', await tokenFor('memberB', 'B'),
        {
            title: 'Idea B', position: 0,
            problem_statement: '', target_users: '',
            proposed_solution: '', expected_outcome: '',
            success_metrics: '',
            state: 'active', state_at: AT,
            state_event_id: 'idea-b-genesis',
        },
    ));
    assert.equal(ideaBWrite.status, 200);
    await db.workOrders.put('wo-a', {
        organization_id: 'A', display_id: 'WO-1',
        flow_graph: jsonObjectField({
            name: 'Flow', lockTimeout: 0, nodes: [], edges: [],
        }),
        position: 0,
    });
    await db.objectives.put('obj-a', {
        organization_id: 'A', position: 0,
    });
    return db;
}

// ---- 1. cross-org write is 404, and writes nothing ----

test('a member of org A cannot PUT a states event naming an'
+ ' org-B entity_id', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-cross', await tokenFor('memberA', 'A'),
        { entity_id: 'idea-b', state: 'active', at: AT },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        { error: 'Not found: /states/ev-cross' },
    );
    await assert.rejects(
        () => db.states.getById('ev-cross'),
        EntityNotFoundError,
    );
});

// ---- 2. own-org write succeeds ----

test('a member of org A can PUT a states event naming its'
+ ' own idea', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-own', await tokenFor('memberA', 'A'),
        { entity_id: 'idea-a', state: 'active', at: AT },
    ));
    assert.equal(res.status, 200);
    assert.equal(
        (await db.states.getById('ev-own')).entity_id,
        'idea-a',
    );
});

// ---- 3. genuine orphan write succeeds ----

test('a state event naming an entity_id owned by no row'
+ ' still writes (an orphan, not a foreign tenant)',
async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-orphan', await tokenFor('memberA', 'A'),
        { entity_id: 'ghost-1', state: 'active', at: AT },
    ));
    assert.equal(res.status, 200);
});

// ---- 4. legitimate own-org flows across entity kinds ----

test('workbox unclaim (own-org work order) still writes',
async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-wo', await tokenFor('memberA', 'A'),
        { entity_id: 'wo-a', state: 'claim_released', at: AT },
    ));
    assert.equal(res.status, 200);
});

test('member archive (own-org member, via the membership'
+ ' ledger) still writes', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-member', await tokenFor('memberA', 'A'),
        { entity_id: 'memberA', state: 'archived', at: AT },
    ));
    assert.equal(res.status, 200);
});

test('objective archive (own-org objective) still writes',
async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-obj', await tokenFor('memberA', 'A'),
        { entity_id: 'obj-a', state: 'archived', at: AT },
    ));
    assert.equal(res.status, 200);
});

// ---- 5. field-values sibling ----

test('a field value on a cross-org parent event is 404, and'
+ ' writes nothing', async () => {
    const db = await seed();
    await db.states.put('ev-b', {
        entity_id: 'idea-b', state: 'active',
        member_id: 'memberB', at: AT,
    });
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-b/field-values/fv-cross',
        await tokenFor('memberA', 'A'),
        {
            state_event_id: 'ev-b', attribute_id: 'attr-1',
            value: 'x',
        },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        {
            error:
                'Not found: /states/ev-b/field-values/fv-cross',
        },
    );
    await assert.rejects(
        () => db.stateFieldValues.getById('fv-cross'),
        EntityNotFoundError,
    );
});

test('a field value on an own-org parent event writes',
async () => {
    const db = await seed();
    await db.states.put('ev-a', {
        entity_id: 'idea-a', state: 'active',
        member_id: 'memberA', at: AT,
    });
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-a/field-values/fv-own',
        await tokenFor('memberA', 'A'),
        {
            state_event_id: 'ev-a', attribute_id: 'attr-1',
            value: 'x',
        },
    ));
    assert.equal(res.status, 200);
    assert.equal(
        (await db.stateFieldValues.getById('fv-own')).value,
        'x',
    );
});

// ---- 6. the write escalation: live AND already-deleted ----

test('PUT states/:id naming an org-B LIVE entity is 404',
async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-live', await tokenFor('memberA', 'A'),
        { entity_id: 'idea-b', state: 'deleted', at: AT },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        { error: 'Not found: /states/ev-live' },
    );
});

test('PUT states/:id naming an ALREADY-DELETED org-B entity'
+ ' is still 404 (the raw probe resolves it)', async () => {
    const db = await seed();
    await db.states.put('ev-b-del', {
        entity_id: 'idea-b', state: 'deleted',
        member_id: 'memberB', at: AT,
    });
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-second', await tokenFor('memberA', 'A'),
        { entity_id: 'idea-b', state: 'active', at: AT },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        { error: 'Not found: /states/ev-second' },
    );
});

// ---- 7. the read leak: org B's OWN deletion of its idea ----
// must stay hidden from every OTHER org, not resolve to a
// visible orphan. The read-side companion of the write fence
// above: rawOrganizationOwnedProbes resolves a DELETED
// entity to its true owner, closing the leak where the
// filtered organizationOwnedProbes let a foreign org's own
// deletion resolve to a visible "orphan".

test('org B deleting its own idea hides it from org A'
+ ' entity-states history (was visible pre-fix)', async () => {
    const db = await seed();
    const del = await handleRequest(db, req(
        'PUT', '/states/ev-b-own-delete',
        await tokenFor('memberB', 'B'),
        { entity_id: 'idea-b', state: 'deleted', at: LATER },
    ));
    assert.equal(del.status, 200);
    const fromA = await handleRequest(db, req(
        'GET', '/entity-states/idea-b/history',
        await tokenFor('memberA', 'A'),
    ));
    assert.equal(fromA.status, 404);
    assert.deepEqual(
        await fromA.json(),
        {
            error:
                'Not found: /entity-states/idea-b/history',
        },
    );
    const listFromA = await handleRequest(db, req(
        'GET', '/states', await tokenFor('memberA', 'A'),
    ));
    assert.equal(listFromA.status, 200);
    const idsFromA =
        (await listFromA.json() as { id: string }[])
            .map(r => r.id);
    assert.ok(
        !idsFromA.includes('ev-b-own-delete'),
        "org A must not see org B's own deletion event",
    );
    const fromB = await handleRequest(db, req(
        'GET', '/entity-states/idea-b/history',
        await tokenFor('memberB', 'B'),
    ));
    assert.equal(fromB.status, 200);
});
