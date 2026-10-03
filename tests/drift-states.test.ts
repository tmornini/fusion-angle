import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id, StateEntity } from '../shared/types.ts';
import {
    nowUtc, DEFAULT_LOCK_TIMEOUT, MS_PER_SECOND,
    setClockForTest, resetClock,
} from '../shared/types.ts';
import {
    deriveInvitationStates,
    workOrderLifecycleStatesFor,
    workOrderHistoryFor,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    canonicalPath,
} from '../api/message-pair.ts';
import { deriveFlowStateHistory } from
    '../api/derive-flows.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import { buildWorkOrders } from '../api/mock-data/work-orders.ts';
import { organizationToken } from './token-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    pairIdOf,
    partBodiesOf,
    partsOf,
    invitationLatched,
} from './http-fixtures.ts';

const DRIFT_STATES_FENCE_OWN_IDEA = generateIdentifier();
const DRIFT_STATES_FENCE_FOREIGN_IDEA = generateIdentifier();
const DRIFT_STATES_WO_CHAIN_1 = generateIdentifier();
const DRIFT_STATES_WO_CHAIN_FLOW_PLACEHOLDER = generateIdentifier();
const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const N_FINISH = generateIdentifier();
const DRIFT_STATES_WO_HYBRID_1 = generateIdentifier();
const DRIFT_STATES_HYBRID = generateIdentifier();
const DRIFT_STATES_WO_STANDALONE_RELEASE_1 = generateIdentifier();
const DRIFT_STATES_WO_STANDALONE_RELEASE_FLOW = generateIdentifier();
const DRIFT_STATES_FLOW_NODE_1 = generateIdentifier();
const DRIFT_STATES_PROJ_1 = generateIdentifier();
const DRIFT_STATES_AI_CHAIN_1 = generateIdentifier();
const WORKORDERID_FWO = generateIdentifier();
const WORKORDERID_EV1 = generateIdentifier();
const WORKORDERID_EV2 = generateIdentifier();
const WORKORDERID_EV3 = generateIdentifier();
const WORKORDERID_TE1 = generateIdentifier();
const WORKORDERID_TE2 = generateIdentifier();
const WORKORDERID_REL1 = generateIdentifier();
const WORKORDERID_CE1 = generateIdentifier();
const WORKORDERID_EE1 = generateIdentifier();
const WORKORDERID_CE2 = generateIdentifier();
const WORKORDERID_EE2 = generateIdentifier();
const WORKORDERID_CE3 = generateIdentifier();
const WORKORDERID_EE3 = generateIdentifier();
const WORKORDERID_GENESIS = generateIdentifier();
const FLOWID_DELETE_SAVE = generateIdentifier();
const FLOWID_NODE_DELETED = generateIdentifier();
const FLOWID_UNDO_EV = generateIdentifier();

// The E10 drift check (Phase 11 Task 6): the per-family parity
// proof comparing OLD-plane states reads to the message-derived
// output (api/derive-states.ts), over the FULL seeded dataset
// PLUS live writes. NOTHING reads api/derive-states.ts in
// production yet (no route flip — Task 1's row-plane fence still
// serves live traffic); this file alone GATES that flip (Task 7)
// and stays as a regression guard through Phase Final.
//
// Every comparison below reads the message plane through the
// base adapter (Phase Final Task 5 retired the store
// decorator shell). Mirrors the sibling drift suites
// (tests/drift-identities.test.ts,
// tests/drift-work-orders.test.ts, tests/drift-flows.
// test.ts, tests/drift-records.test.ts) this file's structure
// and fixture voice are drawn from.
//
// C3: bulk deriveStates / bulk lifecycle collection retired.
// Cases rework onto per-family and collection history parity.
// Graph sidecars pin document-message-pair graphDelta / revivals.

const AT = '2026-01-01T00:00:00.000000Z';

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
        ...(headers !== undefined
            ? { headers } : {}),
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// An operation on a work order names the head it read.
async function headTag(
    db: MemoryDbAdapter,
    token: string,
    workOrderId: string,
): Promise<Record<string, string>> {
    const read = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId,
        token,
    ));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    return { 'If-Match': read.headers.get('ETag')! };
}

