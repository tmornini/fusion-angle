import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import type { StateEntity } from '../api/types.ts';
import {
    MS_PER_SECOND, nowUtc, SYSTEM_MEMBER_ID,
    setClockForTest, resetClock,
} from '../api/types.ts';
import {
    deriveWorkOrderLifecycle,
} from '../api/derive-states.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// The work-order lifecycle derivation — create/claim/
// transition/release OPERATION pairs (states-address
// retirement: the sole work-order source; bare states/:id
// births are gone). Seeded traces reshape into transition
// ops, so this reader also covers historical births.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

// Claim-expiry legs advance the test clock past a tiny
// lockTimeout — isClaimEventExpired reads msSinceUtc, which
// honors setClockForTest (never a body timestamp). Reset in
// afterEach so no suite poisons the next.
afterEach(() => {
    resetClock();
});

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
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seed(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    // A real organizations/:id document (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves A
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'adminA',
        type: 'admin', at: AT,
    });
    return db;
}

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Lifecycle Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [], edges: [],
    };
}

function createWorkOrderBody(
    id: string,
    flowWorkOrderId: string,
    flowId: string,
    graph: Record<string, unknown>,
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
    assert.equal(created.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    // Phase Final Task 2: states ROW half stripped.
    assert.equal(derived.length, 3);
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
    assert.equal(put.status, 201);

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
    assert.equal(put.status, 201);

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
    assert.equal(claim1.status, 201);

    // Advance the test clock past the tiny lockTimeout so the
    // live route's isClaimEventExpired (via msSinceUtc) reads
    // the prior claim as expired without a real sleep.
    setClockForTest(() =>
        Date.now()
        + (tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);

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
    assert.equal(claim2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert.ok(derived.length >= 0); // Phase Final Task 2: row plane empty
    assert.deepEqual(
        derived.map((row) => row.state),
        ['claimed', 'claim_expired', 'claimed'],
    );
});

// -- 3b. claim → release → reclaim; release with no live claim --

test('claim → release → reclaim derives claimed,'
+ ' claim_released, claimed; a release with no live claim'
+ ' derives zero events', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    const workOrderId = 'wo-lifecycle-release-1';

    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token,
        {
            display_id: 'releasable',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assert.equal(put.status, 201);

    // Release with no live claim — pair appends, derives zero.
    const bareReleaseId = workOrderId + '-rel-bare';
    const bareRelease = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/release',
        token, {
            releaseEventId: bareReleaseId,
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(bareRelease.status, 201);
    assert.deepEqual(
        forWorkOrder(
            await deriveWorkOrderLifecycle(db), workOrderId,
        ),
        [],
    );

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
    assert.equal(claim1.status, 201);

    const releaseEventId = workOrderId + '-rel1';
    const releaseAt = nowUtc();
    const release = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/release',
        token, {
            releaseEventId,
            releaseAt,
        },
    ));
    assert.equal(release.status, 201);

    const claim2At = nowUtc();
    const claim2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token,
        {
            claimEventId: workOrderId + '-ce2',
            claimAt: claim2At,
            expireEventId: workOrderId + '-ee2',
            expireAt: claim2At,
        },
    ));
    assert.equal(claim2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert.deepEqual(
        derived.map((row) => row.state),
        ['claimed', 'claim_released', 'claimed'],
    );
    assert.deepEqual(
        derived.map((row) => row.id),
        [
            workOrderId + '-ce1',
            releaseEventId,
            workOrderId + '-ce2',
        ],
    );
    assert.ok(
        !derived.some((row) => row.id === bareReleaseId),
        'no-live-claim release must derive zero events',
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
    assert.equal(created.status, 201);

    const transition1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te1',
            targetState: 'n-middle',
            release: null,
            transitionAt: '2026-05-02T00:00:01.000000Z',
        },
    ));
    assert.equal(transition1.status, 201);

    const transition2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te2',
            targetState: 'n-finish',
            release: {
                id: workOrderId + '-rel1',
                state: 'claim_released',
                at: '2026-05-02T00:00:03.000000Z',
            },
            transitionAt: '2026-05-02T00:00:02.000000Z',
        },
    ));
    assert.equal(transition2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    // Phase Final Task 2: states ROW half stripped.
    // 3 births + transition1 (1, no release) + transition2
    // (target + release, 2) = 6.
    assert.equal(derived.length, 6);
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
    assert.equal(put1.status, 201);

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
    assert.equal(claim1.status, 201);

    // Shrink lock_timeout mid-history — the entity PUT that makes
    // the AS-OF lookup load-bearing: under the OLD (big) value the
    // prior claim would still read as live; under the NEW (tiny)
    // value, crossed by the fake-clock advance below, it reads as
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
    assert.equal(put2.status, 201);

    setClockForTest(() =>
        Date.now()
        + (tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);

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
    assert.equal(claim2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert.ok(derived.length >= 0); // Phase Final Task 2: row plane empty
    assert.deepEqual(
        derived.map((row) => row.state),
        ['claimed', 'claim_expired', 'claimed'],
    );
});

// -- 6. HYBRID: bare document + transition genesis + claim ------

test('HYBRID: a bare document PUT plus a transition genesis'
+ ' and a live claim — both events ride the lifecycle'
+ ' reader (states/:id retired)', async () => {
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
    assert.equal(put.status, 201);

    const genesis = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-genesis',
            targetState: 'n-start',
            release: null,
            transitionAt: AT,
        },
    ));
    assert.equal(genesis.status, 201);

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
    assert.equal(claim.status, 201);

    const ours = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert.deepEqual(
        ours.map((row) => row.id),
        [workOrderId + '-genesis', workOrderId + '-ce1'],
    );
    assert.equal(ours.length, 2);
});
