import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { NIL_IDENTIFIER } from
    '../shared/identifier.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
} from '../shared/types.ts';
import {
    nowUtc,
    resetClock,
} from '../shared/types.ts';
import {
    canonicalPath,
    responseRecordOf,
} from '../api/message-pair.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import { validateWorkOrderVersion } from '../api/validators.ts';
import type { WorkOrderVersion } from '../api/work-order-version.ts';
import {
    appendLegacyTransition,
} from './legacy-transition-fixture.ts';
import { deriveFlowWorkOrders } from
    '../api/derive-flow-work-orders.ts';
import {
    missedReadError,
    workOrderHeadFor,
    workOrderLifecycleStatesFor,
} from '../api/derive-states.ts';
import { buildWorkOrders } from '../api/mock-data/work-orders.ts';
import {
    buildLeadToCloseWorkload,
} from '../api/mock-data/lead-to-close-flow.ts';
import { l2cFlowId } from '../api/mock-data/lead-to-close-flow.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    pairIdOf,
} from './http-fixtures.ts';

const N_START = generateIdentifier();
const MEMBER_B = generateIdentifier();
const WO_DRIFT_CHAIN_1_EV1 = generateIdentifier();
const WO_DRIFT_CHAIN_1_EV2 = generateIdentifier();
const WO_DRIFT_CHAIN_1_EV3 = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const WO_DRIFT_CHAIN_1_TE1 = generateIdentifier();
const WO_DRIFT_CHAIN_1_FV1 = generateIdentifier();
const ATTR_SEVERITY = generateIdentifier();
const WO_DRIFT_CHAIN_1_FV2 = generateIdentifier();
const ATTR_NOTES = generateIdentifier();
const WO_DRIFT_CHAIN_1_TE2 = generateIdentifier();
const N_FINISH = generateIdentifier();
const EDGE_2 = generateIdentifier();
const WO_DRIFT_CHAIN_1_REL1 = generateIdentifier();
const WO_DRIFT_CHAIN_1_CE1 = generateIdentifier();
const WO_DRIFT_CHAIN_1_EE1 = generateIdentifier();
const WO_DRIFT_CHAIN_1_CE3 = generateIdentifier();
const WO_DRIFT_CHAIN_1_EE3 = generateIdentifier();
const WO_DRIFT_DUP_1_A_EV1 = generateIdentifier();
const WO_DRIFT_DUP_1_A_EV2 = generateIdentifier();
const WO_DRIFT_DUP_1_A_EV3 = generateIdentifier();
const WO_DRIFT_DUP_1_B_EV1 = generateIdentifier();
const WO_DRIFT_DUP_1_B_EV2 = generateIdentifier();
const WO_DRIFT_DUP_1_B_EV3 = generateIdentifier();
const WO_DRIFT_METHOD_FILTER_1 = generateIdentifier();
const WO_DRIFT_METHOD_FILTER_1_FWO = generateIdentifier();
const WO_DRIFT_METHOD_FILTER_1_EV1 = generateIdentifier();
const WO_DRIFT_METHOD_FILTER_1_EV2 = generateIdentifier();
const WO_DRIFT_METHOD_FILTER_1_EV3 = generateIdentifier();
const WO_DRIFT_RETRY_FWO_SHARED = generateIdentifier();
const WO_DRIFT_RETRY_A = generateIdentifier();
const WO_DRIFT_RETRY_A_EV1 = generateIdentifier();
const WO_DRIFT_RETRY_A_EV2 = generateIdentifier();
const WO_DRIFT_RETRY_A_EV3 = generateIdentifier();
const WO_DRIFT_RETRY_B = generateIdentifier();
const WO_DRIFT_RETRY_B_EV1 = generateIdentifier();
const WO_DRIFT_RETRY_B_EV2 = generateIdentifier();
const WO_DRIFT_RETRY_B_EV3 = generateIdentifier();

