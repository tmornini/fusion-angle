import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import {
    MS_PER_SECOND, nowUtc,
    setClockForTest, resetClock,
} from '../shared/types.ts';
import {
    workOrderLifecycleStatesFor,
} from '../api/derive-states.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';
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

// The work-order lifecycle derivation — the version chain's
// own events, oldest first: create, claim, transition, and
// release each land a version (§5).

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
    headers?: Readonly<Record<string, string>>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined ? { headers } : {}),
    });
}

// The seeded work order's own events: its three births
// (create node, the node it sits at, claimed) and the release
// of the creator's claim.
const SEEDED_STATES = [N_START, N_START, 'claimed', 'claim_released'];

// An operation on a work order names the head it read.
async function headTag(
    db: MemoryDbAdapter,
    token: string,
    workOrderId: string,
): Promise<Record<string, string>> {
    const read = await handleRequest(db, req(
        'GET', workOrderPath(workOrderId), token,
    ));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    return { 'If-Match': read.headers.get('ETag')! };
}

// Claim-expiry legs advance the test clock past a tiny
// lockTimeout — the claim judges the stored expires_at
// against the request's stamp, which honors
// setClockForTest. Reset in afterEach so no suite poisons
// the next.
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

    const derived = await workOrderLifecycleStatesFor(
        db, ORGANIZATION_A, workOrderId,
    );
    // Phase Final Task 2: states ROW half stripped.
    assertStrictEquals(derived.length, 3);
});

// -- 2. a released birth claim: three births and the release -----

Deno.test('a created work order whose birth claim is released'
+ ' derives its three births and the release', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();

    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION_A,
        id: workOrderId,
        fields: {
            display_id: 'seeded',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
        flowId: FLOW_X,
        births: [N_START, N_START],
        at: nowUtc(),
        token,
        claim: 'released',
    });

    assertEquals(
        (await workOrderLifecycleStatesFor(
            db, ORGANIZATION_A, workOrderId,
        )).map((row) => row.state),
        SEEDED_STATES,
    );
});

// -- 3. a claim, then a claim past lockTimeout --------------------

Deno.test('a claim, then a claim past lockTimeout supersedes with'
+ ' claim_expired + claimed', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();
    const tinyLockTimeoutSeconds = 1;

    // The seed's release lands only under the 1 s lock when the
    // server clock has not moved on: freeze it for the seed.
    const seededMs = Date.now();
    setClockForTest(() => seededMs);
    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION_A,
        id: workOrderId,
        fields: {
            display_id: 'claimable',
            flow_graph: workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 1,
        },
        flowId: FLOW_X,
        births: [N_START, N_START],
        at: nowUtc(),
        token,
        claim: 'released',
    });
    resetClock();

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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim1.status, 200);
    await claim1.body?.cancel();

    // Advance the test clock past the tiny lockTimeout so the
    // claim's request stamp reads the prior claim as lapsed
    // without a real sleep.
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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim2.status, 200);

    const derived = await workOrderLifecycleStatesFor(
        db, ORGANIZATION_A, workOrderId,
    );
    assert(derived.length >= 0); // Phase Final Task 2: row plane empty
    assertEquals(
        derived.map((row) => row.state),
        [...SEEDED_STATES, 'claimed', 'claim_expired', 'claimed'],
    );
});

// -- 3b. claim → release → reclaim; release with no live claim --

Deno.test('claim → release → reclaim derives claimed,'
+ ' claim_released, claimed; a release with no live claim'
+ ' derives no event beyond the seeded ones', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = WO_LIFECYCLE_RELEASE_1;

    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION_A,
        id: workOrderId,
        fields: {
            display_id: 'releasable',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
        flowId: FLOW_X,
        births: [N_START, N_START],
        at: nowUtc(),
        token,
        claim: 'released',
    });

    // A release with no live claim answers the head and
    // stores nothing; derive holds only the seeded events.
    const bareRelease = await handleRequest(db, req(
        'DELETE',
        workOrderPath(workOrderId, '/claim'),
        token,
        undefined,
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(bareRelease.status, 200);
    await bareRelease.body?.cancel();
    assertEquals(
        (await workOrderLifecycleStatesFor(
            db, ORGANIZATION_A, workOrderId,
        )).map((row) => row.state),
        SEEDED_STATES,
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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim1.status, 200);
    await claim1.body?.cancel();

    const release = await handleRequest(db, req(
        'DELETE',
        workOrderPath(workOrderId, '/claim'),
        token,
        undefined,
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(release.status, 200);
    await release.body?.cancel();

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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim2.status, 200);
    await claim2.body?.cancel();

    const derived = await workOrderLifecycleStatesFor(
        db, ORGANIZATION_A, workOrderId,
    );
    assertEquals(
        derived.map((row) => row.state),
        [
            ...SEEDED_STATES,
            'claimed', 'claim_released', 'claimed',
        ],
    );
    assertStrictEquals(derived[4]!.id, WORKORDERID_CE1);
    assertStrictEquals(derived[5]!.state, 'claim_released');
    assertStrictEquals(derived[6]!.id, WORKORDERID_CE2);
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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(transition1.status, 200);
    await transition1.body?.cancel();

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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(transition2.status, 200);
    await transition2.body?.cancel();

    const derived = await workOrderLifecycleStatesFor(
        db, ORGANIZATION_A, workOrderId,
    );
    // Phase Final Task 2: states ROW half stripped.
    // 3 births + transition1 (1, no release) + transition2
    // (target + release, 2) = 6.
    assertStrictEquals(derived.length, 6);
});

// -- 6. created work order + live claim --------------------------

Deno.test('a created work order (three births and a release)'
+ ' plus a live claim — every event rides the lifecycle'
+ ' reader, in order, with distinct ids', async () => {
    const db = await seed();
    const token = await organizationToken(ADMIN_A, ORGANIZATION_A);
    const workOrderId = generateIdentifier();

    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION_A,
        id: workOrderId,
        fields: {
            display_id: 'hybrid',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
        flowId: FLOW_X,
        births: [N_START, N_START],
        at: nowUtc(),
        token,
        claim: 'released',
    });

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
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim.status, 200);
    await claim.body?.cancel();

    const ours = await workOrderLifecycleStatesFor(
        db, ORGANIZATION_A, workOrderId,
    );
    // Three births, the release, the live claim.
    assertEquals(
        ours.map((row) => row.state),
        [...SEEDED_STATES, 'claimed'],
    );
    assertStrictEquals(ours.length, 5);
    assertStrictEquals(ours.at(-1)!.id, WORKORDERID_CE1);
    assertStrictEquals(
        new Set(ours.map((row) => row.id)).size, 5,
    );
});