// Claim-expiry legs advance the test clock (msSinceUtc seam);
// reset so no suite poisons the next.
Deno.test.afterEach(() => {
    resetClock();
});

// Per-entity history across family sources — production
// deriveStatesFor / deriveFlowGraphStates retired (C2/C3).
// Local oracle for mixed-family drift cases only. Graph
// node/edge events are NOT here — pin message-plane sidecars
// in case 5a directly.
async function entityHistory(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    const [flowRows, workOrderRows, invitationRows] =
        await Promise.all([
            deriveFlowStateHistory(db, organization, entityId),
            workOrderLifecycleStatesFor(
                db, organization, entityId,
            ),
            deriveInvitationStates(db).then((rows) =>
                rows.filter((r) => r.entity_id === entityId)),
        ]);
    return [...flowRows, ...workOrderRows, ...invitationRows]
        .sort((a, b) =>
            a.at < b.at ? -1 : a.at > b.at ? 1
                : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Phase Final Task 2: states ROW half stripped — both helpers
// pin the message plane only (row plane is empty).
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
    state = 'active',
): Record<string, unknown> {
    return {
        title, position: 0,
        problem_statement: '', target_users: '',
        proposed_solution: '', expected_outcome: '',
        success_metrics: '',
        state,
    };
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows, which lists the identities collection
// and reads one PII document each — seedPersonIdentity writes
// the identities/:id document and its PII, so email resolution
// finds the person.
async function person(
    db: MemoryDbAdapter, id: string, name: string, email: string,
): Promise<void> {
    await seedPersonIdentity(db, id, {
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
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token),
    );
    const id = pairIdOf(got);
    assert(id
        , 'no Response-ID on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + '' + flowId);
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

Deno.test('case 1: bulk history doors are absent; per-item'
+ ' history still 200 for BOTH organizations',
async () => {
    const db = await seededDb();
    let woSeen = 0;
    let objSeen = 0;
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const woBulk = await handleRequest(db, req(
            'GET',
            '/organizations/' + organization
                + '/work-orders/history',
            token,
        ));
        // Retired bulk door matches work-orders/:id with
        // id "history" — identifier gate 400s, never 200.
        assertStrictEquals(woBulk.status, 400);

        const objBulk = await handleRequest(db, req(
            'GET',
            '/organizations/' + organization
                + '/objectives/versions',
            token,
        ));
        assertStrictEquals(objBulk.status, 400);

        const woList = await handleRequest(db, req(
            'GET',
            '/organizations/' + organization
                + '/work-orders/',
            token,
        ));
        // Org two seeds no work order: its collection selects
        // none and answers 204.
        assertStrictEquals(
            woList.status,
            organization === STARK_ORGANIZATION ? 200 : 204,
        );
        const workOrders = await partBodiesOf<{ id: string }>(
            woList,
        );
        for (const row of workOrders) {
            const history = await handleRequest(
                db, req(
                    'GET',
                    '/organizations/' + organization
                        + '/work-orders/' + row.id
                        + '/history',
                    token,
                ),
            );
            assertStrictEquals(history.status, 200);
            const events = await history.json() as {
                id: string;
            }[];
            woSeen += events.length;
        }

        const objList = await handleRequest(db, req(
            'GET',
            '/organizations/' + organization
                + '/objectives/',
            token,
        ));
        assertStrictEquals(objList.status, 200);
        const objectives = await partBodiesOf<{ id: string }>(
            objList,
        );
        for (const row of objectives) {
            const versions = await handleRequest(
                db, req(
                    'GET',
                    '/organizations/' + organization
                        + '/objectives/' + row.id
                        + '/versions/',
                    token,
                ),
            );
            assertStrictEquals(versions.status, 200);
            const rows = await partBodiesOf<{
                id: string;
            }>(versions);
            objSeen += rows.length;
        }
    }
    assert(woSeen > 0, 'work-order history thin');
    assert(objSeen > 0, 'objectives history thin');
});

// ---- case 2: GET <family>/:id/history parity, one entity --------
// ---- per family (states-URI elimination C1) ----------------------

const CASE_2_FAMILY_ENTITY_IDS: readonly {
    readonly family: string;
    readonly routeFamily: string;
    readonly id: Id;
}[] = [
    {
        family: 'flow',
        routeFamily: 'organizations/'
            + STARK_ORGANIZATION + '/flows',
        id: buildFlows()[0]!.id,
    },
    {
        family: 'work-order',
        routeFamily: 'organizations/'
            + STARK_ORGANIZATION + '/work-orders',
        id: buildWorkOrders()[0]!.id,
    },
];

Deno.test('case 2: flow parts match deriveFlowStateHistory;'
+ ' work-order history stays (at, id) DESC',
async () => {
    const db = await seededDb();
    for (const { family, routeFamily, id }
        of CASE_2_FAMILY_ENTITY_IDS
    ) {
        const derived = await entityHistory(
            db, STARK_ORGANIZATION, id,
        );
        // Work-order history is newest first. Its wire
        // widens StateEntity with field_values — parity
        // is the lifecycle core (id/state/at/member_id),
        // not full JSON equality with the bare derive.
        const expected = derived.toReversed();
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
        );
        const suffix = family === 'work-order'
            ? '/history'
            : '/versions/';
        const res = await handleRequest(db, req(
            'GET',
            '/' + routeFamily + '/' + id + suffix,
            token,
        ));
        assertStrictEquals(res.status, 200, family);
        if (family === 'flow') {
            const parts = await partsOf<{
                state_event_id: string;
                state: string;
                state_at: string;
            }>(res);
            const history = await deriveFlowStateHistory(
                db, STARK_ORGANIZATION, id,
            );
            assertEquals(
                parts.map((part) => {
                    const body = part.body().toValue();
                    return {
                        state_event_id:
                            body.state_event_id,
                        state: body.state,
                        state_at: body.state_at,
                    };
                }),
                history.map((row) => ({
                    state_event_id: row.id,
                    state: row.state,
                    state_at: row.at,
                })),
                family,
            );
            continue;
        }
        const wire = await res.json() as {
            id: string;
            entity_id?: string;
            state: string;
            member_id?: string;
            at?: string;
        }[];
        assertStrictEquals(wire.length, expected.length, family);
        for (let i = 0; i < expected.length; i++) {
            const e = expected[i]!;
            const w = wire[i]!;
            assertStrictEquals(
                w.id, e.id, family + ' id@' + i,
            );
            assertStrictEquals(
                w.entity_id, e.entity_id,
                family + ' entity_id@' + i,
            );
            assertStrictEquals(
                w.member_id, e.member_id,
                family + ' member_id@' + i,
            );
            assertStrictEquals(
                w.at, e.at, family + ' at@' + i,
            );
            assertStrictEquals(
                w.state, e.state, family + ' state@' + i,
            );
        }
        for (let i = 1; i < wire.length; i++) {
            const prev = wire[i - 1]!;
            const cur = wire[i]!;
            const prevAt = prev.at;
            const curAt = cur.at;
            assert(
                prevAt !== undefined && curAt !== undefined,
                family + ' history row missing at@' + i,
            );
            assert(
                prevAt > curAt
                || (prevAt === curAt
                    && prev.id > cur.id),
                family + ' history is not (at, id) DESC',
            );
        }
    }
    // The work order carries its full 4-event hand-authored
    // trace — a non-vacuous, multi-event leg (case 6 below reuses
    // this SAME entity for the field-values join proof).
    const workOrderEntry = CASE_2_FAMILY_ENTITY_IDS.find(
        (e) => e.family === 'work-order',
    )!;
    assertStrictEquals(
        (await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderEntry.id,
        )).length,
        4,
    );
});

// ---- case 3: the fence's legs + the deleted-entity leg ---------

// Fence legs on the message plane. Orphan states/:id writes
// retired with the document — the own/foreign/deleted legs
// ride documents.
Deno.test('case 3: the fence\'s legs — own-org history visible,'
+ ' foreign history 404 (miss at this document), a'
+ ' state-deleted idea\'s versions are Gone, and it'
+ ' still names its owner',
async () => {
    const db = await seededDb();
    const tokenStark = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const tokenOrg2 = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );

    const ownIdeaId = DRIFT_STATES_FENCE_OWN_IDEA;
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ownIdeaId
            , tokenStark,
        ideaDocument('Own'),
    ));

    const foreignIdeaId = DRIFT_STATES_FENCE_FOREIGN_IDEA;
    const foreignCreated = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/ideas/' + foreignIdeaId,
        tokenOrg2,
        ideaDocument('Foreign'),
    ));
    assertStrictEquals(foreignCreated.status, 201);
    const foreignTag = pairIdOf(foreignCreated);
    assert(foreignTag !== null);

    // The DELETED-entity leg: org 2 tombstones its OWN idea —
    // message plane is IMMUNE to deleted filter, so owner still
    // resolves. STARK history is a miss at this document.
    const foreignDeleted = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/ideas/' + foreignIdeaId,
        tokenOrg2,
        ideaDocument('Foreign', 'deleted'),
    ));
    assertStrictEquals(foreignDeleted.status, 200);

    // Own history 200 with genesis.
    const ownRes = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ownIdeaId +
            '/versions/', tokenStark,
    ));
    assertStrictEquals(ownRes.status, 200);
    const ownParts = await partsOf<{ id: string }>(ownRes);
    assert(
        ownParts.some((part) =>
            part.body().toValue().id === ownIdeaId),
    );

    // Foreign history from STARK → 404; owner still org 2
    // after tombstone.
    const foreignRes = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + foreignIdeaId
            + '/versions/',
        tokenStark,
    ));
    assertStrictEquals(foreignRes.status, 404);
    assertStrictEquals(
        await resolveOwningOrganization(
            db, foreignIdeaId, STARK_ORGANIZATION,
        ),
        ORGANIZATION_TWO,
    );

    // A state-deleted idea is Gone on both version
    // routes. The list and the item name the document.
    const org2Res = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_TWO
            + '/ideas/' + foreignIdeaId + '/versions/',
        tokenOrg2,
    ));
    assertStrictEquals(org2Res.status, 410);
    assertEquals(await org2Res.json(), {
        error: 'Gone: ideas/' + foreignIdeaId,
    });
    const org2Item = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_TWO
            + '/ideas/' + foreignIdeaId + '/versions/'
            + foreignTag,
        tokenOrg2,
    ));
    assertStrictEquals(org2Item.status, 410);
    assertEquals(await org2Item.json(), {
        error: 'Gone: ideas/' + foreignIdeaId,
    });

    // STARK idea absent from org 2 history read (404).
    const ownFromOrg2 = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_TWO
            + '/ideas/' + ownIdeaId + '/versions/',
        tokenOrg2,
    ));
    assertStrictEquals(ownFromOrg2.status, 404);
});