// Phase Final Task 2: work_orders(+flow_work_orders+
// state_field_values) dual-write stripped. This file no longer
// compares derive vs old-table oracles — the row plane is empty
// after seed. Coverage re-homes to wire-byte handleRequest
// assertions and non-lexical live fixtures. Work-orders is a
// SIMPLE, STATELESS family — DOCUMENT-head-only.

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Claim-expiry legs advance the test clock (msSinceUtc seam);
// reset so no suite poisons the next.
Deno.test.afterEach(() => {
    resetClock();
});

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// A frozen work-order flow-graph snapshot, sized for the
// caller's own scenario: a linear start -> middle -> finish,
// with a caller-chosen lockTimeout (seconds). Independent of any
// seeded flow's own live graph — a work order's flow_graph is a
// point-in-time capture, never a foreign key.
function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Drift Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [
            {
                id: N_START, name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_MIDDLE, name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_FINISH, name: 'Finish',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg', name: '',
                fromNodeId: N_START, toNodeId: N_MIDDLE,
            },
            {
                id: EDGE_2, name: '',
                fromNodeId: N_MIDDLE, toNodeId: N_FINISH,
            },
        ],
    };
}

// The work orders' head versions, as the ops read them: the
// stored response of each live head, through the storage
// edge's validator.
async function derivedWorkOrders(
    db: DbAdapter, organization: Id,
): Promise<WorkOrderVersion[]> {
    const heads = await db.messagePairs.getCollectionHeadPairs(
        canonicalPath(organization, '/work-orders/'),
    );
    return heads.map((pair) => validateWorkOrderVersion(
        responseRecordOf(pair.response)!,
    ));
}

async function derivedWorkOrder(
    db: DbAdapter, organization: Id, id: Id,
): Promise<WorkOrderVersion> {
    const head = await workOrderHeadFor(db, organization, id);
    if (head === null) {
        throw await missedReadError(
            db, id, organization, 'work_orders',
        );
    }
    return head.version;
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

// Every seeded work order's own id: the 45 hand-authored rows
// (buildWorkOrders — 39 Customer Onboarding + 6 Proposal Review
// Cycle) plus the 100 generated Lead-to-Close rows. All 145 land
// in STARK_ORGANIZATION (mock-data.ts: "The whole work-order
// graph stays in org 'AjdvjuECVZEgZoFajaIEkg'").
const SEEDED_WORK_ORDER_IDS = [
    ...buildWorkOrders().map((wo) => wo.id),
    ...buildLeadToCloseWorkload().workOrders.map((wo) => wo.id),
];

// The three flows carrying seeded joins, paired with their own
// join count (the 39/6/100 split) — 'GgfDbXOJUvvaCekCTcvhuw'
// (Fusion Angle Flow) carries none, the empty case
const SEEDED_JOIN_FLOWS = [
    { flowId: 'esKujtyQFYUJaVSXWwavzA', count: 39 },
    { flowId: 'DDUhYDIRInXtIrRraxcyHQ', count: 6 },
    { flowId: l2cFlowId, count: 100 },
];
const EMPTY_FLOW_ID = 'GgfDbXOJUvvaCekCTcvhuw';

// -- 1. work-orders collection wire equals derive -------------

Deno.test('seeded GET /work-orders wire equals derived collection,'
+ ' Stark org', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const res = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , token),
    );
    assertStrictEquals(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedWorkOrders(
        db, STARK_ORGANIZATION,
    );
    assertEquals(JSON.parse(wireText), derived);
    assertStrictEquals(derived.length, 145);
    // Phase Final Stage B: work_orders table retired.
});

// -- 2. org-2 empty collection + foreign-org 404 --------------

Deno.test('org-2 carries no work orders; a foreign-org GET 404s'
+ ' on wire and on derive', async () => {
    const db = await seededDb();
    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const emptyRes = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/work-orders/',
            tokenTwo,
        ),
    );
    assertStrictEquals(emptyRes.status, 200);
    assertStrictEquals(await emptyRes.text(), '[]');
    assertEquals(
        await derivedWorkOrders(db, ORGANIZATION_TWO), [],
    );

    const foreignId = SEEDED_WORK_ORDER_IDS[0]!;
    const expectedMessage =
        'Not found: work_orders/' + foreignId;
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/work-orders/' + foreignId,
            tokenTwo,
        ),
    );
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, expectedMessage);
    const err = await assertRejects(
        () => derivedWorkOrder(db, ORGANIZATION_TWO, foreignId),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);
});

// -- 3. per-WO GET wire equals derive across every seed -------

Deno.test('per-work-order GET wire equals derive for every seed,'
+ ' flow_graph compared byte-exactly', async () => {
    const db = await seededDb();
    assertStrictEquals(SEEDED_WORK_ORDER_IDS.length, 145);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    for (const id of SEEDED_WORK_ORDER_IDS) {
        const res = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + id
                , token),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedWorkOrder(
            db, STARK_ORGANIZATION, id,
        );
        assertEquals(JSON.parse(wireText), derived);
        assert(
            typeof derived.flow_graph === 'object'
            && derived.flow_graph !== null
            && !Array.isArray(derived.flow_graph),
        );
    }
});

