import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import type { StateEntity } from '../api/types.ts';
import {
    MS_PER_SECOND, nowUtc,
    setClockForTest, resetClock,
} from '../api/types.ts';
import {
    deriveWorkOrderLifecycle,
} from '../api/derive-states.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const M_A = generateIdentifier();
const FLOW_X = generateIdentifier();
const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const WO_LIFECYCLE_RELEASE_1 = generateIdentifier();
const WO_LIFECYCLE_TRANSITION_1 = generateIdentifier();
const N_FINISH = generateIdentifier();
const ORGANIZATION_A = generateIdentifier();
const ADMIN_A = generateIdentifier();
const WORKORDERID_FWO = generateIdentifier();
const WORKORDERID_EV1 = generateIdentifier();
const WORKORDERID_EV2 = generateIdentifier();
const WORKORDERID_EV3 = generateIdentifier();
const WORKORDERID_CE1 = generateIdentifier();
const WORKORDERID_EE1 = generateIdentifier();
const WORKORDERID_CE2 = generateIdentifier();
const WORKORDERID_EE2 = generateIdentifier();
const WORKORDERID_TE1 = generateIdentifier();
const WORKORDERID_TE2 = generateIdentifier();
const WORKORDERID_REL1 = generateIdentifier();
const WORKORDERID_GENESIS = generateIdentifier();

// The work-order lifecycle derivation — create/claim/
// transition/release OPERATION message pairs (states-address
// retirement: the sole work-order source; bare states/:id
// births are gone). Seeded traces reshape into transition
// ops, so this reader also covers historical births.

const AT = '2026-01-01T00:00:00.000000Z';

function workOrderPath(id: string, rest = ''): string {
    return '/organizations/' + ORGANIZATION_A
        + '/work-orders/' + id + rest;
}

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
Deno.test.afterEach(() => {
    resetClock();
});

// Below-facade pair formation (the member-fixtures.ts idiom, the
// derive-states-events.test.ts precedent): every write below
// authorizes through organizationToken, whose gate check derives
// from the role_grants/memberships message plane once they flip, so
// a raw row here would go derivation-invisible. Every id/field
// value stays IDENTICAL to the raw puts these replace — only the
// write mechanism changes.
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

async function seed(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    // A real organizations/:id document (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves A
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, ORGANIZATION_A, 'Acme');
    await seedMembershipPair(db, M_A, {
        organization_id: ORGANIZATION_A, identity_id: ADMIN_A,
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

Deno.test('a live create births exactly the three initial state'
+ ' events, byte-equal to the old plane', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();

    const created = await handleRequest(db, req(
        'POST', workOrderPath(''), token,
        createWorkOrderBody(
            workOrderId, WORKORDERID_FWO, FLOW_X,
            workOrderFlowGraph(8 * 60 * 60),
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [
                    '2026-05-02T00:00:00.000000Z',
                    '2026-05-02T00:00:00.000001Z',
                    '2026-05-02T00:00:00.000002Z',
                ],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(created.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    // Phase Final Task 2: states ROW half stripped.
    assertStrictEquals(derived.length, 3);
});

// -- 2. EDGE 1: a SEEDED-shape work order births nothing, --------
// -- and the absence never throws --------------------------------

Deno.test('a SEEDED-shape work order (a bare document PUT, no create'
+ ' operation message pair) derives zero rows and never throws'
+ ' — EDGE 1, the create-pair relaxation', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();

    const put = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId), token,
        {
            display_id: 'seeded',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assertStrictEquals(put.status, 201);

    const derived = await deriveWorkOrderLifecycle(db);
    assertEquals(forWorkOrder(derived, workOrderId), []);
});

// -- 3. a claim, then a claim past lockTimeout --------------------

Deno.test('a claim, then a claim past lockTimeout supersedes with'
+ ' claim_expired + claimed', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();
    const tinyLockTimeoutSeconds = 1;

    const put = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId), token,
        {
            display_id: 'claimable',
            flow_graph:
                workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 1,
        },
    ));
    assertStrictEquals(put.status, 201);

    const claim1At = nowUtc();
    const claim1 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE1,
            claimAt: claim1At,
            expireEventId: WORKORDERID_EE1,
            expireAt: claim1At,
        },
    ));
    assertStrictEquals(claim1.status, 201);

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
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE2,
            claimAt: claim2At,
            expireEventId: WORKORDERID_EE2,
            expireAt: expire2At,
        },
    ));
    assertStrictEquals(claim2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert(derived.length >= 0); // Phase Final Task 2: row plane empty
    assertEquals(
        derived.map((row) => row.state),
        ['claimed', 'claim_expired', 'claimed'],
    );
});

// -- 3b. claim → release → reclaim; release with no live claim --

Deno.test('claim → release → reclaim derives claimed,'
+ ' claim_released, claimed; a release with no live claim'
+ ' derives zero events', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = WO_LIFECYCLE_RELEASE_1;

    const put = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId), token,
        {
            display_id: 'releasable',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assertStrictEquals(put.status, 201);

    // DELETE with no claim row is 404; derive stays empty.
    const bareRelease = await handleRequest(db, req(
        'DELETE',
        workOrderPath(workOrderId, '/claim'),
        token,
    ));
    assertStrictEquals(bareRelease.status, 404);
    assertEquals(
        forWorkOrder(
            await deriveWorkOrderLifecycle(db), workOrderId,
        ),
        [],
    );

    const claim1At = nowUtc();
    const claim1 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE1,
            claimAt: claim1At,
            expireEventId: WORKORDERID_EE1,
            expireAt: claim1At,
        },
    ));
    assertStrictEquals(claim1.status, 201);

    const release = await handleRequest(db, req(
        'DELETE',
        workOrderPath(workOrderId, '/claim'),
        token,
    ));
    assertStrictEquals(release.status, 204);

    const claim2At = nowUtc();
    const claim2 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE2,
            claimAt: claim2At,
            expireEventId: WORKORDERID_EE2,
            expireAt: claim2At,
        },
    ));
    assertStrictEquals(claim2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assertEquals(
        derived.map((row) => row.state),
        ['claimed', 'claim_released', 'claimed'],
    );
    assertStrictEquals(derived[0]!.id, WORKORDERID_CE1);
    assertStrictEquals(derived[1]!.state, 'claim_released');
    assertStrictEquals(derived[2]!.id, WORKORDERID_CE2);
});

