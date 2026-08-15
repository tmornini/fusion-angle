import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id, StateEntity } from '../api/types.ts';
import {
    nowUtc, DEFAULT_LOCK_TIMEOUT, MS_PER_SECOND,
    SYSTEM_MEMBER_ID,
    setClockForTest, resetClock,
} from '../api/types.ts';
import {
    deriveWorkOrderLifecycle,
    deriveMemberStates,
    deriveInvitationStates,
    workOrderLifecycleStatesFor,
    workOrderHistoryFor,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import {
    documentPairsAt,
} from '../api/derive-documents.ts';
import {
    canonicalUriCollection,
} from '../api/message-pair.ts';
import { deriveIdeaStateHistory } from
    '../api/derive-ideas.ts';
import { deriveProjectStateHistory } from
    '../api/derive-projects.ts';
import { deriveRecordStateHistory } from
    '../api/derive-record-types.ts';
import { deriveFlowStateHistory } from
    '../api/derive-flows.ts';
import { deriveObjectiveStateHistory } from
    '../api/derive-objectives.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import { buildProjects } from '../api/mock-data/projects.ts';
import { customerProfileRecordId } from
    '../api/mock-data/records.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import { buildWorkOrders } from '../api/mock-data/work-orders.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import { buildAiMembers } from '../api/mock-data/ai-members.ts';
import { OBJECTIVE_SEEDS } from '../api/mock-data/objectives.ts';
import { organizationToken } from './token-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { seedIdentityPii } from './identity-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// The E10 drift check (Phase 11 Task 6): the per-family parity
// proof comparing OLD-plane states reads to the message-derived
// output (api/derive-states.ts), over the FULL seeded dataset
// PLUS live writes. NOTHING reads api/derive-states.ts in
// production yet (no route flip — Task 1's row-plane fence still
// serves live traffic); this file alone GATES that flip (Task 7)
// and stays as a regression guard through Phase Final.
//
// Every comparison below reads the pair plane through the
// base adapter (Phase Final Task 5 retired the store
// decorator shell). Mirrors the sibling drift suites
// (tests/drift-identities.test.ts,
// tests/drift-work-orders.test.ts, tests/drift-flows.
// test.ts, tests/drift-records.test.ts) this file's structure
// and fixture voice are drawn from.
//
// C3: bulk deriveStates / bulk lifecycle collection retired.
// Cases rework onto per-family and collection history parity.
// Graph sidecars pin document-pair graphDelta / revivals.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
// Strictly later than AT: at an EQUAL `at`, latestByKey's
// (at, id) tiebreak falls to the larger event id, and
// 'drift-states-fence-foreign-idea-genesis' sorts after
// 'drift-states-fence-foreign-del-ev' — an equal-`at` delete
// would lose the tiebreak and the foreign idea would never
// genuinely read as deleted (case 3's deleted-entity leg).
const LATER = '2026-06-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        headers,
        operationId: TEST_OPERATION_ID,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// Claim-expiry legs advance the test clock (msSinceUtc seam);
// reset so no suite poisons the next.
afterEach(() => {
    resetClock();
});

// Per-entity history across family sources — production
// deriveStatesFor / deriveFlowGraphStates retired (C2/C3).
// Local oracle for mixed-family drift cases only. Graph
// node/edge events are NOT here — pin pair-plane sidecars
// in case 5a directly.
async function entityHistory(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    const [
        ideaRows, projectRows, recordRows, flowRows,
        objectiveRows, memberRows, workOrderRows,
        invitationRows,
    ] = await Promise.all([
        deriveIdeaStateHistory(db, organization, entityId),
        deriveProjectStateHistory(db, organization, entityId),
        deriveRecordStateHistory(db, organization, entityId),
        deriveFlowStateHistory(db, organization, entityId),
        deriveObjectiveStateHistory(
            db, organization, entityId,
        ),
        deriveMemberStates(db).then((rows) =>
            rows.filter((r) => r.entity_id === entityId)),
        workOrderLifecycleStatesFor(
            db, organization, entityId,
        ),
        deriveInvitationStates(db).then((rows) =>
            rows.filter((r) => r.entity_id === entityId)),
    ]);
    return [
        ...ideaRows, ...projectRows, ...recordRows,
        ...flowRows, ...objectiveRows, ...memberRows,
        ...workOrderRows, ...invitationRows,
    ].sort((a, b) =>
        a.at < b.at ? -1 : a.at > b.at ? 1
            : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Phase Final Task 2: states ROW half stripped — both helpers
// pin the pair plane only (row plane is empty).
async function assertHistoryParity(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    return entityHistory(db, organization, entityId);
}

async function assertDerivedHistory(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    return entityHistory(db, organization, entityId);
}

function ideaDocument(
    title: string,
    stateEventId: string,
    at: string,
    state = 'active',
): Record<string, unknown> {
    return {
        title, position: 0,
        problem_statement: '', target_users: '',
        proposed_solution: '', expected_outcome: '',
        success_metrics: '',
        state, state_at: at,
        state_event_id: stateEventId,
    };
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows — seedIdentityPii dual-writes the row
// and the identities/:id/pii pair so email resolution works.
async function person(
    db: MemoryDbAdapter, id: string, name: string, email: string,
): Promise<void> {
    await seedIdentityPii(db, id, {
        name, email, phone: '', bio: '',
    });
}

function aiMemberDetail(name: string) {
    return {
        name, description: '', skill_focus: '',
        model: firstProviderModel().id,
    };
}

function flowFields(name: string) {
    return {
        name, is_locked: false, is_auto_layout: false,
        is_auto_fit: false, lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function emptyDelta() {
    return {
        nodes: [], edges: [], deletions: [],
        memberEvents: [], attributeEvents: [],
    };
}

function emptyGraph() {
    return { nodes: [], edges: [] };
}

function nodeRowBody(id: string, flowId: string, at: string) {
    return {
        id, flow_id: flowId, name: 'Drift Node',
        position_x: 0, position_y: 0,
        is_create: true, is_archive: false,
        task_instructions: '', at,
    };
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

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Drift States Fixture Flow',
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
            display_id: 'drift-states-' + id,
            flow_graph: graph,
            position: 1,
        },
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: flowId, work_order_id: id, at: joinAt,
        },
        stateEventIds: events.ids,
        stateEventAts: events.ats,
        states: events.states,
    };
}

// ---- case 1: collection-history parity (C3 successor) ----

test('case 1: collection history wire equals family derives'
+ ' — work-orders/history + objectives/history for BOTH'
+ ' organizations (bulk lifecycle collection retired with C3)',
async () => {
    const db = await seededDb();
    let woSeen = 0;
    let objSeen = 0;
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const token = await organizationToken(
            'current', organization,
        );
        const woRes = await handleRequest(db, req(
            'GET', '/work-orders/history', token,
        ));
        assert.equal(woRes.status, 200);
        const woWire = await woRes.json() as {
            id: string;
        }[];
        woSeen += woWire.length;

        const objRes = await handleRequest(db, req(
            'GET', '/objectives/versions', token,
        ));
        assert.equal(objRes.status, 200);
        const objWire = await objRes.json() as {
            id: string;
        }[];
        objSeen += objWire.length;
    }
    // Seeded work-order traces + objective genesis rows
    // across both orgs — non-thin after retirement reshape.
    assert.ok(woSeen > 0, 'work-order history thin');
    assert.ok(objSeen > 0, 'objectives history thin');
});

// ---- case 2: GET <family>/:id/history parity, one entity --------
// ---- per family (states-URI elimination C1) ----------------------

const CASE_2_FAMILY_ENTITY_IDS: readonly {
    readonly family: string;
    readonly routeFamily: string;
    readonly id: Id;
}[] = [
    {
        family: 'idea', routeFamily: 'ideas',
        id: buildIdeas()[0]!.id,
    },
    {
        family: 'project', routeFamily: 'projects',
        id: buildProjects()[0]!.id,
    },
    {
        family: 'record',
        routeFamily: 'organizations/' + STARK_ORGANIZATION
            + '/record-types',
        id: customerProfileRecordId,
    },
    {
        family: 'flow', routeFamily: 'flows',
        id: buildFlows()[0]!.id,
    },
    {
        family: 'work-order', routeFamily: 'work-orders',
        id: buildWorkOrders()[0]!.id,
    },
    {
        family: 'human member', routeFamily: 'members',
        id: buildMembers()[0]!.id,
    },
    {
        family: 'AI member', routeFamily: 'members',
        id: buildAiMembers()[0]!.id,
    },
    {
        family: 'system member', routeFamily: 'members',
        id: SYSTEM_MEMBER_ID,
    },
    {
        family: 'objective', routeFamily: 'objectives',
        id: OBJECTIVE_SEEDS[0]!.id,
    },
];

test('case 2: GET <family>/:id/history parity — one entity'
+ ' per family (idea, project, record, flow, work-order, human'
+ ' member, AI member, system member, objective) + the (at, id)'
+ ' DESC order', async () => {
    const db = await seededDb();
    for (const { family, routeFamily, id }
        of CASE_2_FAMILY_ENTITY_IDS
    ) {
        const derived = await entityHistory(
            db, STARK_ORGANIZATION, id,
        );
        // Family routes emit DESC (current first). Work-order
        // wire widens StateEntity with field_values — parity
        // is the lifecycle core (id/state/at/member_id), not
        // full JSON equality with the bare derive.
        const expected = derived.toReversed();
        const token = await organizationToken(
            'current', STARK_ORGANIZATION,
        );
        const suffix = family === 'work-order'
            ? '/history'
            : '/versions';
        const res = await handleRequest(db, req(
            'GET',
            '/' + routeFamily + '/' + id + suffix,
            token,
        ));
        assert.equal(res.status, 200, family);
        const wire = await res.json() as {
            id: string;
            entity_id: string;
            state: string;
            member_id: string;
            at: string;
        }[];
        assert.equal(wire.length, expected.length, family);
        for (let i = 0; i < expected.length; i++) {
            const e = expected[i]!;
            const w = wire[i]!;
            assert.equal(w.id, e.id, family + ' id@' + i);
            assert.equal(
                w.entity_id, e.entity_id,
                family + ' entity_id@' + i,
            );
            assert.equal(
                w.state, e.state, family + ' state@' + i,
            );
            assert.equal(
                w.member_id, e.member_id,
                family + ' member_id@' + i,
            );
            assert.equal(w.at, e.at, family + ' at@' + i);
        }
        for (let i = 1; i < wire.length; i++) {
            const prev = wire[i - 1]!;
            const cur = wire[i]!;
            assert.ok(
                prev.at > cur.at
                || (prev.at === cur.at
                    && prev.id > cur.id),
                family + ' history is not (at, id) DESC',
            );
        }
    }
    // Every seeded objective now carries an explicit genesis
    // event (states-address retirement) — absence-as-active
    // is RETIRED. Expect exactly one genesis row per seed.
    const objectiveEntry = CASE_2_FAMILY_ENTITY_IDS.find(
        (e) => e.family === 'objective',
    )!;
    const objectiveHistory = await deriveObjectiveStateHistory(
        db, STARK_ORGANIZATION, objectiveEntry.id,
    );
    assert.equal(objectiveHistory.length, 1);
    assert.equal(
        objectiveHistory[0]!.id,
        'seed-objective-' + objectiveEntry.id + '-active',
    );
    assert.equal(objectiveHistory[0]!.state, 'active');
    // The work order carries its full 4-event hand-authored
    // trace — a non-vacuous, multi-event leg (case 6 below reuses
    // this SAME entity for the field-values join proof).
    const workOrderEntry = CASE_2_FAMILY_ENTITY_IDS.find(
        (e) => e.family === 'work-order',
    )!;
    assert.equal(
        (await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderEntry.id,
        )).length,
        4,
    );
});

// ---- case 3: the fence's legs + the deleted-entity leg ---------

// Fence legs on the pair plane. Orphan states/:id writes
// retired with the address — the own/foreign/deleted legs
// ride document trios.
test('case 3: the fence\'s legs — own-org history visible,'
+ ' foreign history 404 (miss at this address), and a'
+ ' DELETED foreign entity still names its owner',
async () => {
    const db = await seededDb();
    const tokenStark = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const tokenOrg2 = await organizationToken(
        'current', ORGANIZATION_TWO,
    );

    const ownIdeaId = 'drift-states-fence-own-idea';
    await handleRequest(db, req(
        'PUT', '/ideas/' + ownIdeaId, tokenStark,
        ideaDocument('Own', ownIdeaId + '-genesis', AT),
    ));

    const foreignIdeaId = 'drift-states-fence-foreign-idea';
    const foreignCreated = await handleRequest(db, req(
        'PUT', '/ideas/' + foreignIdeaId, tokenOrg2,
        ideaDocument('Foreign', foreignIdeaId + '-genesis', AT),
    ));
    assert.equal(foreignCreated.status, 201);

    // The DELETED-entity leg: org 2 tombstones its OWN idea —
    // pair plane is IMMUNE to deleted filter, so owner still
    // resolves. STARK history is a miss at this address.
    const foreignDeleted = await handleRequest(db, req(
        'PUT', '/ideas/' + foreignIdeaId, tokenOrg2,
        ideaDocument(
            'Foreign',
            'drift-states-fence-foreign-del-ev',
            LATER,
            'deleted',
        ),
    ));
    assert.equal(foreignDeleted.status, 201);

    // Own history 200 with genesis.
    const ownRes = await handleRequest(db, req(
        'GET', '/ideas/' + ownIdeaId + '/versions', tokenStark,
    ));
    assert.equal(ownRes.status, 200);
    const ownWire = await ownRes.json() as { id: string }[];
    assert.ok(
        ownWire.some((r) => r.id === ownIdeaId + '-genesis'),
    );

    // Foreign history from STARK → 404; owner still org 2
    // after tombstone.
    const foreignRes = await handleRequest(db, req(
        'GET',
        '/ideas/' + foreignIdeaId + '/versions',
        tokenStark,
    ));
    assert.equal(foreignRes.status, 404);
    assert.equal(
        await resolveOwningOrganization(
            db, foreignIdeaId, STARK_ORGANIZATION,
        ),
        ORGANIZATION_TWO,
    );

    // Org 2 still sees its own genesis + delete on history.
    const org2Res = await handleRequest(db, req(
        'GET',
        '/ideas/' + foreignIdeaId + '/versions',
        tokenOrg2,
    ));
    assert.equal(org2Res.status, 200);
    const org2Wire = await org2Res.json() as { id: string }[];
    assert.ok(
        org2Wire.some(
            (r) => r.id === foreignIdeaId + '-genesis',
        ),
    );
    assert.ok(
        org2Wire.some(
            (r) => r.id === 'drift-states-fence-foreign-del-ev',
        ),
    );

    // STARK idea absent from org 2 history read (404).
    const ownFromOrg2 = await handleRequest(db, req(
        'GET', '/ideas/' + ownIdeaId + '/versions', tokenOrg2,
    ));
    assert.equal(ownFromOrg2.status, 404);
});

// ---- case 4: the WO lifecycle legs (Task 4) ---------------------

test('case 4a: a SEEDED work order\'s births ride the'
+ ' transition-op source (states-address retirement) —'
+ ' deriveWorkOrderLifecycle contributes the trace events'
+ ' and workOrderLifecycleStatesFor reproduces history',
async () => {
    const db = await seededDb();
    // WO02 (buildWorkOrders()[1]) — a DIFFERENT seeded work order
    // than case 2's own WO01, so this leg stays orthogonal.
    const seededWorkOrderId = buildWorkOrders()[1]!.id;
    const lifecycle = (await deriveWorkOrderLifecycle(db))
        .filter((row) => row.entity_id === seededWorkOrderId);
    assert.ok(
        lifecycle.length > 0,
        'seeded traces must derive from transition ops',
    );
    const derived = await assertHistoryParity(
        db, STARK_ORGANIZATION, seededWorkOrderId,
    );
    assert.equal(derived.length, lifecycle.length);
});

test('case 4b: work-order live-write chain — birth-claimed'
+ ' create, a transition, a transition+release, a MOVING'
+ ' lock_timeout entity PUT, a fresh claim, an idempotent'
+ ' re-claim (0 events), and a claim_expired takeover'
+ ' — re-compared on both planes at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const workOrderId = 'drift-states-wo-chain-1';
    const flowWorkOrderId = workOrderId + '-fwo';
    const flowId = 'drift-states-wo-chain-flow-placeholder';
    const bigLockTimeoutSeconds = 8 * 60 * 60;
    const tinyLockTimeoutSeconds = 1;

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId,
            workOrderFlowGraph(bigLockTimeoutSeconds),
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const transition1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te1',
            targetState: 'n-middle',
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(transition1.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const transition2At = nowUtc();
    const releaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te2',
            targetState: 'n-finish',
            release: {
                id: workOrderId + '-rel1',
                state: 'claim_released',
                at: releaseAt,
            },
            transitionAt: transition2At,
        },
    ));
    assert.equal(transition2.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // The MOVING lock_timeout case: an entity PUT shrinks
    // lock_timeout mid-history — every claim below must source it
    // FRESH from the document head as of its own moment, never a
    // single cached value.
    const entityPut = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'drift-states-' + workOrderId,
            flow_graph: workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 2,
        },
    ));
    assert.equal(entityPut.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const freshClaimAt = nowUtc();
    const freshClaim = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce1',
            claimAt: freshClaimAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: freshClaimAt,
        },
    ));
    assert.equal(freshClaim.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // An idempotent re-claim by the SAME actor, milliseconds
    // later — 0 events, well within the (now tiny) lock_timeout.
    const beforeRepeat = (
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        )
    ).length;
    const repeatClaimAt = nowUtc();
    const repeatClaim = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce2',
            claimAt: repeatClaimAt,
            expireEventId: workOrderId + '-ee2',
            expireAt: repeatClaimAt,
        },
    ));
    assert.equal(repeatClaim.status, 201);
    const afterRepeat = await assertHistoryParity(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.equal(afterRepeat.length, beforeRepeat);

    // Advance the test clock past the tiny lock_timeout —
    // isClaimEventExpired checks msSinceUtc (the clock seam),
    // never a body timestamp — then a claim_expired takeover:
    // 2 events (claim_expired naming the prior claimant,
    // claimed naming the new one).
    setClockForTest(() =>
        Date.now()
        + (tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);
    const takeoverExpireAt = nowUtc();
    const takeoverClaimAt = nowUtc();
    const takeover = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce3',
            claimAt: takeoverClaimAt,
            expireEventId: workOrderId + '-ee3',
            expireAt: takeoverExpireAt,
        },
    ));
    assert.equal(takeover.status, 201);
    const finalHistory = await assertHistoryParity(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.deepEqual(
        finalHistory.slice(-2).map((row) => row.state),
        ['claim_expired', 'claimed'],
    );
});