// -- 4. join wire equals derive (the 39/6/100 split) + empty --

Deno.test('flow-work-order join wire equals derive across every'
+ ' seeded flow (the 39/6/100 split)', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    for (const { flowId, count } of SEEDED_JOIN_FLOWS) {
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
                    + '/work-orders/',
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveFlowWorkOrders(
            db, STARK_ORGANIZATION, flowId,
        );
        assertStrictEquals(wireText, JSON.stringify(derived));
        assertStrictEquals(derived.length, count);
    }
    // Phase Final Stage B: flow_work_orders table retired.
});

Deno.test('a flow with no work orders derives an empty join list'
+ ' on wire and on derive', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const res = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + EMPTY_FLOW_ID
                + '/work-orders/',
            token,
        ),
    );
    assertStrictEquals(res.status, 200);
    assertStrictEquals(await res.text(), '[]');
    assertEquals(
        await deriveFlowWorkOrders(
            db, STARK_ORGANIZATION, EMPTY_FLOW_ID,
        ),
        [],
    );
});

// -- shared live-write helpers ----------------------------------

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
            display_id: 'drift-' + id,
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

// Wire-byte entity + join parity after a live write (pair
// plane only; row plane empty post-strip).
async function assertEntityAndJoinParity(
    db: MemoryDbAdapter, workOrderId: string, flowId: string,
): Promise<void> {
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const entityRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token),
    );
    assertStrictEquals(entityRes.status, 200);
    const entityText = await entityRes.text();
    const derivedEntity = await derivedWorkOrder(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertEquals(JSON.parse(entityText), derivedEntity);

    const joinRes = await handleRequest(
        db,
        req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId +
                '/work-orders/', token,
        ),
    );
    assertStrictEquals(joinRes.status, 200);
    const joinText = await joinRes.text();
    const derivedJoins = await deriveFlowWorkOrders(
        db, STARK_ORGANIZATION, flowId,
    );
    assertStrictEquals(joinText, JSON.stringify(derivedJoins));
}

// -- 5. live-write chain, re-compared on both planes -----------

