import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
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
import {
    stateEventCollisionFromPairs,
} from '../api/derive-states.ts';

// The state ownership WRITE fence (Phase 11 Task 1).
// MEMBER_VERBS permits member-tier PUT /states/:id
// (api/authorization.ts), and the body names entity_id
// itself — with no upstream ownership check, a member of one
// org could PUT a state event naming ANOTHER org's entity and
// forge or tombstone its lifecycle. The fence resolves
// ownership on the PAIR PLANE (Phase 15 Task 5,
// resolveOwningOrganization), so a foreign entity 404s whether
// it is live, soft-deleted, or hard-spliced.

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
    // Phase Final Stage B: ideas table retired. Seed idea-a
    // and idea-b through the wire so resolveOwningOrganization
    // sees genuine response rows at each uri_id.
    const ideaAWrite = await handleRequest(db, req(
        'PUT', '/ideas/idea-a', await tokenFor('memberA', 'A'),
        {
            title: 'Idea A', position: 0,
            problem_statement: '', target_users: '',
            proposed_solution: '', expected_outcome: '',
            success_metrics: '',
            state: 'active', state_at: AT,
            state_event_id: 'idea-a-genesis',
        },
    ));
    assert.equal(ideaAWrite.status, 200);
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
    // Phase Final Stage B: work_orders table retired — seed
    // through the live document PUT so the pair plane owns it.
    const woWrite = await handleRequest(db, req(
        'PUT', '/organizations/A/work-orders/wo-a',
        await tokenFor('memberA', 'A'),
        {
            display_id: 'WO-1',
            flow_graph: jsonObjectField({
                name: 'Flow', lockTimeout: 0,
                nodes: [], edges: [],
            }),
            position: 0,
        },
    ));
    assert.equal(woWrite.status, 200);
    // Phase Final Stage B: objectives table retired — seed
    // through the live document PUT so the pair plane owns it.
    const objWrite = await handleRequest(db, req(
        'PUT', '/organizations/A/objectives/obj-a',
        await tokenFor('memberA', 'A'),
        { position: 0 },
    ));
    assert.equal(objWrite.status, 200);
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
    // Phase Final Stage B: states table retired —
    // 404 above is the write-nothing pin.
});

// ---- 2. own-org write succeeds ----

test('a member of org A can PUT a states event naming its'
+ ' own idea', async () => {
    const db = await seed();
    const body = {
        entity_id: 'idea-a', state: 'active', at: AT,
    };
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-own', await tokenFor('memberA', 'A'),
        body,
    ));
    assert.equal(res.status, 200);
    // Phase Final Task 1(b): row half stripped — pin the pair
    // plane (collision same) and the 200 wire body entity_id.
    const wire = await res.json() as { entity_id: string };
    assert.equal(wire.entity_id, 'idea-a');
    assert.equal(
        await stateEventCollisionFromPairs(
            db, 'ev-own', {
                entity_id: 'idea-a',
                state: 'active',
                member_id: 'memberA',
                at: AT,
            },
        ),
        'same',
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

// ---- 5. field-values sibling RETIRED (Phase 15 Task 7) ----
// Leaf PUT/DELETE states/:id/field-values/:fvid and its
// Region B parent-event fence retired with the routes.
// Surviving fence pins: collection GET (organization-
// isolation nested field-values tests) + PUT states/:id
// ownership (this file's §1–4, §6+).

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
+ ' is still 404 (the pair plane resolves it)', async () => {
    const db = await seed();
    // Phase Final Stage B: states table retired.
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
// above: resolveOwningOrganization resolves a DELETED
// entity to its true owner via the append-only pair plane,
// closing the leak where a filtered row-plane probe let a
// foreign org's own deletion resolve to a visible "orphan".

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

// ---- 8. WP1 — organization id as entity_id (Phase 15 Task 5) --
// Pair-plane self-as-owner (Task 1 gate 3) makes an organizations
// document id resolve to ITSELF. A foreign tenant's forged
// PUT /states/:id naming that id is 404; derived reads hide it.
// Own-org write still succeeds (self-as-owner, not orphan).

test('WP1: foreign PUT states/:id naming an ORGANIZATION id'
+ ' as entity_id is 404 and writes nothing', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-org-forge',
        await tokenFor('memberA', 'A'),
        { entity_id: 'B', state: 'active', at: AT },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        { error: 'Not found: /states/ev-org-forge' },
    );
    // Phase Final Stage B: states table retired —
    // 404 above is the write-nothing pin.
});