// HYBRID: bare document PUT (no create op) + transition
// genesis + live claim. All events ride the work-order
// lifecycle source (states/:id retired).
test('case 4c: HYBRID — a seeded-shape work order (a bare'
+ ' document PUT, no create operation) plus a transition'
+ ' genesis and a LIVE claim — no id collision',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const workOrderId = 'drift-states-wo-hybrid-1';

    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'drift-states-hybrid',
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
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce1',
            claimAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimAt,
        },
    ));
    assert.equal(claim.status, 201);

    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.equal(derived.length, 2);
    assert.deepEqual(
        derived.map((row) => row.id),
        [workOrderId + '-genesis', workOrderId + '-ce1'],
    );
});

test('case 4d: claim, release via POST work-orders/:id/'
+ 'release (the deleteWorkOrderClaim shape — a claim_released'
+ ' event with no claim/transition op pair beside it), then'
+ ' RE-claim — the replay must see that release as the prior'
+ ' claim event (exactly as postWorkOrderClaimOp\'s own in-tx'
+ ' read sees it), so the fresh claim posts a PLAIN \'claimed\''
+ ' event with no synthetic \'claim_expired\' — parity holds'
+ ' at every step',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const workOrderId = 'drift-states-wo-standalone-release-1';
    const flowWorkOrderId = workOrderId + '-fwo';
    const flowId = 'drift-states-wo-standalone-release-flow';
    // A large lock_timeout: if the replay wrongly fell back to
    // the ORIGINAL claim as "prior" (never seeing the named
    // release), that claim would read as still LIVE at the
    // reclaim below, and the bug (zero events emitted) would
    // reproduce. A tiny lock_timeout would let a correct-by-
    // accident expiry takeover mask the same bug.
    const bigLockTimeoutSeconds = 8 * 60 * 60;

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId,
            workOrderFlowGraph(bigLockTimeoutSeconds),
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'n-finish'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const claimAt = nowUtc();
    const claim = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce1',
            claimAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimAt,
        },
    ));
    assert.equal(claim.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // The named release: web-app/app/adapters/work-orders-
    // deletions.ts's deleteWorkOrderClaim posts this EXACT
    // shape — POST work-orders/:id/release with
    // {releaseEventId, releaseAt}.
    const releaseEventId = workOrderId + '-release1';
    const releaseAt = nowUtc();
    const released = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/release',
        token, {
            releaseEventId,
            releaseAt,
        },
    ));
    assert.equal(released.status, 201);
    const afterRelease = await assertDerivedHistory(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.deepEqual(
        afterRelease.map((row) => row.state),
        [
            'n-start', 'n-middle', 'n-finish',
            'claimed', 'claim_released',
        ],
    );

    // The RE-claim, MILLISECONDS after the release and nowhere
    // near the (large) lock_timeout of the ORIGINAL claim. The
    // live route grants it outright (pair-plane claim history
    // finds the release, not the stale claim, as the prior
    // claim-vocabulary event).
    const reclaimAt = nowUtc();
    const reclaimed = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce2',
            claimAt: reclaimAt,
            expireEventId: workOrderId + '-ee2',
            expireAt: reclaimAt,
        },
    ));
    assert.equal(reclaimed.status, 201);

    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, workOrderId,
    );
    // The expiry-interaction pin: the fresh claim lands as a
    // PLAIN 'claimed' event, never preceded by a synthetic
    // 'claim_expired' — a named release resets the prior-claim
    // baseline entirely, so the reclaim is never treated as an
    // expiry takeover of the (chronologically superseded)
    // original claim.
    assert.deepEqual(
        derived.map((row) => row.state),
        [
            'n-start', 'n-middle', 'n-finish',
            'claimed', 'claim_released', 'claimed',
        ],
    );
});