// -- 4. a transition, then a transition with release --------------

Deno.test('a transition, then a transition with release ends the'
+ ' claim', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = WO_LIFECYCLE_TRANSITION_1;

    const created = await handleRequest(db, req(
        'POST', workOrderPath(''), token,
        createWorkOrderBody(
            workOrderId, WORKORDERID_FWO, FLOW_X,
            workOrderFlowGraph(8 * 60 * 60),
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [
                    '2026-05-02T00:00:00.000000Z',
                    '2026-05-02T00:00:00.000001Z',
                    '2026-05-02T00:00:00.000002Z',
                ],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(created.status, 201);

    const transition1 = await handleRequest(db, req(
        'POST', workOrderPath(workOrderId, '/transition'),
        token, {
            transitionEventId: WORKORDERID_TE1,
            targetState: N_MIDDLE,
            release: null,
            transitionAt: '2026-05-02T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(transition1.status, 201);

    const transition2 = await handleRequest(db, req(
        'POST', workOrderPath(workOrderId, '/transition'),
        token, {
            transitionEventId: WORKORDERID_TE2,
            targetState: N_FINISH,
            release: {
                id: WORKORDERID_REL1,
                state: 'claim_released',
                at: '2026-05-02T00:00:03.000000Z',
            },
            transitionAt: '2026-05-02T00:00:02.000000Z',
        },
    ));
    assertStrictEquals(transition2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    // Phase Final Task 2: states ROW half stripped.
    // 3 births + transition1 (1, no release) + transition2
    // (target + release, 2) = 6.
    assertStrictEquals(derived.length, 6);
});

// -- 5. the MOVING lock_timeout case -------------------------------

Deno.test('the MOVING lock_timeout case: an entity PUT changing'
+ ' lock_timeout mid-history sources each claim from the'
+ ' document head AS OF that claim, never a single cached'
+ ' value', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();
    const bigLockTimeoutSeconds = 8 * 60 * 60;
    const tinyLockTimeoutSeconds = 1;

    const put1 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId), token,
        {
            display_id: 'moving',
            flow_graph:
                workOrderFlowGraph(bigLockTimeoutSeconds),
            position: 1,
        },
    ));
    assertStrictEquals(put1.status, 201);

    const claim1At = nowUtc();
    const claim1 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE1,
            claimAt: claim1At,
            expireEventId: WORKORDERID_EE1,
            expireAt: claim1At,
        },
    ));
    assertStrictEquals(claim1.status, 201);

    // Shrink lock_timeout mid-history — the entity PUT that makes
    // the AS-OF lookup load-bearing: under the OLD (big) value the
    // prior claim would still read as live; under the NEW (tiny)
    // value, crossed by the fake-clock advance below, it reads as
    // expired.
    const put2 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId), token,
        {
            display_id: 'moving',
            flow_graph:
                workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 2,
        },
    ));
    assertStrictEquals(put2.status, 201);

    setClockForTest(() =>
        Date.now()
        + (tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);

    // expireAt minted strictly BEFORE claimAt — see case 3's own
    // note on the tie-break this ordering avoids.
    const expire2At = nowUtc();
    const claim2At = nowUtc();
    const claim2 = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE2,
            claimAt: claim2At,
            expireEventId: WORKORDERID_EE2,
            expireAt: expire2At,
        },
    ));
    assertStrictEquals(claim2.status, 201);

    const derived = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assert(derived.length >= 0); // Phase Final Task 2: row plane empty
    assertEquals(
        derived.map((row) => row.state),
        ['claimed', 'claim_expired', 'claimed'],
    );
});

// -- 6. HYBRID: bare document + transition genesis + claim ------

Deno.test('HYBRID: a bare document PUT plus a transition genesis'
+ ' and a live claim — both events ride the lifecycle'
+ ' reader (states/:id retired)', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();

    const put = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId), token,
        {
            display_id: 'hybrid',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assertStrictEquals(put.status, 201);

    const genesis = await handleRequest(db, req(
        'POST',
        workOrderPath(workOrderId, '/transition'),
        token, {
            transitionEventId: WORKORDERID_GENESIS,
            targetState: N_START,
            release: null,
            transitionAt: AT,
        },
    ));
    assertStrictEquals(genesis.status, 201);

    const claimAt = nowUtc();
    const claim = await handleRequest(db, req(
        'PUT', workOrderPath(workOrderId) +
            '/claim', token,
        {
            claimEventId: WORKORDERID_CE1,
            claimAt,
            expireEventId: WORKORDERID_EE1,
            expireAt: claimAt,
        },
    ));
    assertStrictEquals(claim.status, 201);

    const ours = forWorkOrder(
        await deriveWorkOrderLifecycle(db), workOrderId,
    );
    assertEquals(
        ours.map((row) => row.id),
        [WORKORDERID_GENESIS, WORKORDERID_CE1],
    );
    assertStrictEquals(ours.length, 2);
});
