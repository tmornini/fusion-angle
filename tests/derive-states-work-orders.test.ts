import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import type { StateEntity } from '../api/types.ts';
import {
    jsonObjectField, MS_PER_SECOND, nowUtc, SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import {
    deriveWorkOrderLifecycle,
    deriveEventPairStates,
} from '../api/derive-states.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';

// Phase 11 Task 4: the work-order lifecycle derivation — source
// (d) of the states-log union. deriveEventPairStates (Task 2,
// source (a)) reads the states/:id address directly; this reader
// is DIFFERENT — it replays the work-order create/claim/
// transition OPERATION pairs, the one source the states/:id
// address never carries. Every SEEDED work order (the real
// mock-data seed) was formed via a bare document PUT with zero
// operation pairs, so its births ride source (a) alone — this
// reader emits NOTHING for it. Its own output materializes only
// for a work order created, claimed, or transitioned through the
// LIVE route, so a HYBRID work order (a seeded document plus a
// live claim) draws its births from source (a) and its claim from
// here, never both for the same event (case 6, below).

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
            Authorization: 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// A genuine real-time wait — the expired-takeover legs need REAL
// elapsed time to cross a tiny lockTimeout, since the LIVE route's
// isClaimEventExpired checks real Date.now(), never a body
// timestamp (tests/drift-work-orders.test.ts case 9's own idiom).
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Below-facade pair formation (the member-fixtures.ts idiom, the
// derive-states-events.test.ts precedent): every write below
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

async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    // A real organizations/:id document (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves A
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedRoleGrantPair(db, 'rg-a', {
        organization_id: 'A', identity_id: 'adminA',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'adminA', at: AT,
    });
    return db;
}

function workOrderFlowGraph(lockTimeoutSeconds: number): string {
    return jsonObjectField({
        name: 'Lifecycle Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [], edges: [],
    });
}

function createWorkOrderBody(
    id: string,
    flowWorkOrderId: string,
    flowId: string,
    graph: string,
    events: {
        readonly ids: readonly [string, string, string];
        readonly ats: readonly [string, string, string];
        readonly states: readonly [string, string, string];
    },
    joinAt: string,
): Record<string, unknown> {
    return {
        id,
        workOrder: {
            display_id: 'lifecycle-' + id,
            flow_graph: graph,
            position: 1,
        },
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: flowId,
            work_order_id: id,
            at: joinAt,
        },
        stateEventIds: events.ids,
        stateEventAts: events.ats,
        states: events.states,
    };
}

function forWorkOrder(
    rows: readonly StateEntity[], workOrderId: string,
): StateEntity[] {
    return rows.filter((row) => row.entity_id === workOrderId);
}

// -- 1. a live create births exactly the three initial events ----

test('a live create births exactly the three initial state'
+ ' events, byte-equal to the old plane', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-create-1';

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, workOrderId + '-fwo', 'flow-x',
            workOrderFlowGraph(8 * 60 * 60),
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [
                    '2026-05-02T00:00:00.000000Z',
                    '2026-05-02T00:00:00.000001Z',
                    '2026-05-02T00:00:00.000002Z',
                ],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 204);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    const old = await db.states.getAllFor(workOrderId);
    assert.equal(derived.length, 3);
    assert.deepEqual(derived, old);
});

// -- 2. EDGE 1: a SEEDED-shape work order births nothing, --------
// -- and the absence never throws --------------------------------

test('a SEEDED-shape work order (a bare document PUT, no create'
+ ' operation pair) derives zero rows and never throws — EDGE 1,'
+ ' the create-pair relaxation', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-seeded-1';

    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token,
        {
            display_id: 'seeded',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assert.equal(put.status, 200);

    const derived = await deriveWorkOrderLifecycle(db);
    assert.deepEqual(forWorkOrder(derived, workOrderId), []);
});

// -- 3. a claim, then a claim past lockTimeout --------------------

test('a claim, then a claim past lockTimeout supersedes with'
+ ' claim_expired + claimed', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-claim-1';
    const tinyLockTimeoutSeconds = 1;

    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token,
        {
            display_id: 'claimable',
            flow_graph:
                workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 1,
        },
    ));
    assert.equal(put.status, 200);

    const claim1At = nowUtc();
    const claim1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token,
        {
            claimEventId: workOrderId + '-ce1',
            claimAt: claim1At,
            expireEventId: workOrderId + '-ee1',
            expireAt: claim1At,
        },
    ));
    assert.equal(claim1.status, 204);

    // Real wait, comfortably past the tiny lockTimeout.
    await sleep((tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);

    // expireAt minted strictly BEFORE claimAt (nowUtc()'s own
    // monotonicity) — the same ordering the live route's own
    // caller mints, and the tie-break a shared `at` would
    // otherwise leave to id-lex (drift-work-orders.test.ts's own
    // idiom).
    const expire2At = nowUtc();
    const claim2At = nowUtc();
    const claim2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token,
        {
            claimEventId: workOrderId + '-ce2',
            claimAt: claim2At,
            expireEventId: workOrderId + '-ee2',
            expireAt: expire2At,
        },
    ));
    assert.equal(claim2.status, 204);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    const old = await db.states.getAllFor(workOrderId);
    assert.deepEqual(derived, old);
    assert.deepEqual(
        derived.map((row) => row.state),
        ['claimed', 'claim_expired', 'claimed'],
    );
});