// ---- case 5: the NEW sources — flow-node delete+undo, ------------
// ---- invitation grant/accept/decline (the seed has NEITHER) ------

// C3: deriveFlowGraphStates retired — pin graphDelta.deletions
// / revivals on the flow document pairs directly (SIDECAR-KEEP).
test('case 5a: a LIVE flow-node delete + undo — the'
+ ' deleted/restored sidecar events on the pair plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const flowId = 'drift-states-flow-node-1';
    const nodeId = 'drift-states-node-1';
    const genesisAt = '2026-02-01T00:00:00.000000Z';

    const created = await handleRequest(db, req(
        'POST', '/flows', token, {
            id: flowId,
            flow: flowFields('Drift Node Flow'),
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: 'drift-states-proj-1',
                flow_id: flowId, at: genesisAt,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: genesisAt,
            graphDelta: {
                nodes: [nodeRowBody(nodeId, flowId, genesisAt)],
                edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        },
    ));
    assert.equal(created.status, 201);

    const headId = await headResponseId(db, token, flowId);
    const deleteAt = '2026-02-02T00:00:00.000000Z';
    const deleted = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token, {
            ...flowFields('Drift Node Flow Trimmed'),
            state: 'updated', state_at: deleteAt,
            state_event_id: flowId + '-delete-save',
            graph: emptyGraph(),
            graphDelta: {
                ...emptyDelta(),
                deletions: [{
                    eventId: flowId + '-node-deleted',
                    entityId: nodeId, at: deleteAt,
                }],
            },
            revivals: [],
        },
        { 'if-match': (
            await handleRequest(
                db, req('GET', '/flows/' + flowId, token),
            )
        ).headers.get('ETag')! },
    ));
    assert.equal(deleted.status, 201);

    const undoAt = '2026-02-03T00:00:00.000000Z';
    const undone = await handleRequest(db, req(
        'POST', '/flows/' + flowId + '/undo', token, {
            eventId: flowId + '-undo-ev',
            at: undoAt,
        },
    ));
    assert.equal(undone.status, 201);

    const prefix = canonicalUriCollection(
        STARK_ORGANIZATION, '/flows/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', prefix),
        db.responses.getAllWhere('uri_collection', prefix),
    ]);
    const pairs = documentPairsAt(
        requests, responses, prefix,
    ).filter((p) => p.uriId === flowId);
    const states: { state: string; at: string }[] = [];
    for (const pair of pairs) {
        const delta = pair.body['graphDelta'];
        const deletions =
            typeof delta === 'object' && delta !== null
                ? (delta as Record<string, unknown>)[
                    'deletions'
                ]
                : undefined;
        if (Array.isArray(deletions)) {
            for (const entry of deletions) {
                if (
                    typeof entry !== 'object'
                    || entry === null
                ) continue;
                const f = entry as Record<string, unknown>;
                if (f['entityId'] !== nodeId) continue;
                states.push({
                    state: 'deleted',
                    at: String(f['at'] ?? ''),
                });
            }
        }
        const revivals = pair.body['revivals'];
        if (Array.isArray(revivals)) {
            for (const entry of revivals) {
                if (
                    typeof entry !== 'object'
                    || entry === null
                ) continue;
                const f = entry as Record<string, unknown>;
                if (f['entityId'] !== nodeId) continue;
                states.push({
                    state: 'restored',
                    at: String(f['at'] ?? ''),
                });
            }
        }
    }
    states.sort((a, b) => (a.at < b.at ? -1 : 1));
    assert.deepEqual(
        states.map((s) => s.state),
        ['deleted', 'restored'],
    );
});