test('WP1: own-org PUT states/:id naming its ORGANIZATION'
+ ' id as entity_id still writes', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-org-own',
        await tokenFor('memberA', 'A'),
        { entity_id: 'A', state: 'active', at: AT },
    ));
    assert.equal(res.status, 200);
    // Phase Final Task 1(b): row half stripped — pin pair plane
    // + wire body.
    const wire = await res.json() as { entity_id: string };
    assert.equal(wire.entity_id, 'A');
    assert.equal(
        await stateEventCollisionFromPairs(
            db, 'ev-org-own', {
                entity_id: 'A',
                state: 'active',
                member_id: 'memberA',
                at: AT,
            },
        ),
        'same',
    );
});

test('WP1: entity-states history for a foreign ORGANIZATION'
+ ' id is 404 (hidden on the derived read path)', async () => {
    const db = await seed();
    // Seed a state event ON organization B from B itself so
    // the history would be non-empty if the fence opened.
    const own = await handleRequest(db, req(
        'PUT', '/states/ev-org-b-seed',
        await tokenFor('memberB', 'B'),
        { entity_id: 'B', state: 'active', at: AT },
    ));
    assert.equal(own.status, 200);
    const fromA = await handleRequest(db, req(
        'GET', '/entity-states/B/history',
        await tokenFor('memberA', 'A'),
    ));
    assert.equal(fromA.status, 404);
    assert.deepEqual(
        await fromA.json(),
        { error: 'Not found: /entity-states/B/history' },
    );
    const fromB = await handleRequest(db, req(
        'GET', '/entity-states/B/history',
        await tokenFor('memberB', 'B'),
    ));
    assert.equal(fromB.status, 200);
});

// ---- 9. records hard-delete forgery (finding 1i inverted) ----
// DELETE /records/:id is a genuine row splice with NO states
// tombstone. Raw probes treated the spliced id as an orphan and
// admitted a foreign PUT. The pair plane still owns the id via
// the document history — foreign forge 404s; own-org write
// still succeeds.

test('records hard-delete forgery: foreign PUT states/:id'
+ ' naming a spliced record id is 404', async () => {
    const db = await seed();
    const created = await handleRequest(db, req(
        'PUT', '/records/rec-b1',
        await tokenFor('memberB', 'B'),
        {
            name: 'Rec B', description: '', position: 0,
            state: 'active', state_at: AT,
            state_event_id: 'rec-b1-genesis',
        },
    ));
    assert.equal(created.status, 200);
    const deleted = await handleRequest(db, req(
        'DELETE', '/records/rec-b1',
        await tokenFor('memberB', 'B'),
    ));
    assert.equal(deleted.status, 204);
    // Phase Final Task 2: records ROW half stripped — wire
    // GET 404s on the DELETE tombstone (pair plane).
    const gone = await handleRequest(db, req(
        'GET', '/records/rec-b1',
        await tokenFor('memberB', 'B'),
    ));
    assert.equal(gone.status, 404);
    const forge = await handleRequest(db, req(
        'PUT', '/states/ev-rec-forge',
        await tokenFor('memberA', 'A'),
        { entity_id: 'rec-b1', state: 'active', at: AT },
    ));
    assert.equal(forge.status, 404);
    assert.deepEqual(
        await forge.json(),
        { error: 'Not found: /states/ev-rec-forge' },
    );
    // Phase Final Stage B: states table retired —
    // 404 above is the write-nothing pin.
    // Own org still owns the hard-spliced id on the pair plane.
    const own = await handleRequest(db, req(
        'PUT', '/states/ev-rec-own',
        await tokenFor('memberB', 'B'),
        { entity_id: 'rec-b1', state: 'active', at: AT },
    ));
    assert.equal(own.status, 200);
});

