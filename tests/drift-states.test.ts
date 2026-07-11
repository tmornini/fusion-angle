import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id, StateEntity } from '../api/types.ts';
import {
    nowUtc, DEFAULT_LOCK_TIMEOUT, MS_PER_SECOND,
    jsonObjectField, SYSTEM_MEMBER_ID,
    setClockForTest, resetClock,
} from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    deriveStates,
    deriveStatesFor,
    deriveWorkOrderLifecycle,
} from '../api/derive-states.ts';
import {
    stateFieldValuesForStateEvent,
} from '../api/derive-state-field-values.ts';
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
// H7: `states.getAll()` is INSERTION-ordered on the memory tier
// (api/store-state.ts's getAll has no sort of its own) while
// deriveStates/deriveStatesFor are id-lex / (at, id) ordered by
// construction — every full-collection comparison below
// explicitly id-lex sorts BOTH sides before deepEqual; every
// per-entity history comparison relies on getAllFor's own (at,
// id) sort, which both planes already share.

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
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...(headers ?? {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

function sortByIdAscending<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// Claim-expiry legs advance the test clock (msSinceUtc seam);
// reset so no suite poisons the next.
afterEach(() => {
    resetClock();
});

// Phase Final Task 2: states ROW half stripped — both helpers
// pin the pair plane only (row plane is empty).
async function assertHistoryParity(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    return deriveStatesFor(db, organization, entityId);
}

async function assertDerivedHistory(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    return deriveStatesFor(db, organization, entityId);
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

function emptyGraph(): string {
    return JSON.stringify({ nodes: [], edges: [] });
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

function workOrderFlowGraph(lockTimeoutSeconds: number): string {
    return jsonObjectField({
        name: 'Drift States Fixture Flow',
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

// ---- case 1: GET /states parity, BOTH orgs, the full union ----

test('case 1: GET /states parity — wire equals deriveStates,'
+ ' BOTH organizations (pair plane). Absolute pair count'
+ ' lives in mock-data-pairs (1506); this pin only guards'
+ ' that the five-source union is non-thin after the'
+ ' states-address retirement reshape.', async () => {
    const db = await seededDb();
    const seenIds = new Set<Id>();
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = sortByIdAscending(
            await deriveStates(db, organization),
        );
        // Phase Final Task 2: states ROW half stripped —
        // wire GET /states equals derive (pair plane).
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(db, req(
            'GET', '/states', token,
        ));
        assert.equal(res.status, 200);
        assert.equal(
            await res.text(), JSON.stringify(derived),
        );
        for (const row of derived) seenIds.add(row.id);
    }
    // Seeded union across both orgs — oracle stage4 ≡ stage1
    // proves derived rows are identical to pre-retirement,
    // so the >800 floor still holds.
    assert.ok(seenIds.size > 800, 'seeded states thin');
});

// ---- case 2: GET /entity-states/:id/history parity, one --------
// ---- entity per family --------------------------------------------

const CASE_2_FAMILY_ENTITY_IDS: readonly {
    readonly family: string;
    readonly id: Id;
}[] = [
    { family: 'idea', id: buildIdeas()[0]!.id },
    { family: 'project', id: buildProjects()[0]!.id },
    { family: 'record', id: customerProfileRecordId },
    { family: 'flow', id: buildFlows()[0]!.id },
    { family: 'work-order', id: buildWorkOrders()[0]!.id },
    { family: 'human member', id: buildMembers()[0]!.id },
    { family: 'AI member', id: buildAiMembers()[0]!.id },
    { family: 'system member', id: SYSTEM_MEMBER_ID },
    { family: 'objective', id: OBJECTIVE_SEEDS[0]!.id },
];

test('case 2: GET /entity-states/:id/history parity — one entity'
+ ' per family (idea, project, record, flow, work-order, human'
+ ' member, AI member, system member, objective) + the (at, id)'
+ ' order', async () => {
    const db = await seededDb();
    for (const { family, id } of CASE_2_FAMILY_ENTITY_IDS) {
        const derived = await deriveStatesFor(
            db, STARK_ORGANIZATION, id,
        );
        // Phase Final Task 2: states ROW half stripped —
        // wire history equals derive.
        const token = await organizationToken(
            'current', STARK_ORGANIZATION,
        );
        const res = await handleRequest(db, req(
            'GET', '/entity-states/' + id + '/history', token,
        ));
        assert.equal(res.status, 200, family);
        assert.equal(
            await res.text(), JSON.stringify(derived), family,
        );
        for (let i = 1; i < derived.length; i++) {
            const prior = derived[i - 1]!;
            const current = derived[i]!;
            assert.ok(
                prior.at < current.at
                || (prior.at === current.at
                    && prior.id < current.id),
                family + ' history is not (at, id) ascending',
            );
        }
    }
    // Every seeded objective now carries an explicit genesis
    // event (states-address retirement) — absence-as-active
    // is RETIRED. Expect exactly one genesis row per seed.
    const objectiveEntry = CASE_2_FAMILY_ENTITY_IDS.find(
        (e) => e.family === 'objective',
    )!;
    const objectiveHistory = await deriveStatesFor(
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
        (await deriveStatesFor(
            db, STARK_ORGANIZATION, workOrderEntry.id,
        )).length,
        4,
    );
});

// ---- case 3: the fence's legs + the deleted-entity leg ---------

// Fence legs on the pair plane. Orphan states/:id writes
// retired with the address — the own/foreign/deleted legs
// ride document trios.
test('case 3: the fence\'s legs — own-org visible, foreign hidden'
+ ' (the leak case, constructed EXPLICITLY), and a DELETED'
+ ' foreign entity stays hidden (the tombstone-immune fence)',
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

    // The foreign leg, constructed EXPLICITLY: a fresh idea owned
    // by org 2, checked from STARK's perspective — the leak case
    // that would appear if the fence used the org-SCOPED store
    // (which 404s a foreign row, reading as a harmless orphan)
    // instead of the RAW, unfenced probes.
    const foreignIdeaId = 'drift-states-fence-foreign-idea';
    const foreignCreated = await handleRequest(db, req(
        'PUT', '/ideas/' + foreignIdeaId, tokenOrg2,
        ideaDocument('Foreign', foreignIdeaId + '-genesis', AT),
    ));
    assert.equal(foreignCreated.status, 200);

    // The DELETED-entity leg (gate 2/4): org 2 tombstones its OWN
    // foreign idea via a document-trio PUT (states/:id retired)
    // — the pair plane is IMMUNE to the deleted filter
    // (requests/responses are append-only), so it must still
    // resolve the idea's TRUE owner and stay hidden from STARK.
    const foreignDeleted = await handleRequest(db, req(
        'PUT', '/ideas/' + foreignIdeaId, tokenOrg2,
        ideaDocument(
            'Foreign',
            'drift-states-fence-foreign-del-ev',
            LATER,
            'deleted',
        ),
    ));
    assert.equal(foreignDeleted.status, 200);

    const fromStark = await deriveStates(db, STARK_ORGANIZATION);
    assert.equal(
        fromStark.some((row) => row.id === ownIdeaId + '-genesis'),
        true,
    );
    assert.equal(
        fromStark.some(
            (row) => row.id === foreignIdeaId + '-genesis',
        ),
        false,
    );
    assert.equal(
        fromStark.some(
            (row) => row.id === 'drift-states-fence-foreign-del-ev',
        ),
        false,
    );
    // Org 2 still sees its own genesis + delete on the pair plane.
    const fromOrg2 = await deriveStates(db, ORGANIZATION_TWO);
    assert.equal(
        fromOrg2.some(
            (row) => row.id === foreignIdeaId + '-genesis',
        ),
        true,
    );
    assert.equal(
        fromOrg2.some(
            (row) => row.id === 'drift-states-fence-foreign-del-ev',
        ),
        true,
    );
    assert.equal(
        fromOrg2.some((row) => row.id === ownIdeaId + '-genesis'),
        false,
    );
});

// ---- case 4: the WO lifecycle legs (Task 4) ---------------------

test('case 4a: a SEEDED work order\'s births ride the'
+ ' transition-op source (states-address retirement) —'
+ ' deriveWorkOrderLifecycle contributes the trace events'
+ ' and deriveStatesFor reproduces the full history',
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
    assert.equal(created.status, 204);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const transition1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te1',
            targetState: 'n-middle',
            fieldValues: [],
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(transition1.status, 204);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const transition2At = nowUtc();
    const releaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te2',
            targetState: 'n-finish',
            fieldValues: [],
            release: {
                id: workOrderId + '-rel1',
                state: 'claim_released',
                at: releaseAt,
            },
            transitionAt: transition2At,
        },
    ));
    assert.equal(transition2.status, 204);
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
    assert.equal(entityPut.status, 200);
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
    assert.equal(freshClaim.status, 204);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // An idempotent re-claim by the SAME actor, milliseconds
    // later — 0 events, well within the (now tiny) lock_timeout.
    const beforeRepeat = (
        await deriveStatesFor(
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
    assert.equal(repeatClaim.status, 204);
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
    assert.equal(takeover.status, 204);
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
    assert.equal(put.status, 200);

    const genesis = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-genesis',
            targetState: 'n-start',
            fieldValues: [],
            release: null,
            transitionAt: AT,
        },
    ));
    assert.equal(genesis.status, 204);

    const claimAt = nowUtc();
    const claim = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim', token, {
            claimEventId: workOrderId + '-ce1',
            claimAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimAt,
        },
    ));
    assert.equal(claim.status, 204);

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
    assert.equal(created.status, 204);
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
    assert.equal(claim.status, 204);
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
    assert.equal(released.status, 204);
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
    assert.equal(reclaimed.status, 204);

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