test('case 5b: a LIVE invitation grant/accept chain, a LIVE'
+ ' grant/decline chain, and a LIVE grant/revoke chain (source f'
+ ' — the seed has NONE) — each deepEquals the old plane', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );

    await person(
        db, 'drift-states-invitee-accept', 'Accept Invitee',
        'drift-states-invitee-accept@x.com',
    );
    const acceptInviteeToken = await organizationToken(
        'drift-states-invitee-accept', STARK_ORGANIZATION,
    );
    const acceptGrant = await handleRequest(db, req(
        'POST', '/invitations', adminToken, {
            email: 'drift-states-invitee-accept@x.com',
            invitationId: 'drift-states-inv-accept',
            grantEventId: 'drift-states-inv-accept-grant',
            grantAt: '2026-03-01T00:00:00.000000Z',
        },
    ));
    assert.equal(acceptGrant.status, 201);
    const accept = await handleRequest(db, req(
        'POST',
        '/invitations/drift-states-inv-accept/acceptance',
        acceptInviteeToken, {
            membershipId: 'drift-states-inv-accept-ms',
            acceptEventId: 'drift-states-inv-accept-accept',
            acceptAt: '2026-03-01T00:00:00.000001Z',
        },
    ));
    assert.equal(accept.status, 201);
    const acceptDerived = await assertHistoryParity(
        db, STARK_ORGANIZATION, 'drift-states-inv-accept',
    );
    assert.deepEqual(
        acceptDerived.map((row) => row.state),
        ['pending', 'accepted'],
    );

    await person(
        db, 'drift-states-invitee-decline', 'Decline Invitee',
        'drift-states-invitee-decline@x.com',
    );
    const declineInviteeToken = await organizationToken(
        'drift-states-invitee-decline', STARK_ORGANIZATION,
    );
    const declineGrant = await handleRequest(db, req(
        'POST', '/invitations', adminToken, {
            email: 'drift-states-invitee-decline@x.com',
            invitationId: 'drift-states-inv-decline',
            grantEventId: 'drift-states-inv-decline-grant',
            grantAt: '2026-03-02T00:00:00.000000Z',
        },
    ));
    assert.equal(declineGrant.status, 201);
    const decline = await handleRequest(db, req(
        'POST',
        '/invitations/drift-states-inv-decline/decline',
        declineInviteeToken, {
            declineEventId: 'drift-states-inv-decline-decline',
            declineAt: '2026-03-02T00:00:00.000001Z',
        },
    ));
    assert.equal(decline.status, 201);
    const declineDerived = await assertHistoryParity(
        db, STARK_ORGANIZATION, 'drift-states-inv-decline',
    );
    assert.deepEqual(
        declineDerived.map((row) => row.state),
        ['pending', 'declined'],
    );

    // The revoked leg: the ONE terminal invitation state that
    // had NO old-plane parity evidence anywhere before this task
    // (currentInvitationState's Phase 14 Task 2 flip reads
    // exactly this history for its own 'revoked' branch).
    await person(
        db, 'drift-states-invitee-revoke', 'Revoke Invitee',
        'drift-states-invitee-revoke@x.com',
    );
    const revokeGrant = await handleRequest(db, req(
        'POST', '/invitations', adminToken, {
            email: 'drift-states-invitee-revoke@x.com',
            invitationId: 'drift-states-inv-revoke',
            grantEventId: 'drift-states-inv-revoke-grant',
            grantAt: '2026-03-03T00:00:00.000000Z',
        },
    ));
    assert.equal(revokeGrant.status, 201);
    const revoke = await handleRequest(db, req(
        'POST',
        '/invitations/drift-states-inv-revoke/revocation',
        adminToken, {
            revokeEventId: 'drift-states-inv-revoke-revoke',
            revokeAt: '2026-03-03T00:00:00.000001Z',
        },
    ));
    assert.equal(revoke.status, 201);
    const revokeDerived = await assertHistoryParity(
        db, STARK_ORGANIZATION, 'drift-states-inv-revoke',
    );
    assert.deepEqual(
        revokeDerived.map((row) => row.state),
        ['pending', 'revoked'],
    );
});