test('records hard-delete forgery: foreign entity-states'
+ ' history of a spliced record id is 404', async () => {
    const db = await seed();
    const created = await handleRequest(db, req(
        'PUT', '/records/rec-b2',
        await tokenFor('memberB', 'B'),
        {
            name: 'Rec B2', description: '', position: 1,
            state: 'active', state_at: AT,
            state_event_id: 'rec-b2-genesis',
        },
    ));
    assert.equal(created.status, 200);
    const deleted = await handleRequest(db, req(
        'DELETE', '/records/rec-b2',
        await tokenFor('memberB', 'B'),
    ));
    assert.equal(deleted.status, 204);
    const fromA = await handleRequest(db, req(
        'GET', '/entity-states/rec-b2/history',
        await tokenFor('memberA', 'A'),
    ));
    assert.equal(fromA.status, 404);
    assert.deepEqual(
        await fromA.json(),
        {
            error:
                'Not found: /entity-states/rec-b2/history',
        },
    );
    const fromB = await handleRequest(db, req(
        'GET', '/entity-states/rec-b2/history',
        await tokenFor('memberB', 'B'),
    ));
    assert.equal(fromB.status, 200);
});

// ---- Phase 15 Task 7: surviving fence pins after route
// retirements (re-pin pass) --------------------------------
// Wire delta (1) ONLY for retired routes (router 404). A
// foreign-404 that would pass as router miss after
// retirement is a STEALTH-WEAKENING trap — surviving
// addresses below still exercise the ownership fence.

test('retired bare GET states/:id is method-absent 405'
+ ' for OWN event too (PUT route survives; GET is gone'
+ ' — not a fence-only 404)', async () => {
    const db = await seed();
    await handleRequest(db, req(
        'PUT', '/states/ev-own-retire',
        await tokenFor('memberA', 'A'),
        { entity_id: 'idea-a', state: 'active', at: AT },
    ));
    // Phase Final Task 1(b): own event exists on the pair plane
    // (row half stripped); GET arm is gone; PUT pattern still
    // matches → 405, not fence 404.
    assert.equal(
        await stateEventCollisionFromPairs(
            db, 'ev-own-retire', {
                entity_id: 'idea-a',
                state: 'active',
                member_id: 'memberA',
                at: AT,
            },
        ),
        'same',
    );
    const res = await handleRequest(db, req(
        'GET', '/states/ev-own-retire',
        await tokenFor('memberA', 'A'),
    ));
    assert.equal(res.status, 405);
});

test('surviving GET entity-states/:id/history still fences'
+ ' foreign ownership (404 with Not found body)',
async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'GET', '/entity-states/idea-b/history',
        await tokenFor('memberA', 'A'),
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        {
            error:
                'Not found: /entity-states/idea-b/history',
        },
    );
});

test('retired leaf PUT field-values is router 404 (own'
+ ' parent event still present)', async () => {
    const db = await seed();
    await handleRequest(db, req(
        'PUT', '/states/ev-a-leaf',
        await tokenFor('memberA', 'A'),
        { entity_id: 'idea-a', state: 'active', at: AT },
    ));
    const res = await handleRequest(db, req(
        'PUT', '/states/ev-a-leaf/field-values/fv-x',
        await tokenFor('memberA', 'A'),
        {
            state_event_id: 'ev-a-leaf',
            attribute_id: 'attr-1',
            value: 'x',
        },
    ));
    assert.equal(res.status, 404);
    // Phase Final Stage B: state_field_values table retired —
    // 404 above is the residual pin (no row store to probe).
});