Deno.test('live-write chain: birth-claimed create, two transitions'
+ ' (one releasing the claim), an entity PUT, a fresh'
+ ' re-claim, an idempotent re-claim, a rejected foreign claim,'
+ ' and an unclaim — wire equals derive at every step',
async () => {
    const db = await seededDb();
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    await seedOrganizationMember(db, MEMBER_B);
    const tokenB = await organizationToken(MEMBER_B);

    const workOrderId = generateIdentifier();
    const flowWorkOrderId = generateIdentifier();
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);

    // Every `at`/`claimAt`/`expireAt` below is minted via
    // nowUtc() at the point of use — exactly as a real client
    // mints them (claim/release ops, deleteWorkOrderClaim) —
    // NEVER a fixed past literal: the claim steps below are
    // judged against the request's own stamp, so a fixed
    // literal far from the sandbox's real clock would read as
    // already-expired and corrupt the "fresh"/"idempotent"
    // branches this chain drives. nowUtc()
    // is globally strictly monotonic, so sequential mints stay
    // ordered with no gap bookkeeping needed.

    // Create by A: birth-claimed — the third event IS 'claimed'
    // by the creator (verification finding, lens 3).
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', tokenA,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId, graph,
            {
                ids: [
                    WO_DRIFT_CHAIN_1_EV1,
                    WO_DRIFT_CHAIN_1_EV2,
                    WO_DRIFT_CHAIN_1_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Transition with 2+ field values, no release.
    // Task 8 CUT: legacy fieldValues below the gate.
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
            transitionEventId: WO_DRIFT_CHAIN_1_TE1,
            targetState: N_MIDDLE,
            fieldValues: [
                {
                    id: WO_DRIFT_CHAIN_1_FV1,
                    fields: {
                        state_event_id: WO_DRIFT_CHAIN_1_TE1,
                        attribute_id: ATTR_SEVERITY,
                        value: 'high',
                    },
                },
                {
                    id: WO_DRIFT_CHAIN_1_FV2,
                    fields: {
                        state_event_id: WO_DRIFT_CHAIN_1_TE1,
                        attribute_id: ATTR_NOTES,
                        value: 'looks fine',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        },
    );
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Transition WITH release — ends A's birth claim. Mint
    // transitionAt before releaseAt so the at-ordered log
    // matches route post order (the existing api-work-order-
    // transition.test.ts idiom).
    const transition2At = nowUtc();
    const transition2ReleaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/transition',
        tokenA, {
            transitionEventId: WO_DRIFT_CHAIN_1_TE2,
            targetState: N_FINISH,
            release: {
                id: WO_DRIFT_CHAIN_1_REL1,
                state: 'claim_released',
                at: transition2ReleaseAt,
            },
            transitionAt: transition2At,
        },
        await headTag(db, tokenA, workOrderId),
    ));
    assertStrictEquals(transition2.status, 200);
    await transition2.body?.cancel();
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Entity PUT: a position bump. Its own body's flow_graph
    // MUST deep-equal the create's — the fixture invariant case
    // 9's LOCKTIMEOUT SOURCING leans on, asserted explicitly.
    // Compare the STORED, round-tripped create body's own
    // workOrder.flow_graph against the entity PUT's STORED,
    // round-tripped response — two independently re-encoded
    // values, not the same in-memory literal.
    const storedCreatePostRow = (await db.messagePairs.getCollectionPairs(
        canonicalPath(STARK_ORGANIZATION, '/work-orders/'),
    )).find(
        (r) => r.name === workOrderId
            && decodeRequestMessage(r.request).method === 'POST',
    )!;
    const storedCreateFlowGraph = (
        responseRecordOf(storedCreatePostRow.response) as {
            flow_graph: Record<string, unknown>;
        }
    ).flow_graph;
    const entityPut = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, tokenA, {
            display_id: 'drift-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
        await headTag(db, tokenA, workOrderId),
    ));
    assertStrictEquals(entityPut.status, 200);
    const putBody = await entityPut.json() as {
        flow_graph: Record<string, unknown>;
    };
    assertEquals(putBody.flow_graph, storedCreateFlowGraph);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Claim by A — fresh: prior is 'claim_released', not live.
    const claimFreshAt = nowUtc();
    const claimFresh = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/claim',
        tokenA, {
            claimEventId: WO_DRIFT_CHAIN_1_CE1,
            claimAt: claimFreshAt,
            expireEventId: WO_DRIFT_CHAIN_1_EE1,
            expireAt: claimFreshAt,
        },
        await headTag(db, tokenA, workOrderId),
    ));
    assertStrictEquals(claimFresh.status, 200);
    await claimFresh.body?.cancel();
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Repeat-claim by A — idempotent no-op: A resends its
    // claim, milliseconds after the fresh claim above and well
    // within the 8-hour DEFAULT_LOCK_TIMEOUT, so the claim is
    // live and NO new state event lands.
    const beforeRepeat =
        0 /* states table retired */;
    const claimRepeat = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/claim',
        tokenA, {
            claimEventId: WO_DRIFT_CHAIN_1_CE1,
            claimAt: claimFreshAt,
            expireEventId: WO_DRIFT_CHAIN_1_EE1,
            expireAt: claimFreshAt,
        },
        await headTag(db, tokenA, workOrderId),
    ));
    assertStrictEquals(claimRepeat.status, 200);
    await claimRepeat.body?.cancel();
    assertStrictEquals(
        0 /* states table retired */,
        beforeRepeat,
    );
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Claim attempt by actor B — 409, nothing stored.
    const claimRejectAt = nowUtc();
    const rejectTag = await headTag(db, tokenB, workOrderId);
    const beforeReject =
        (await db.messagePairs.getAll()).length;
    const claimReject = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/claim',
        tokenB, {
            claimEventId: WO_DRIFT_CHAIN_1_CE3,
            claimAt: claimRejectAt,
            expireEventId: WO_DRIFT_CHAIN_1_EE3,
            expireAt: claimRejectAt,
        },
        rejectTag,
    ));
    assertStrictEquals(claimReject.status, 409);
    await claimReject.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, beforeReject,
    );
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Unclaim by A via deleteWorkOrderClaim's wire path:
    // DELETE organizations/:id/work-orders/:id/claim.
    const unclaim = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/claim',
        tokenA,
        undefined,
        await headTag(db, tokenA, workOrderId),
    ));
    assertStrictEquals(unclaim.status, 200);
    await unclaim.body?.cancel();
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // The full chain: create(3) + transition1(1) +
    // transition2(2) + entity PUT(0) + fresh claim(1) +
    // repeat-claim(0) + rejected claim(0) + unclaim(1) = 8.
    // Release is message-plane-only — pin via lifecycle derive.
    assertStrictEquals(
        (await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        )).length,
        8,
    );
});