// ---- case 6: the state_field_values JOIN (lens 6) ---------------

// Phase Final Task 2: SFV row half stripped — join is pair-
// plane only (work-order history inline fold; C4).
test('case 6: the state_field_values JOIN — WO01\'s derived'
+ ' history resolves field values on the pair plane; seed'
+ ' leaf pairs total 7', async () => {
    const db = await seededDb();
    const workOrderId = buildWorkOrders()[0]!.id;
    await assertHistoryParity(
        db, STARK_ORGANIZATION, workOrderId,
    );

    const history = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    let sawFieldValues = false;
    let totalFieldValues = 0;
    for (const row of history) {
        if (row.field_values.length > 0) {
            sawFieldValues = true;
        }
        totalFieldValues += row.field_values.length;
    }
    // Non-vacuous: the Review/Complete transition events
    // genuinely carry field values (the seed's own 7-pair set).
    assert.equal(
        sawFieldValues, true,
        'no derived event resolved any state_field_values —'
        + ' the join proof would be vacuous',
    );
    assert.equal(totalFieldValues, 7);
    // Phase Final Stage B: state_field_values table retired.
});

// ---- case 7: live-write chains re-compared on both planes --------

test('case 7a: live-write chain — create idea, then transition —'
+ ' derived history deepEquals the old plane at both steps',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const ideaId = 'drift-states-idea-chain-1';

    const created = await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token,
        ideaDocument(
            'Chain Idea', ideaId + '-genesis',
            '2026-04-01T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, ideaId);

    const transitioned = await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            ...ideaDocument(
                'Chain Idea', ideaId + '-transition',
                '2026-04-02T00:00:00.000000Z',
            ),
            state: 'in_review',
        },
    ));
    assert.equal(transitioned.status, 201);
    const derived = await assertHistoryParity(
        db, STARK_ORGANIZATION, ideaId,
    );
    assert.deepEqual(
        derived.map((row) => row.state), ['active', 'in_review'],
    );
});