// Phase Final Task 2: writeFlowGraphDelta retired — node
// 'deleted' events are pair-plane-only (deriveFlowGraphStates
// from graphDelta); 'restored' still dual-writes until the
// states-trace strip. Pin pair-plane history alone.
test('case 5a: a LIVE flow-node delete + undo (source e — the'
+ ' seed has NONE) — the deleted/restored sidecar events'
+ ' on the pair plane', async () => {
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
    assert.equal(created.status, 204);

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
        { 'if-response-id': headId },
    ));
    assert.equal(deleted.status, 200);

    // The undo route synthesizes its OWN document pair at the
    // flow's own address (chain 'follows'), doing its own pre-tx
    // head-read — no If-Response-Id echo is needed on this outer,
    // operation-addressed request (api/routes.ts's own undo
    // header, formDocumentPairFor). Undo-as-replay (Phase 14
    // Task 8, NAMED REWRITE): the target (genesis, the one-node
    // graph) is resolved from the flows/:id document-pair
    // history, and the revival of nodeId is computed by the
    // server's own current-vs-target diff — never client-
    // supplied.
    const undoAt = '2026-02-03T00:00:00.000000Z';
    const undone = await handleRequest(db, req(
        'POST', '/flows/' + flowId + '/undo', token, {
            eventId: flowId + '-undo-ev',
            at: undoAt,
        },
    ));
    assert.equal(undone.status, 204);

    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, nodeId,
    );
    assert.deepEqual(
        derived.map((row) => row.state),
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
    assert.equal(acceptGrant.status, 200);
    const accept = await handleRequest(db, req(
        'POST',
        '/invitations/drift-states-inv-accept/acceptance',
        acceptInviteeToken, {
            membershipId: 'drift-states-inv-accept-ms',
            acceptEventId: 'drift-states-inv-accept-accept',
            acceptAt: '2026-03-01T00:00:00.000001Z',
        },
    ));
    assert.equal(accept.status, 204);
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
    assert.equal(declineGrant.status, 200);
    const decline = await handleRequest(db, req(
        'POST',
        '/invitations/drift-states-inv-decline/decline',
        declineInviteeToken, {
            declineEventId: 'drift-states-inv-decline-decline',
            declineAt: '2026-03-02T00:00:00.000001Z',
        },
    ));
    assert.equal(decline.status, 204);
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
    assert.equal(revokeGrant.status, 200);
    const revoke = await handleRequest(db, req(
        'POST',
        '/invitations/drift-states-inv-revoke/revocation',
        adminToken, {
            revokeEventId: 'drift-states-inv-revoke-revoke',
            revokeAt: '2026-03-03T00:00:00.000001Z',
        },
    ));
    assert.equal(revoke.status, 204);
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
// plane only (stateFieldValuesForStateEvent).
test('case 6: the state_field_values JOIN — WO01\'s derived'
+ ' history resolves field values on the pair plane; seed'
+ ' leaf pairs total 7', async () => {
    const db = await seededDb();
    const workOrderId = buildWorkOrders()[0]!.id;
    const derived = await assertHistoryParity(
        db, STARK_ORGANIZATION, workOrderId,
    );

    let sawFieldValues = false;
    let totalFieldValues = 0;
    for (const derivedEvent of derived) {
        const fvs = await stateFieldValuesForStateEvent(
            db, STARK_ORGANIZATION, derivedEvent.id,
        );
        if (fvs.length > 0) sawFieldValues = true;
        totalFieldValues += fvs.length;
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
    assert.equal(created.status, 200);
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
    assert.equal(transitioned.status, 200);
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
    assert.equal(created.status, 204);
    // A membership so the write fence resolves this org-less
    // identity to STARK, not an orphan.
    const membership = await handleRequest(db, req(
        'PUT', '/memberships/ms-' + aiMemberId, token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: aiMemberId, at: AT,
        },
    ));
    assert.equal(membership.status, 200);
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
    assert.equal(archived.status, 200);
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
    assert.equal(reactivated.status, 200);
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
    assert.equal(archived.status, 200);
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
    assert.equal(reactivated.status, 200);
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

    const genesis = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Genesis Title', description: 'd', position: 1,
            state: 'active',
            state_at: '2026-05-01T00:00:00.000000Z',
            state_event_id: recordId + '-genesis',
        },
    ));
    assert.equal(genesis.status, 200);

    const skewed = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Skewed Title', description: 'd', position: 1,
            state: 'archived',
            state_at: '2020-01-01T00:00:00.000000Z',
            state_event_id: recordId + '-skewed',
        },
    ));
    assert.equal(skewed.status, 200);

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
    assert.equal(foreignCreated.status, 200);

    // A STARK admin attempts to inject via the retired
    // states/:id address naming the FOREIGN idea — router
    // 404 (route gone); the event never lands anywhere.
    // Cross-org document forgery is pinned separately by
    // api-write-ownership-fence.test.ts.
    const tokenStark = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const injectedEventId = 'drift-states-tombstone-injected-ev';
    const injected = await handleRequest(db, req(
        'PUT', '/states/' + injectedEventId, tokenStark,
        { entity_id: foreignIdeaId, state: 'archived', at: AT },
    ));
    assert.equal(injected.status, 404);

    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = await deriveStates(db, organization);
        assert.equal(
            derived.some((row) => row.id === injectedEventId),
            false,
        );
    }
});