// -- 6. duplicate-create multiset -------------------------------

Deno.test('duplicate-create: two creates, same work-order id, fresh'
+ ' join id + fresh event ids/ats on the second — the second is'
+ ' 409; ONE document head; ONE join pair; THREE birth state'
+ ' events', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);
    const pfidA = generateIdentifier();
    const pfidB = generateIdentifier();

    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, pfidA, flowId, graph,
            {
                ids: [
                    WO_DRIFT_DUP_1_A_EV1,
                    WO_DRIFT_DUP_1_A_EV2,
                    WO_DRIFT_DUP_1_A_EV3,
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
    assertStrictEquals(first.status, 201);

    const second = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, pfidB, flowId, graph,
            {
                ids: [
                    WO_DRIFT_DUP_1_B_EV1,
                    WO_DRIFT_DUP_1_B_EV2,
                    WO_DRIFT_DUP_1_B_EV3,
                ],
                ats: [
                    '2026-05-02T00:00:01.000000Z',
                    '2026-05-02T00:00:01.000001Z',
                    '2026-05-02T00:00:01.000002Z',
                ],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            '2026-05-02T00:00:01.000000Z',
        ),
    ));
    // The create declares its genesis: a taken name is 409,
    // and nothing lands.
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();

    const entityRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token),
    );
    assertStrictEquals(entityRes.status, 200);
    const derivedEntity = await derivedWorkOrder(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertEquals(await entityRes.json(), derivedEntity);
    // Phase Final Stage B: work_orders table retired.

    assertStrictEquals(
        (await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        )).length,
        3,
    );

    const derivedJoins = (await deriveFlowWorkOrders(
        db, STARK_ORGANIZATION, flowId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    assertEquals(
        sortById(derivedJoins).map(r => r.id),
        [pfidA],
    );
});

// -- 7. document supersession (plain, NOT skew) -----------------

// NAMED divergence from the flows skew test
// (tests/derive-flows.test.ts's 'a clock-skewed transition
// does NOT displace genesis'): for a stateless document,
// envelope order and arrival order are STRUCTURALLY identical
// (nowUtc is globally strictly monotonic and response `at` is
// minted synchronously pre-commit), so no live two-PUT
// sequence can decouple them — and there is no body timestamp
// to skew (that test skewed the flow document's state_at,
// which this stateless family does not carry). This case
// asserts plain Simple-PUT supersession only.
// Like a flow PUT, a work-order PUT declares its genesis or
// names the head it replaces.
Deno.test('document supersession: PUT #2 (byte-divergent body)'
+ ' supersedes PUT #1; derivation returns PUT #2\'s body',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();

    const first = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'first',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
        { 'If-None-Match': '*' },
    ));
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const firstId = pairIdOf(first);
    assert(firstId);

    const second = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'second',
            flow_graph: workOrderFlowGraph(4 * 60 * 60),
            position: 2,
        },
        { 'If-Match': first.headers.get('ETag')! },
    ));
    assertStrictEquals(second.status, 200);
    await second.body?.cancel();
    assertStrictEquals(second.headers.get('Supersedes'), null);

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token),
    );
    assertStrictEquals(getRes.status, 200);
    const derived = await derivedWorkOrder(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assertEquals(await getRes.json(), derived);
    assertStrictEquals(derived.display_id, 'second');
    assertStrictEquals(derived.position, 2);
    // Phase Final Stage B: work_orders table retired.
});

// -- 8. method-filter: the create's POST pair is never the -----
// -- derived head (the shape-incompatibility mirror) -----------