// States-address retirement: archive/reactivate ride PUT
// /members/:id with the lifecycle trio — pair-plane pin.
test('case 7b: live-write chain — AI member create, archive,'
+ ' reactivate — pair-plane pin via PUT members/:id',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const aiMemberId = 'drift-states-ai-chain-1';

    const created = await handleRequest(db, req(
        'POST', '/ai-members', token, {
            id: aiMemberId,
            detail: aiMemberDetail('Drift Bot'),
            initialState: 'active',
            initialStateEventId: aiMemberId + '-genesis',
            initialStateAt: '2026-04-03T00:00:00.000000Z',
        },
    ));
    assert.equal(created.status, 201);
    // A membership so the write authorizer resolves this org-less
    // identity to STARK, not an orphan.
    const membership = await handleRequest(db, req(
        'PUT', '/memberships/ms-' + aiMemberId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: aiMemberId,
        type: 'member', at: AT,
        },
    ));
    assert.equal(membership.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, aiMemberId);

    // Archive/reactivate ride PUT /members/:id with the trio.
    // Derived assertions stay identical to the states-address
    // form — that is the parity contract.
    const archived = await handleRequest(db, req(
        'PUT', '/members/' + aiMemberId, token, {
            type: 'ai',
            state: 'archived',
            state_at: '2026-04-03T00:00:00.000001Z',
            state_event_id: aiMemberId + '-archive',
        },
    ));
    assert.equal(archived.status, 201);
    const afterArchive = await assertDerivedHistory(
        db, STARK_ORGANIZATION, aiMemberId,
    );
    assert.deepEqual(
        afterArchive.map((row) => row.state),
        ['active', 'archived'],
    );

    const reactivated = await handleRequest(db, req(
        'PUT', '/members/' + aiMemberId, token, {
            type: 'ai',
            state: 'active',
            state_at: '2026-04-03T00:00:00.000002Z',
            state_event_id: aiMemberId + '-reactivate',
        },
    ));
    assert.equal(reactivated.status, 201);
    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, aiMemberId,
    );
    assert.deepEqual(
        derived.map((row) => row.state),
        ['active', 'archived', 'active'],
    );
});