// -- 4. a transition, then a transition with release --------------

test('a transition, then a transition with release ends the'
+ ' claim', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-transition-1';

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, workOrderId + '-fwo', 'flow-x',
            workOrderFlowGraph(8 * 60 * 60),
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [
                    '2026-05-02T00:00:00.000000Z',
                    '2026-05-02T00:00:00.000001Z',
                    '2026-05-02T00:00:00.000002Z',
                ],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 204);

    const transition1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te1',
            targetState: 'n-middle',
            fieldValues: [],
            release: null,
            transitionAt: '2026-05-02T00:00:01.000000Z',
        },
    ));
    assert.equal(transition1.status, 204);

    const transition2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te2',
            targetState: 'n-finish',
            fieldValues: [],
            release: {
                id: workOrderId + '-rel1',
                state: 'claim_released',
                at: '2026-05-02T00:00:03.000000Z',
            },
            transitionAt: '2026-05-02T00:00:02.000000Z',
        },
    ));
    assert.equal(transition2.status, 204);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    const old = await db.states.getAllFor(workOrderId);
    // 3 births + transition1 (1, no release) + transition2
    // (target + release, 2) = 6.
    assert.equal(derived.length, 6);
    assert.deepEqual(derived, old);
});

// -- 5. the MOVING lock_timeout case -------------------------------

test('the MOVING lock_timeout case: an entity PUT changing'
+ ' lock_timeout mid-history sources each claim from the'
+ ' document head AS OF that claim, never a single cached'
+ ' value', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-moving-1';
    const bigLockTimeoutSeconds = 8 * 60 * 60;
    const tinyLockTimeoutSeconds = 1;

    const put1 = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token,
        {
            display_id: 'moving',
            flow_graph:
                workOrderFlowGraph(bigLockTimeoutSeconds),
            position: 1,
        },
    ));
    assert.equal(put1.status, 200);

    const claim1At = nowUtc();
    const claim1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token,
        {
            claimEventId: workOrderId + '-ce1',
            claimAt: claim1At,
            expireEventId: workOrderId + '-ee1',
            expireAt: claim1At,
        },
    ));
    assert.equal(claim1.status, 204);

    // Shrink lock_timeout mid-history — the entity PUT that makes
    // the AS-OF lookup load-bearing: under the OLD (big) value the
    // prior claim would still read as live; under the NEW (tiny)
    // value, comfortably crossed by the sleep below, it reads as
    // expired.
    const put2 = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token,
        {
            display_id: 'moving',
            flow_graph:
                workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 2,
        },
    ));
    assert.equal(put2.status, 200);

    await sleep((tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);

    // expireAt minted strictly BEFORE claimAt — see case 3's own
    // note on the tie-break this ordering avoids.
    const expire2At = nowUtc();
    const claim2At = nowUtc();
    const claim2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token,
        {
            claimEventId: workOrderId + '-ce2',
            claimAt: claim2At,
            expireEventId: workOrderId + '-ee2',
            expireAt: expire2At,
        },
    ));
    assert.equal(claim2.status, 204);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    const old = await db.states.getAllFor(workOrderId);
    assert.deepEqual(derived, old);
    assert.deepEqual(
        derived.map((row) => row.state),
        ['claimed', 'claim_expired', 'claimed'],
    );
});

// -- 6. HYBRID: a seeded-shape work order plus a live claim -------

test('HYBRID: a seeded-shape work order plus a live claim —'
+ ' births ride source (a), the claim rides source (d), no id'
+ ' collision between the two readers', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-hybrid-1';

    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token,
        {
            display_id: 'hybrid',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assert.equal(put.status, 200);

    // The seed's own trace: a direct PUT /states/:id genesis
    // event, source (a)'s address — entirely disjoint from this
    // function's own operation-pair addresses.
    const genesis = await handleRequest(db, req(
        'PUT', '/states/' + workOrderId + '-genesis', token,
        { entity_id: workOrderId, state: 'n-start', at: AT },
    ));
    assert.equal(genesis.status, 200);

    const claimAt = nowUtc();
    const claim = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token,
        {
            claimEventId: workOrderId + '-ce1',
            claimAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimAt,
        },
    ));
    assert.equal(claim.status, 204);

    const ours = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert.deepEqual(ours, [{
        id: workOrderId + '-ce1',
        entity_id: workOrderId,
        state: 'claimed',
        member_id: 'adminA',
        at: claimAt,
    }]);

    const fromEventPairs = forWorkOrder(
        await deriveEventPairStates(db), workOrderId,
    );
    assert.deepEqual(
        fromEventPairs.map((row) => row.id),
        [workOrderId + '-genesis'],
    );

    // Disjoint addresses: no id from one reader ever appears in
    // the other's output — the no-double-count guarantee.
    const oursIds = new Set(ours.map((row) => row.id));
    assert.ok(
        fromEventPairs.every((row) => !oursIds.has(row.id)),
        'the two readers must never emit overlapping ids',
    );

    const old = await db.states.getAllFor(workOrderId);
    assert.deepEqual(
        [...ours, ...fromEventPairs].sort((a, b) =>
            a.at < b.at ? -1
                : a.at > b.at ? 1
                    : a.id < b.id ? -1
                        : a.id > b.id ? 1
                            : 0),
        old,
    );
});