// ---- case 4: the WO lifecycle legs (Task 4) ---------------------

Deno.test('case 4a: a SEEDED work order\'s births ride the'
+ ' transition-op source (states-document retirement) —'
+ ' workOrderLifecycleStatesFor contributes the trace events'
+ ' and reproduces history',
async () => {
    const db = await seededDb();
    // WO02 (buildWorkOrders()[1]) — a DIFFERENT seeded work order
    // than case 2's own WO01, so this leg stays orthogonal.
    const seededWorkOrderId = buildWorkOrders()[1]!.id;
    const lifecycle = await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, seededWorkOrderId,
    );
    assert(
        lifecycle.length > 0,
        'seeded traces must derive from transition ops',
    );
    await assertHistoryParity(
        db, STARK_ORGANIZATION, seededWorkOrderId,
    );
});

Deno.test('case 4b: work-order live-write chain — birth-claimed'
+ ' create, a transition, a transition+release, a MOVING'
+ ' lock_timeout entity PUT, a fresh claim, an idempotent'
+ ' re-claim (0 events), and a claim_expired takeover'
+ ' — re-compared on both planes at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const workOrderId = DRIFT_STATES_WO_CHAIN_1;
    const flowWorkOrderId = WORKORDERID_FWO;
    const flowId = DRIFT_STATES_WO_CHAIN_FLOW_PLACEHOLDER;
    const bigLockTimeoutSeconds = 8 * 60 * 60;
    const tinyLockTimeoutSeconds = 1;

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId,
            workOrderFlowGraph(bigLockTimeoutSeconds),
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const transition1 = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/transition',
        token, {
            transitionEventId: WORKORDERID_TE1,
            targetState: N_MIDDLE,
            release: null,
            transitionAt: nowUtc(),
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(transition1.status, 200);
    await transition1.body?.cancel();
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const transition2At = nowUtc();
    const releaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/transition',
        token, {
            transitionEventId: WORKORDERID_TE2,
            targetState: N_FINISH,
            release: {
                id: WORKORDERID_REL1,
                state: 'claim_released',
                at: releaseAt,
            },
            transitionAt: transition2At,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(transition2.status, 200);
    await transition2.body?.cancel();
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // The MOVING lock_timeout case: an entity PUT shrinks
    // lock_timeout mid-history — every claim below must source it
    // FRESH from the document head as of its own moment, never a
    // single cached value.
    const entityPut = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'drift-states-' + workOrderId,
            flow_graph: workOrderFlowGraph(tinyLockTimeoutSeconds),
            position: 2,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(entityPut.status, 200);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const freshClaimAt = nowUtc();
    const freshClaim = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId +
            '/claim', token, {
            claimEventId: WORKORDERID_CE1,
            claimAt: freshClaimAt,
            expireEventId: WORKORDERID_EE1,
            expireAt: freshClaimAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(freshClaim.status, 200);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // An idempotent re-claim: the SAME actor resends its
    // claim, milliseconds later — 0 events, well within the
    // (now tiny) lock_timeout.
    const beforeRepeat = (
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        )
    ).length;
    const repeatClaim = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId +
            '/claim', token, {
            claimEventId: WORKORDERID_CE1,
            claimAt: freshClaimAt,
            expireEventId: WORKORDERID_EE1,
            expireAt: freshClaimAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(repeatClaim.status, 200);
    const afterRepeat = await assertHistoryParity(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertStrictEquals(afterRepeat.length, beforeRepeat);

    // Advance the test clock past the tiny lock_timeout — the
    // claim's request stamp rides the clock seam, never a body
    // timestamp — then a claim_expired takeover:
    // 2 events (claim_expired naming the prior claimant,
    // claimed naming the new one).
    setClockForTest(() =>
        Date.now()
        + (tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);
    const takeoverExpireAt = nowUtc();
    const takeoverClaimAt = nowUtc();
    const takeover = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId +
            '/claim', token, {
            claimEventId: WORKORDERID_CE3,
            claimAt: takeoverClaimAt,
            expireEventId: WORKORDERID_EE3,
            expireAt: takeoverExpireAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(takeover.status, 200);
    const finalHistory = await assertHistoryParity(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertEquals(
        finalHistory.slice(-2).map((row) => row.state),
        ['claim_expired', 'claimed'],
    );
});

// HYBRID: bare document PUT (no create op) + transition
// genesis + live claim. All events ride the work-order
// lifecycle source (states/:id retired).
Deno.test('case 4c: HYBRID — a seeded-shape work order (a bare'
+ ' document PUT, no create operation) plus a transition'
+ ' genesis and a LIVE claim — no id collision',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const workOrderId = DRIFT_STATES_WO_HYBRID_1;

    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: DRIFT_STATES_HYBRID,
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
        { 'If-None-Match': '*' },
    ));
    assertStrictEquals(put.status, 201);

    const genesis = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/transition',
        token, {
            transitionEventId: WORKORDERID_GENESIS,
            targetState: N_START,
            release: null,
            transitionAt: AT,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(genesis.status, 200);
    await genesis.body?.cancel();

    const claimAt = nowUtc();
    const claim = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId +
            '/claim', token, {
            claimEventId: WORKORDERID_CE1,
            claimAt,
            expireEventId: WORKORDERID_EE1,
            expireAt: claimAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim.status, 200);
    await claim.body?.cancel();

    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertStrictEquals(derived.length, 2);
    assertEquals(
        derived.map((row) => row.id),
        [WORKORDERID_GENESIS, WORKORDERID_CE1],
    );
});

Deno.test('case 4d: claim, release via POST organizations/:id/work-orders/'
+ ':id/release (the deleteWorkOrderClaim shape — a claim_released'
+ ' event with no claim/transition operation message pair'
+ ' beside it), then RE-claim — the replay must see that'
+ ' release as the prior claim event (exactly as'
+ ' postWorkOrderClaimOp\'s own in-tx'
+ ' read sees it), so the fresh claim posts a PLAIN \'claimed\''
+ ' event with no synthetic \'claim_expired\' — parity holds'
+ ' at every step',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const workOrderId = DRIFT_STATES_WO_STANDALONE_RELEASE_1;
    const flowWorkOrderId = WORKORDERID_FWO;
    const flowId = DRIFT_STATES_WO_STANDALONE_RELEASE_FLOW;
    // A large lock_timeout: if the replay wrongly fell back to
    // the ORIGINAL claim as "prior" (never seeing the named
    // release), that claim would read as still LIVE at the
    // reclaim below, and the bug (zero events emitted) would
    // reproduce. A tiny lock_timeout would let a correct-by-
    // accident expiry takeover mask the same bug.
    const bigLockTimeoutSeconds = 8 * 60 * 60;

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId,
            workOrderFlowGraph(bigLockTimeoutSeconds),
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, N_FINISH],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    const claimAt = nowUtc();
    const claim = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId +
            '/claim', token, {
            claimEventId: WORKORDERID_CE1,
            claimAt,
            expireEventId: WORKORDERID_EE1,
            expireAt: claimAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claim.status, 200);
    await assertHistoryParity(db, STARK_ORGANIZATION, workOrderId);

    // The named release: DELETE organizations/:id/work-orders/:id/claim.
    const released = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/claim',
        token,
        undefined,
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(released.status, 200);
    await released.body?.cancel();
    const afterRelease = await assertDerivedHistory(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertEquals(
        afterRelease.map((row) => row.state),
        [
            N_START, N_MIDDLE, N_FINISH,
            'claimed', 'claim_released',
        ],
    );

    // The RE-claim, MILLISECONDS after the release and nowhere
    // near the (large) lock_timeout of the ORIGINAL claim. The
    // live route grants it outright (message-plane claim history
    // finds the release, not the stale claim, as the prior
    // claim-vocabulary event).
    const reclaimAt = nowUtc();
    const reclaimed = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId +
            '/claim', token, {
            claimEventId: WORKORDERID_CE2,
            claimAt: reclaimAt,
            expireEventId: WORKORDERID_EE2,
            expireAt: reclaimAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(reclaimed.status, 200);
    await reclaimed.body?.cancel();

    const derived = await assertDerivedHistory(
        db, STARK_ORGANIZATION, workOrderId,
    );
    // The expiry-interaction pin: the fresh claim lands as a
    // PLAIN 'claimed' event, never preceded by a synthetic
    // 'claim_expired' — a named release resets the prior-claim
    // baseline entirely, so the reclaim is never treated as an
    // expiry takeover of the (chronologically superseded)
    // original claim.
    assertEquals(
        derived.map((row) => row.state),
        [
            N_START, N_MIDDLE, N_FINISH,
            'claimed', 'claim_released', 'claimed',
        ],
    );
});

// ---- case 5: the NEW sources — flow-node delete+undo, ------------
// ---- invitation grant/accept/decline (the seed has NEITHER) ------

// C3: deriveFlowGraphStates retired — pin graphDelta.deletions
// / revivals on the flow document message pairs directly (SIDECAR-KEEP).
Deno.test('case 5a: a LIVE flow-node delete + undo — the'
+ ' deleted/restored sidecar events on the message plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const flowId = DRIFT_STATES_FLOW_NODE_1;
    const nodeId = generateIdentifier();
    const genesisAt = '2026-02-01T00:00:00.000000Z';

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: flowId,
            flow: flowFields('Drift Node Flow'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: DRIFT_STATES_PROJ_1,
                flow_id: flowId, at: genesisAt,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: genesisAt,
            graphDelta: {
                nodes: [nodeRowBody(nodeId, flowId, genesisAt)],
                edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        },
    ));
    assertStrictEquals(created.status, 201);

    const deleteAt = '2026-02-02T00:00:00.000000Z';
    const deleted = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            , token, {
            ...flowFields('Drift Node Flow Trimmed'),
            state: 'updated', state_at: deleteAt,
            state_event_id: FLOWID_DELETE_SAVE,
            graph: emptyGraph(),
            graphDelta: {
                ...emptyDelta(),
                deletions: [{
                    eventId: FLOWID_NODE_DELETED,
                    entityId: nodeId, at: deleteAt,
                }],
            },
            revivals: [],
        },
        { 'if-match': (
            await handleRequest(
                db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + '' + flowId, token),
            )
        ).headers.get('ETag')! },
    ));
    assertStrictEquals(deleted.status, 200);

    const undoAt = '2026-02-03T00:00:00.000000Z';
    const undone = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/undo', token, {
            eventId: FLOWID_UNDO_EV,
            at: undoAt,
        },
        { 'if-match': '"'
            + await headResponseId(db, token, flowId) + '"' },
    ));
    assertStrictEquals(undone.status, 200);

    const prefix = canonicalPath(
        STARK_ORGANIZATION, '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/',
    );
    const [requests] = await Promise.all([
        db.messagePairs.getCollectionPairs(prefix),
        db.messagePairs.getCollectionPairs(prefix),
    ]);
    const messagePairs = documentMessagePairsAt(
        requests, prefix,
    ).filter((p) => p.name === flowId);
    const states: { state: string; at: string }[] = [];
    for (const messagePair of messagePairs) {
        const delta = messagePair.body['graphDelta'];
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
        const revivals = messagePair.body['revivals'];
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
    assertEquals(
        states.map((s) => s.state),
        ['deleted', 'restored'],
    );
});