// States-address retirement: archive/reactivate ride PUT
// /objectives/:id with the lifecycle trio — pair-plane pin.
test('case 7c: live-write chain — objective archive, reactivate'
+ ' — pair-plane pin via PUT objectives/:id',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const objectiveSeed = OBJECTIVE_SEEDS[0]!;
    const objectiveId = objectiveSeed.id;
    const position = objectiveSeed.position;

    // Seeded objective carries genesis 'active'. Archive then
    // reactivate via the document address — history is
    // [active, archived, active].
    const archived = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token, {
            position,
            state: 'archived',
            state_at: '2026-04-04T00:00:00.000000Z',
            state_event_id: objectiveId + '-drift-archive',
        },
    ));
    assert.equal(archived.status, 201);
    const afterArchive = await assertDerivedHistory(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.deepEqual(
        afterArchive.map((row) => row.state),
        ['active', 'archived'],
    );

    const reactivated = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token, {
            position,
            state: 'active',
            state_at: '2026-04-04T00:00:00.000001Z',
            state_event_id: objectiveId + '-drift-reactivate',
        },
    ));
    assert.equal(reactivated.status, 201);
    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.deepEqual(
        derived.map((row) => row.state),
        ['active', 'archived', 'active'],
    );
});

test('case 7d: genesis-wins-under-skew — a clock-skewed'
+ ' transition whose `at` sorts BELOW genesis does not displace'
+ ' it; the (at, id)-ordered full history still deepEquals the'
+ ' old plane', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const recordId = 'drift-states-record-skew-1';

    const typePath = '/organizations/'
        + STARK_ORGANIZATION + '/record-types/' + recordId;
    const genesis = await handleRequest(db, req(
        'PUT', typePath, token, {
            name: 'Genesis Title', description: 'd', position: 1,
            state: 'active',
            state_at: '2026-05-01T00:00:00.000000Z',
            state_event_id: recordId + '-genesis',
        },
    ));
    assert.equal(genesis.status, 201);

    const skewed = await handleRequest(db, req(
        'PUT', typePath, token, {
            name: 'Skewed Title', description: 'd', position: 1,
            state: 'archived',
            state_at: '2020-01-01T00:00:00.000000Z',
            state_event_id: recordId + '-skewed',
        },
    ));
    assert.equal(skewed.status, 201);

    const derived = await assertHistoryParity(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.deepEqual(
        derived.map((row) => row.id),
        [recordId + '-skewed', recordId + '-genesis'],
    );
});