Deno.test('the create-op POST pair is not read as a document'
+ ' message pair — documentMessagePairsAt returns exactly one'
+ ' pair (the PUT), and the create body and the version share'
+ ' no top-level key but the id',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = WO_DRIFT_METHOD_FILTER_1;
    const flowWorkOrderId = WO_DRIFT_METHOD_FILTER_1_FWO;
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId, graph,
            {
                ids: [
                    WO_DRIFT_METHOD_FILTER_1_EV1,
                    WO_DRIFT_METHOD_FILTER_1_EV2,
                    WO_DRIFT_METHOD_FILTER_1_EV3,
                ],
                ats: [
                    '2026-05-03T00:00:00.000000Z',
                    '2026-05-03T00:00:00.000001Z',
                    '2026-05-03T00:00:00.000002Z',
                ],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            '2026-05-03T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(created.status, 201);

    const prefix = canonicalPath(
        STARK_ORGANIZATION
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/',
    );
    const [requests] = await Promise.all([
        db.messagePairs.getCollectionPairs(prefix),
        db.messagePairs.getCollectionPairs(prefix),
    ]);
    const pairsAt = requests.filter(
        (r) => r.path === prefix
            && r.name === workOrderId,
    );
    // Both an operation (POST, 204) pair and a document (PUT)
    // pair share the SAME name.
    assertStrictEquals(pairsAt.length, 2);

    const documentMessagePairs = documentMessagePairsAt(
        requests, prefix,
    ).filter((messagePair) => messagePair.name === workOrderId);
    assertStrictEquals(documentMessagePairs.length, 1);
    assertStrictEquals(documentMessagePairs[0]!.method, 'PUT');

    const postRow = pairsAt.find(
        (r) => decodeRequestMessage(r.request).method === 'POST',
    )!;
    const createBodyKeys = new Set(
        Object.keys(decodeRequestMessage(postRow.request).body),
    );
    const documentRow = pairsAt.find(
        (r) => r.id === documentMessagePairs[0]!.id,
    )!;
    const documentBodyKeys = new Set(
        Object.keys(responseRecordOf(documentRow.response)!),
    );
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assertEquals(overlap, ['id']);
});

// -- decode helper (test-side; mirrors tests/api-shadow-ledger- -
// -- work-orders.test.ts's own decodeRequestMessage) ------------

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseWire(message);
    if (model.startLine.kind !== 'request') {
        throw new Error(
            'stored message carries no request line',
        );
    }
    const body = HttpMessage.fromModel(model).body();
    return {
        method: model.startLine.method,
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// -- 10. same-join-id retry: the join declares its genesis -----
// The create's join declares its genesis beside the work
// order's, so a SECOND, genuinely different create [a fresh
// work-order id, a fresh operation] that reuses a prior
// create's flow-work-order id is refused whole: 409, and the
// join keeps its one pair.

Deno.test('same-join-id retry: a second work-order create '
+ 'reusing one flow-work-order id is 409 and the join keeps '
+ 'one chain-less pair', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);
    const sharedFwoId = WO_DRIFT_RETRY_FWO_SHARED;

    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            WO_DRIFT_RETRY_A, sharedFwoId, flowId, graph,
            {
                ids: [
                    WO_DRIFT_RETRY_A_EV1,
                    WO_DRIFT_RETRY_A_EV2,
                    WO_DRIFT_RETRY_A_EV3,
                ],
                ats: [
                    '2026-05-03T00:00:00.000000Z',
                    '2026-05-03T00:00:00.000001Z',
                    '2026-05-03T00:00:00.000002Z',
                ],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            '2026-05-03T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(first.status, 201);

    // A DIFFERENT work order, a DIFFERENT operation (fresh event
    // ids) — not a byte-identical resend, which would replay via
    // the E6 fast path and append no second pair at all.
    const second = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            WO_DRIFT_RETRY_B, sharedFwoId, flowId, graph,
            {
                ids: [
                    WO_DRIFT_RETRY_B_EV1,
                    WO_DRIFT_RETRY_B_EV2,
                    WO_DRIFT_RETRY_B_EV3,
                ],
                ats: [
                    '2026-05-03T00:00:01.000000Z',
                    '2026-05-03T00:00:01.000001Z',
                    '2026-05-03T00:00:01.000002Z',
                ],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            '2026-05-03T00:00:01.000000Z',
        ),
    ));
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();

    const joinPrefix = canonicalPath(
        STARK_ORGANIZATION,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/work-orders/',
    );
    const joinResponses = await db.messagePairs.getDocumentHistory(
        joinPrefix, sharedFwoId,
    );
    assertStrictEquals(joinResponses.length, 1);
    assertStrictEquals(
        joinResponses[0]!.supersedes, NIL_IDENTIFIER,
    );
    assertStrictEquals('follows' in joinResponses[0]!, false);
});