Deno.test('case 5b: a LIVE invitation grant/accept chain, a LIVE'
+ ' grant/decline chain, and a LIVE grant/revoke chain (source f'
+ ' — the seed has NONE) — each deepEquals the old plane', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );

    const acceptInvitee = 'YeQnyZJddPctAdaMBVWEew';
    const acceptName = membershipNameOf(
        STARK_ORGANIZATION, acceptInvitee,
    );
    await person(
        db, acceptInvitee, 'Accept Invitee',
        'drift-states-invitee-accept@x.com',
    );
    const acceptInviteeToken = await organizationToken(
        acceptInvitee, STARK_ORGANIZATION,
    );
    const acceptGrant = await handleRequest(db, req(
        'POST',
        '/organizations/' + STARK_ORGANIZATION
            + '/invitations/',
        adminToken, {
            email: 'drift-states-invitee-accept@x.com',
            grantAt: '2026-03-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(acceptGrant.status, 201);
    const accept = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + acceptInvitee
            + '/invitations/' + acceptName,
        acceptInviteeToken, {
            state: 'accepted',
            at: '2026-03-01T00:00:00.000001Z',
        },
    )));
    assertStrictEquals(accept.status, 200);
    const acceptDerived = await assertHistoryParity(
        db, STARK_ORGANIZATION, acceptName,
    );
    assertEquals(
        acceptDerived.map((row) => row.state),
        ['pending', 'accepted'],
    );

    const declineInvitee = 'YfxZQrzQBOaPJmijEVzQOg';
    const declineName = membershipNameOf(
        STARK_ORGANIZATION, declineInvitee,
    );
    await person(
        db, declineInvitee, 'Decline Invitee',
        'drift-states-invitee-decline@x.com',
    );
    const declineInviteeToken = await organizationToken(
        declineInvitee, STARK_ORGANIZATION,
    );
    const declineGrant = await handleRequest(db, req(
        'POST',
        '/organizations/' + STARK_ORGANIZATION
            + '/invitations/',
        adminToken, {
            email: 'drift-states-invitee-decline@x.com',
            grantAt: '2026-03-02T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(declineGrant.status, 201);
    const decline = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + declineInvitee
            + '/invitations/' + declineName,
        declineInviteeToken, {
            state: 'declined',
            at: '2026-03-02T00:00:00.000001Z',
        },
    )));
    assertStrictEquals(decline.status, 200);
    const declineDerived = await assertHistoryParity(
        db, STARK_ORGANIZATION, declineName,
    );
    assertEquals(
        declineDerived.map((row) => row.state),
        ['pending', 'declined'],
    );

    // The revoked leg: the ONE terminal invitation state that
    // had NO old-plane parity evidence anywhere before this task
    // (the invitation's version list reads exactly this
    // history for its 'revoked' version).
    const revokeInvitee = generateIdentifier();
    const revokeName = membershipNameOf(
        STARK_ORGANIZATION, revokeInvitee,
    );
    await person(
        db, revokeInvitee, 'Revoke Invitee',
        'drift-states-invitee-revoke@x.com',
    );
    const revokeGrant = await handleRequest(db, req(
        'POST',
        '/organizations/' + STARK_ORGANIZATION
            + '/invitations/',
        adminToken, {
            email: 'drift-states-invitee-revoke@x.com',
            grantAt: '2026-03-03T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(revokeGrant.status, 201);
    const revoke = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/invitations/' + revokeName,
        adminToken, {
            state: 'revoked',
            at: '2026-03-03T00:00:00.000001Z',
        },
    )));
    assertStrictEquals(revoke.status, 200);
    const revokeDerived = await assertHistoryParity(
        db, STARK_ORGANIZATION, revokeName,
    );
    assertEquals(
        revokeDerived.map((row) => row.state),
        ['pending', 'revoked'],
    );
});