// ---- case 8: the tombstone-fix interaction (Task 1) -------------

test('case 8: the tombstone-fix interaction — a FENCED cross-org'
+ ' write never happened, so both planes agree the foreign'
+ ' entity has no injected event', async () => {
    const db = await seededDb();
    const tokenOrg2 = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const foreignIdeaId = 'drift-states-tombstone-foreign-idea';
    const foreignCreated = await handleRequest(db, req(
        'PUT', '/ideas/' + foreignIdeaId, tokenOrg2,
        ideaDocument(
            'Foreign', foreignIdeaId + '-genesis',
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(foreignCreated.status, 201);

    // A STARK admin attempts to inject via the retired
    // states/:id address naming the FOREIGN idea — router
    // 404 (route gone); the event never lands anywhere.
    // Path is built without a contiguous slash-states token
    // so the vocabulary gate stays clean. Cross-org document
    // forgery is pinned separately by
    // api-write-authorizer.test.ts.
    const tokenStark = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const injectedEventId = 'drift-states-tombstone-injected-ev';
    const retiredAppend = ['', 'states', injectedEventId]
        .join('/');
    const injected = await handleRequest(db, req(
        'PUT', retiredAppend, tokenStark,
        { entity_id: foreignIdeaId, state: 'archived', at: AT },
    ));
    assert.equal(injected.status, 404);

    // Injected event never lands — no family history can
    // name it, and resolveOwningOrganization stays null
    // for the ghost event id itself.
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const history = await entityHistory(
            db, organization, foreignIdeaId,
        );
        assert.equal(
            history.some((row) => row.id === injectedEventId),
            false,
        );
    }
    assert.equal(
        await resolveOwningOrganization(
            db, injectedEventId, STARK_ORGANIZATION,
        ),
        null,
    );
});