// ---- case 6: the state_field_values JOIN (lens 6) ---------------

// Phase Final Task 2: SFV row half stripped — join is
// message-plane only (work-order history inline fold; C4).
Deno.test('case 6: the state_field_values JOIN — WO01\'s derived'
+ ' history resolves field values on the message plane; seed'
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
    assertStrictEquals(
        sawFieldValues, true,
        'no derived event resolved any state_field_values —'
        + ' the join proof would be vacuous',
    );
    assertStrictEquals(totalFieldValues, 7);
    // Phase Final Stage B: state_field_values table retired.
});

// ---- case 7: live-write chains re-compared on both planes --------

// States-document retirement: archive/reactivate ride PUT
// /members/:id with the lifecycle trio — message-plane pin.
Deno.test('case 7b: live-write chain — AI agent create then'
+ ' update — message-plane pin via PUT ai-agents/:id',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const aiMemberId = DRIFT_STATES_AI_CHAIN_1;

    const created = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiMemberId, token,
        aiMemberDetail('Drift Bot'),
    ));
    assertStrictEquals(created.status, 201);
    const got = await handleRequest(
        db,
        req('GET', '/ai-agents/' + aiMemberId, token),
    );
    assertStrictEquals(got.status, 200);
    assertStrictEquals(
        ((await got.json()) as { name: string }).name,
        'Drift Bot',
    );

    const updated = await handleRequest(db, req(
        'PUT', '/ai-agents/' + aiMemberId, token,
        aiMemberDetail('Drift Bot 2'),
    ));
    assertStrictEquals(updated.status, 200);
    const after = await handleRequest(
        db,
        req('GET', '/ai-agents/' + aiMemberId, token),
    );
    assertStrictEquals(
        ((await after.json()) as { name: string }).name,
        'Drift Bot 2',
    );
});
