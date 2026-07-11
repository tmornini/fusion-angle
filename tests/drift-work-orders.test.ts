import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    WorkOrderEntity,
    RequestEntity,
    ResponseEntity,
    StateEntity,
} from '../api/types.ts';
import {
    jsonObjectField, MS_PER_SECOND, nowUtc,
    setClockForTest, resetClock,
} from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { canonicalUriPrefix } from '../api/message-pair.ts';
import {
    documentPairsAt,
    type DocumentPair,
} from '../api/derive-documents.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    pickString,
    validateWorkOrderDocumentBody,
    validateWorkOrderFlowGraphJson,
} from '../api/validators.ts';
import { postWorkOrderDocumentOp } from '../api/routes.ts';
import {
    latestClaimEvent,
} from '../api/work-order-claims.ts';
import { deriveFlowWorkOrders } from
    '../api/derive-flow-work-orders.ts';
import { deriveStatesFor } from '../api/derive-states.ts';
import {
    stateFieldValuesForStateEvent,
} from '../api/derive-state-field-values.ts';
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
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// Phase Final Task 2: work_orders(+flow_work_orders+
// state_field_values) dual-write stripped. This file no longer
// compares derive vs old-table oracles — the row plane is empty
// after seed. Coverage re-homes to wire-byte handleRequest
// assertions and non-lexical live fixtures. Work-orders is a
// SIMPLE, STATELESS family — DOCUMENT-head-only.

const BASE = 'http://localhost';

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
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
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
afterEach(() => {
    resetClock();
});

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// A frozen work-order flow-graph snapshot, sized for the
// caller's own scenario: a linear start -> middle -> finish,
// with a caller-chosen lockTimeout (seconds). Independent of any
// seeded flow's own live graph — a work order's flow_graph is a
// point-in-time capture, never a foreign key.
function workOrderFlowGraph(lockTimeoutSeconds: number): string {
    return jsonObjectField({
        name: 'Drift Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [
            {
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-middle', name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-finish', name: 'Finish',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'e1', name: '',
                fromNodeId: 'n-start', toNodeId: 'n-middle',
            },
            {
                id: 'e2', name: '',
                fromNodeId: 'n-middle', toNodeId: 'n-finish',
            },
        ],
    });
}

// Mirrors routes.ts's private WORK_ORDERS_WIRING by content —
// that row is module-private (every family's wiring row is), so
// this test reconstructs the three fields its OWN read path
// consults (family, lifecycle, notFoundTable, entityOf);
// documentOp/validateDocument ride along to satisfy the
// interface but are never invoked by the two generic read
// functions below.
const WORK_ORDERS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'work-orders',
    lifecycle: 'stateless',
    notFoundTable: 'work_orders',
    validateDocument: validateWorkOrderDocumentBody,
    documentOp: postWorkOrderDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    }),
};

// Any Id works here — both generic read paths ignore their
// `actor` argument entirely.
const READER_ACTOR: Id = 'drift-reader';

async function derivedWorkOrders(
    db: DbAdapter, organization: Id,
): Promise<WorkOrderEntity[]> {
    return documentCollectionGetHandler(WORK_ORDERS_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<WorkOrderEntity[]>;
}

async function derivedWorkOrder(
    db: DbAdapter, organization: Id, id: Id,
): Promise<WorkOrderEntity> {
    return documentGetHandler(WORK_ORDERS_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<WorkOrderEntity>;
}

// Every seeded work order's own id: the 45 hand-authored rows
// (buildWorkOrders — 39 Customer Onboarding + 6 Proposal Review
// Cycle) plus the 100 generated Lead-to-Close rows. All 145 land
// in STARK_ORGANIZATION (mock-data.ts: "The whole work-order
// graph stays in org '1'").
const SEEDED_WORK_ORDER_IDS = [
    ...buildWorkOrders().map((wo) => wo.id),
    ...buildLeadToCloseWorkload().workOrders.map((wo) => wo.id),
];

// The three flows carrying seeded joins, paired with their own
// join count (the 39/6/100 split) — 'E2BnBlZyrriqsQYkmS4usb'
// (Fusion Flow) carries none, the empty case below.
const SEEDED_JOIN_FLOWS = [
    { flowId: 'h5mErVBQhwdMKwi1co30jB', count: 39 },
    { flowId: '7COt7Kf4OaOBg6AjaNO04s', count: 6 },
    { flowId: l2cFlowId, count: 100 },
];
const EMPTY_FLOW_ID = 'E2BnBlZyrriqsQYkmS4usb';

// -- 1. work-orders collection wire equals derive -------------

test('seeded GET /work-orders wire equals derived collection,'
+ ' Stark org', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const res = await handleRequest(
        db, req('GET', '/work-orders', token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedWorkOrders(
        db, STARK_ORGANIZATION,
    );
    assert.equal(wireText, JSON.stringify(derived));
    assert.equal(derived.length, 145);
    // Phase Final Stage B: work_orders table retired.
});

// -- 2. org-2 empty collection + foreign-org 404 --------------

test('org-2 carries no work orders; a foreign-org GET 403s'
+ ' on wire and on derive', async () => {
    const db = await seededDb();
    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const emptyRes = await handleRequest(
        db, req('GET', '/work-orders', tokenTwo),
    );
    assert.equal(emptyRes.status, 200);
    assert.equal(await emptyRes.text(), '[]');
    assert.deepEqual(
        await derivedWorkOrders(db, ORGANIZATION_TWO), [],
    );

    const foreignId = SEEDED_WORK_ORDER_IDS[0]!;
    const expectedMessage =
        'forbidden: work_orders/' + foreignId
        + ' belongs to a different organization';
    const res = await handleRequest(
        db, req('GET', '/work-orders/' + foreignId, tokenTwo),
    );
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.equal(body.error, expectedMessage);
    await assert.rejects(
        () => derivedWorkOrder(db, ORGANIZATION_TWO, foreignId),
        (err: unknown) =>
            err instanceof ForeignOrganizationError
            && err.message === expectedMessage,
    );
});

// -- 3. per-WO GET wire equals derive across every seed -------

test('per-work-order GET wire equals derive for every seed,'
+ ' flow_graph compared byte-exactly', async () => {
    const db = await seededDb();
    assert.equal(SEEDED_WORK_ORDER_IDS.length, 145);
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    for (const id of SEEDED_WORK_ORDER_IDS) {
        const res = await handleRequest(
            db, req('GET', '/work-orders/' + id, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedWorkOrder(
            db, STARK_ORGANIZATION, id,
        );
        assert.equal(wireText, JSON.stringify(derived));
        assert.ok(
            typeof derived.flow_graph === 'string'
            && derived.flow_graph.length > 0,
        );
    }
});

// -- 4. join wire equals derive (the 39/6/100 split) + empty --

test('flow-work-order join wire equals derive across every'
+ ' seeded flow (the 39/6/100 split)', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    for (const { flowId, count } of SEEDED_JOIN_FLOWS) {
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/flows/' + flowId + '/work-orders',
                token,
            ),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveFlowWorkOrders(
            db, STARK_ORGANIZATION, flowId,
        );
        assert.equal(wireText, JSON.stringify(derived));
        assert.equal(derived.length, count);
    }
    // Phase Final Stage B: flow_work_orders table retired.
});

test('a flow with no work orders derives an empty join list'
+ ' on wire and on derive', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const res = await handleRequest(
        db,
        req(
            'GET',
            '/flows/' + EMPTY_FLOW_ID + '/work-orders',
            token,
        ),
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '[]');
    assert.deepEqual(
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
        'current', STARK_ORGANIZATION,
    );
    const entityRes = await handleRequest(
        db, req('GET', '/work-orders/' + workOrderId, token),
    );
    assert.equal(entityRes.status, 200);
    const entityText = await entityRes.text();
    const derivedEntity = await derivedWorkOrder(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.equal(entityText, JSON.stringify(derivedEntity));

    const joinRes = await handleRequest(
        db,
        req(
            'GET', '/flows/' + flowId + '/work-orders', token,
        ),
    );
    assert.equal(joinRes.status, 200);
    const joinText = await joinRes.text();
    const derivedJoins = await deriveFlowWorkOrders(
        db, STARK_ORGANIZATION, flowId,
    );
    assert.equal(joinText, JSON.stringify(derivedJoins));
}

// -- 5. live-write chain, re-compared on both planes -----------

test('live-write chain: birth-claimed create, two transitions'
+ ' (one releasing the claim), an entity PUT, a fresh'
+ ' re-claim, an idempotent re-claim, a rejected foreign claim,'
+ ' and an unclaim — wire equals derive at every step',
async () => {
    const db = await seededDb();
    const tokenA = await organizationToken('current');
    await seedOrganizationMember(db, 'member-b');
    const tokenB = await organizationToken('member-b');

    const workOrderId = 'wo-drift-chain-1';
    const flowWorkOrderId = 'wo-drift-chain-1-fwo';
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);

    // Every `at`/`claimAt`/`expireAt` below is minted via
    // nowUtc() at the point of use — exactly as a real client
    // mints them (claim/release ops, deleteWorkOrderClaim) —
    // NEVER a fixed past literal: the claim steps below are
    // checked by
    // the LIVE route's isClaimEventExpired against REAL
    // Date.now(), so a fixed literal far from the sandbox's real
    // clock would read as already-expired and corrupt the
    // "fresh"/"idempotent" branches this chain drives. nowUtc()
    // is globally strictly monotonic, so sequential mints stay
    // ordered with no gap bookkeeping needed.

    // Create by A: birth-claimed — the third event IS 'claimed'
    // by the creator (verification finding, lens 3).
    const created = await handleRequest(db, req(
        'POST', '/work-orders', tokenA,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId, graph,
            {
                ids: [
                    'wo-drift-chain-1-ev1',
                    'wo-drift-chain-1-ev2',
                    'wo-drift-chain-1-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Transition with 2+ field values, no release.
    const transition1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        tokenA, {
            transitionEventId: 'wo-drift-chain-1-te1',
            targetState: 'n-middle',
            fieldValues: [
                {
                    id: 'wo-drift-chain-1-fv1',
                    fields: {
                        state_event_id: 'wo-drift-chain-1-te1',
                        attribute_id: 'attr-severity',
                        value: 'high',
                    },
                },
                {
                    id: 'wo-drift-chain-1-fv2',
                    fields: {
                        state_event_id: 'wo-drift-chain-1-te1',
                        attribute_id: 'attr-notes',
                        value: 'looks fine',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(transition1.status, 204);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Transition WITH release — ends A's birth claim. Mint
    // transitionAt before releaseAt so the at-ordered log
    // matches route post order (the existing api-work-order-
    // transition.test.ts idiom).
    const transition2At = nowUtc();
    const transition2ReleaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        tokenA, {
            transitionEventId: 'wo-drift-chain-1-te2',
            targetState: 'n-finish',
            fieldValues: [],
            release: {
                id: 'wo-drift-chain-1-rel1',
                state: 'claim_released',
                at: transition2ReleaseAt,
            },
            transitionAt: transition2At,
        },
    ));
    assert.equal(transition2.status, 204);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Entity PUT: a position bump. Its own body's flow_graph
    // MUST deep-equal the create's — the fixture invariant case
    // 9's LOCKTIMEOUT SOURCING leans on, asserted explicitly.
    // Compare the STORED, round-tripped create body's own
    // workOrder.flow_graph against the entity PUT's STORED,
    // round-tripped response — two independently re-encoded
    // values, not the same in-memory literal.
    const storedCreatePostRow = (await db.requests.getAllWhere(
        'uri_prefix',
        canonicalUriPrefix(STARK_ORGANIZATION, '/work-orders/'),
    )).find(
        (r) => r.uri_id === workOrderId
            && decodeRequestMessage(r.message).method === 'POST',
    )!;
    const storedCreateFlowGraph = (
        decodeRequestMessage(storedCreatePostRow.message)
            .body['workOrder'] as { flow_graph: string }
    ).flow_graph;
    const entityPut = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, tokenA, {
            display_id: 'drift-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
    ));
    assert.equal(entityPut.status, 200);
    const putBody = await entityPut.json() as {
        flow_graph: string;
    };
    assert.deepEqual(putBody.flow_graph, storedCreateFlowGraph);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Claim by A — fresh: prior is 'claim_released', not live.
    const claimFreshAt = nowUtc();
    const claimFresh = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        tokenA, {
            claimEventId: 'wo-drift-chain-1-ce1',
            claimAt: claimFreshAt,
            expireEventId: 'wo-drift-chain-1-ee1',
            expireAt: claimFreshAt,
        },
    ));
    assert.equal(claimFresh.status, 204);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Repeat-claim by A — idempotent no-op: the pair appends,
    // but NO new state event lands. Fires milliseconds after the
    // fresh claim above, well within the 8-hour DEFAULT_LOCK_
    // TIMEOUT, so the LIVE route's real-clock isClaimEventExpired
    // reads it as live.
    const beforeRepeat =
        0 /* states table retired */;
    const claimRepeatAt = nowUtc();
    const claimRepeat = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        tokenA, {
            claimEventId: 'wo-drift-chain-1-ce2',
            claimAt: claimRepeatAt,
            expireEventId: 'wo-drift-chain-1-ee2',
            expireAt: claimRepeatAt,
        },
    ));
    assert.equal(claimRepeat.status, 204);
    assert.equal(
        0 /* states table retired */,
        beforeRepeat,
    );
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Claim attempt by actor B — 409, nothing stored.
    const beforeReject =
        (await db.requests.getAll()).length;
    const claimRejectAt = nowUtc();
    const claimReject = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        tokenB, {
            claimEventId: 'wo-drift-chain-1-ce3',
            claimAt: claimRejectAt,
            expireEventId: 'wo-drift-chain-1-ee3',
            expireAt: claimRejectAt,
        },
    ));
    assert.equal(claimReject.status, 409);
    assert.equal(
        (await db.requests.getAll()).length, beforeReject,
    );
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // Unclaim by A via deleteWorkOrderClaim's wire path:
    // POST work-orders/:id/release with caller-minted
    // releaseEventId + releaseAt.
    const unclaimEventId = generateCryptoSafeBase62();
    const unclaim = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/release',
        tokenA, {
            releaseEventId: unclaimEventId,
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(unclaim.status, 204);
    await assertEntityAndJoinParity(db, workOrderId, flowId);

    // The full chain: create(3) + transition1(1) +
    // transition2(2) + entity PUT(0) + fresh claim(1) +
    // repeat-claim(0) + rejected claim(0) + unclaim(1) = 8.
    // Release is pair-plane-only — pin via deriveStatesFor.
    assert.equal(
        (await deriveStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        )).length,
        8,
    );
});

// -- 6. duplicate-create multiset -------------------------------

test('duplicate-create: two creates, same work-order id, fresh'
+ ' join id + fresh event ids/ats on the second — ONE document'
+ ' head; TWO join pairs; SIX birth state events', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-drift-dup-1';
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);
    const pfidA = 'wo-drift-dup-1-fwo-a';
    const pfidB = 'wo-drift-dup-1-fwo-b';

    const first = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, pfidA, flowId, graph,
            {
                ids: [
                    'wo-drift-dup-1-a-ev1',
                    'wo-drift-dup-1-a-ev2',
                    'wo-drift-dup-1-a-ev3',
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
    assert.equal(first.status, 204);

    const second = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, pfidB, flowId, graph,
            {
                ids: [
                    'wo-drift-dup-1-b-ev1',
                    'wo-drift-dup-1-b-ev2',
                    'wo-drift-dup-1-b-ev3',
                ],
                ats: [
                    '2026-05-02T00:00:01.000000Z',
                    '2026-05-02T00:00:01.000001Z',
                    '2026-05-02T00:00:01.000002Z',
                ],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            '2026-05-02T00:00:01.000000Z',
        ),
    ));
    // The create op holds no echo of its own — a duplicate
    // create succeeds outright, never 412ing.
    assert.equal(second.status, 204);

    const entityRes = await handleRequest(
        db, req('GET', '/work-orders/' + workOrderId, token),
    );
    assert.equal(entityRes.status, 200);
    const derivedEntity = await derivedWorkOrder(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.equal(
        await entityRes.text(),
        JSON.stringify(derivedEntity),
    );
    // Phase Final Stage B: work_orders table retired.

    assert.equal(
        (await deriveStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        )).length,
        6,
    );

    const derivedJoins = (await deriveFlowWorkOrders(
        db, STARK_ORGANIZATION, flowId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    assert.equal(derivedJoins.length, 2);
    assert.deepEqual(
        sortById(derivedJoins).map(r => r.id),
        [pfidA, pfidB].sort(),
    );
});

// -- 7. document supersession (plain, NOT skew) -----------------

// NAMED divergence from the trio families' skew tests: for a
// stateless document, envelope order and arrival order are
// STRUCTURALLY identical (nowUtc is globally strictly monotonic
// and response `at` is minted synchronously pre-commit), so no
// live two-PUT sequence can decouple them — and there is no body
// timestamp to skew (the flows/ideas/projects skew tests skewed
// the TRIO's state_at, which this stateless family does not
// carry). This case asserts plain Simple-PUT supersession only.
// Bare-req idiom, no header threading — a NAMED contrast to
// derive-flows' locked-echo idiom (work-orders is 'simple'
// concurrency, never 'locked').
test('document supersession: PUT #2 (byte-divergent body)'
+ ' supersedes PUT #1; derivation returns PUT #2\'s body',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-drift-supersede-1';

    const first = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'first',
            flow_graph: workOrderFlowGraph(8 * 60 * 60),
            position: 1,
        },
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);

    const second = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'second',
            flow_graph: workOrderFlowGraph(4 * 60 * 60),
            position: 2,
        },
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);

    const getRes = await handleRequest(
        db, req('GET', '/work-orders/' + workOrderId, token),
    );
    assert.equal(getRes.status, 200);
    const derived = await derivedWorkOrder(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.equal(
        await getRes.text(), JSON.stringify(derived),
    );
    assert.equal(derived.display_id, 'second');
    assert.equal(derived.position, 2);
    // Phase Final Stage B: work_orders table retired.
});

// -- 8. method-filter: the create's POST pair is never the -----
// -- derived head (the shape-incompatibility mirror) -----------

test('the create-op POST pair is not read as a document pair —'
+ ' documentPairsAt returns exactly one pair (the PUT), and the'
+ ' create/document bodies share zero top-level keys',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-drift-method-filter-1';
    const flowWorkOrderId = 'wo-drift-method-filter-1-fwo';
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId, graph,
            {
                ids: [
                    'wo-drift-method-filter-1-ev1',
                    'wo-drift-method-filter-1-ev2',
                    'wo-drift-method-filter-1-ev3',
                ],
                ats: [
                    '2026-05-03T00:00:00.000000Z',
                    '2026-05-03T00:00:00.000001Z',
                    '2026-05-03T00:00:00.000002Z',
                ],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            '2026-05-03T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 204);

    const prefix = canonicalUriPrefix(
        STARK_ORGANIZATION, '/work-orders/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const atAddress = requests.filter(
        (r) => r.uri_prefix === prefix
            && r.uri_id === workOrderId,
    );
    // Both an operation (POST, 204) pair and a document (PUT)
    // pair share the SAME uriId.
    assert.equal(atAddress.length, 2);

    const documentPairs = documentPairsAt(
        requests, responses, prefix,
    ).filter((pair) => pair.uriId === workOrderId);
    assert.equal(documentPairs.length, 1);
    assert.equal(documentPairs[0]!.method, 'PUT');

    const postRow = atAddress.find(
        (r) => decodeRequestMessage(r.message).method === 'POST',
    )!;
    const createBodyKeys = new Set(
        Object.keys(decodeRequestMessage(postRow.message).body),
    );
    const documentBodyKeys = new Set(
        Object.keys(documentPairs[0]!.body),
    );
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assert.deepEqual(overlap, []);
});

// -- decode helper (test-side; mirrors tests/api-shadow-ledger- -
// -- work-orders.test.ts's own decodeRequestMessage) ------------

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseJson(message, defaultBodyRegistry());
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

// -- 9. THE TRACE-REPLAY PROOF -----------------------------------
//
// A test-side helper (BY DESIGN — its only consumer is this
// proof; the production version, if ever needed, belongs to the
// states-consumers phase against its own consumers) replays a
// live work order's full state history from its MESSAGE PAIRS
// ALONE, never from old-plane rows. Every replay rule below is
// PINNED (verification findings, lens 3 — B1/P1/P2/P3 applied);
// see the task brief for the authoritative wording.

// Every successful pair at a prefix, ANY method — the test-side
// counterpart of derive-documents.ts's documentPairsAt, which
// deliberately EXCLUDES POST (the DOCUMENT head is PUT/DELETE
// only). The create's own 3-slot birth arrays live in the POST
// operation pair, so this replay needs the unfiltered read the
// production reduction intentionally never exposes — named for
// its role (every pair, any method) rather than "documentPairsAt
// without the filter", so no reader mistakes it for a production
// substitute.
interface AnyPair {
    readonly id: string;
    readonly at: string;
    readonly uriId: string;
    readonly method: string;
    readonly body: Record<string, unknown>;
    readonly requesterIdentityId: string;
}

function atIdCompare(
    a: { readonly at: string; readonly id: string },
    b: { readonly at: string; readonly id: string },
): number {
    return a.at < b.at ? -1
        : a.at > b.at ? 1
            : a.id < b.id ? -1
                : a.id > b.id ? 1
                    : 0;
}

function allPairsAt(
    requests: readonly RequestEntity[],
    responses: readonly ResponseEntity[],
    uriPrefix: string,
): AnyPair[] {
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const pairs: AnyPair[] = [];
    for (const response of responses) {
        if (
            response.uri_prefix !== uriPrefix
            || response.status < 200
            || response.status > 299
        ) continue;
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        const decoded = decodeRequestMessage(request.message);
        pairs.push({
            id: response.id,
            at: response.at,
            uriId: response.uri_id,
            method: decoded.method,
            body: decoded.body,
            requesterIdentityId: request.requester_identity_id,
        });
    }
    return pairs.sort(atIdCompare);
}

// A pure Date-parse subtraction — the replay's own comparator,
// reproducing the route's `>=` boundary EXACTLY WITHOUT importing
// isClaimEventExpired (Date.now-coupled; barred by the brief).
function msBetween(laterIso: string, earlierIso: string): number {
    return Date.parse(laterIso) - Date.parse(earlierIso);
}

function isExpiredAsOf(
    claimAt: string,
    priorAt: string,
    lockTimeoutSeconds: number,
): boolean {
    return msBetween(claimAt, priorAt)
        >= lockTimeoutSeconds * MS_PER_SECOND;
}

// LOCKTIMEOUT SOURCING: the WO's DOCUMENT HEAD as of `momentAt`
// — the (at, id) winner among PUT/DELETE pairs whose response
// `at` strictly precedes it. `entityPairs` is ascending by (at,
// id) already (documentPairsAt's own contract), so the last
// entry passing the filter IS that winner.
function documentHeadBefore(
    entityPairs: readonly DocumentPair[],
    momentAt: string,
): DocumentPair | undefined {
    const before = entityPairs.filter((p) => p.at < momentAt);
    return before[before.length - 1];
}

function lockTimeoutAsOf(
    entityPairs: readonly DocumentPair[],
    momentAt: string,
): number {
    const head = documentHeadBefore(entityPairs, momentAt);
    if (head === undefined) {
        throw new Error(
            'no document head before ' + momentAt,
        );
    }
    return validateWorkOrderFlowGraphJson(
        pickString(head.body, 'flow_graph'),
        'trace-replay document head flow_graph',
    ).lockTimeout;
}

interface FieldValueTriple {
    readonly id: string;
    readonly state_event_id: string;
    readonly attribute_id: string;
    readonly value: string;
}

// Each claim pair re-runs the 0/1/2-event decision with the
// pair BODY's claimAt as the reference clock. PRIOR state
// reduces from the REPLAYED events so far (never old-plane
// rows) via latestClaimEvent's own CLAIM_STATES filter + (at,
// id) max — the mechanics are pure and Date.now-free, so
// reusing them here does not reintroduce the barred coupling.
function applyClaimPair(
    replayed: StateEntity[],
    entityPairs: readonly DocumentPair[],
    claim: AnyPair,
    workOrderId: string,
): void {
    const claimEventId = pickString(claim.body, 'claimEventId');
    const claimAt = pickString(claim.body, 'claimAt');
    const expireEventId = pickString(
        claim.body, 'expireEventId',
    );
    const expireAt = pickString(claim.body, 'expireAt');
    const lockTimeout = lockTimeoutAsOf(entityPairs, claim.at);
    const prior = latestClaimEvent(replayed, workOrderId);
    const priorLive = prior !== null
        && prior.state === 'claimed'
        && !isExpiredAsOf(claimAt, prior.at, lockTimeout);

    if (priorLive) {
        // Idempotent re-claim by the SAME actor: the claim
        // pair's requesterIdentityId is the only actor signal
        // the body carries — 0 events. (A foreign live claim
        // 409s before any pair forms — never reaches here.)
        return;
    }
    if (prior !== null && prior.state === 'claimed') {
        replayed.push({
            id: expireEventId,
            entity_id: workOrderId,
            state: 'claim_expired',
            // Recovered from the PRIOR claim pair's OWN
            // replayed event author, never the current pair.
            member_id: prior.member_id,
            at: expireAt,
        });
    }
    replayed.push({
        id: claimEventId,
        entity_id: workOrderId,
        state: 'claimed',
        member_id: claim.requesterIdentityId,
        at: claimAt,
    });
}

function applyTransitionPair(
    replayed: StateEntity[],
    replayedFieldValues: FieldValueTriple[],
    transition: AnyPair,
    workOrderId: string,
): void {
    const transitionEventId = pickString(
        transition.body, 'transitionEventId',
    );
    const targetState = pickString(
        transition.body, 'targetState',
    );
    const transitionAt = pickString(
        transition.body, 'transitionAt',
    );
    replayed.push({
        id: transitionEventId,
        entity_id: workOrderId,
        state: targetState,
        member_id: transition.requesterIdentityId,
        at: transitionAt,
    });

    const fieldValues = transition.body['fieldValues'] as
        readonly { id: string; fields: Record<string, unknown> }[];
    for (const row of fieldValues) {
        replayedFieldValues.push({
            id: row.id,
            state_event_id: pickString(
                row.fields, 'state_event_id',
            ),
            attribute_id: pickString(
                row.fields, 'attribute_id',
            ),
            value: pickString(row.fields, 'value'),
        });
    }

    const release = transition.body['release'];
    if (release !== null) {
        const releaseFields = release as {
            id: string; state: string; at: string;
        };
        replayed.push({
            id: releaseFields.id,
            entity_id: workOrderId,
            // VERBATIM from the pair body — the gate does not
            // constrain release.state to 'claim_released';
            // never hardcode the constant.
            state: releaseFields.state,
            member_id: transition.requesterIdentityId,
            at: releaseFields.at,
        });
    }
}

// Replays postWorkOrderReleaseOp: a live unexpired claim as
// of releaseAt → claim_released; otherwise zero events.
function applyReleasePair(
    replayed: StateEntity[],
    entityPairs: readonly DocumentPair[],
    release: AnyPair,
    workOrderId: string,
): void {
    const releaseEventId = pickString(
        release.body, 'releaseEventId',
    );
    const releaseAt = pickString(release.body, 'releaseAt');
    const lockTimeout = lockTimeoutAsOf(
        entityPairs, release.at,
    );
    const prior = latestClaimEvent(replayed, workOrderId);
    const priorLive = prior !== null
        && prior.state === 'claimed'
        && !isExpiredAsOf(releaseAt, prior.at, lockTimeout);
    if (!priorLive) return;
    replayed.push({
        id: releaseEventId,
        entity_id: workOrderId,
        state: 'claim_released',
        member_id: release.requesterIdentityId,
        at: releaseAt,
    });
}

interface ReplayResult {
    readonly events: StateEntity[];
    readonly fieldValues: FieldValueTriple[];
}

// The orchestrator: gather every message pair the live chain
// could have formed for `workOrderId`, then replay them in
// (at, id) order into a StateEntity[] — the SAME shape and the
// SAME order db.states.getAllFor(workOrderId) returns.
async function replayWorkOrderStates(
    db: MemoryDbAdapter,
    organization: string,
    workOrderId: string,
): Promise<ReplayResult> {
    const woPrefix = canonicalUriPrefix(
        organization, '/work-orders/',
    );
    const [woRequests, woResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', woPrefix),
        db.responses.getAllWhere('uri_prefix', woPrefix),
    ]);
    const allWoPairs = allPairsAt(woRequests, woResponses, woPrefix);
    const createPair = allWoPairs.find(
        (p) => p.method === 'POST' && p.uriId === workOrderId,
    );
    if (createPair === undefined) {
        throw new Error(
            'no create pair found for ' + workOrderId,
        );
    }
    const entityPairs = documentPairsAt(
        woRequests, woResponses, woPrefix,
    ).filter((pair) => pair.uriId === workOrderId);

    const claimPrefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/claim/',
    );
    const [claimRequests, claimResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', claimPrefix),
        db.responses.getAllWhere('uri_prefix', claimPrefix),
    ]);
    const claimPairs = allPairsAt(
        claimRequests, claimResponses, claimPrefix,
    ).filter((p) => p.method === 'POST');

    const releasePrefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/release/',
    );
    const [releaseRequests, releaseResponses] =
        await Promise.all([
            db.requests.getAllWhere(
                'uri_prefix', releasePrefix,
            ),
            db.responses.getAllWhere(
                'uri_prefix', releasePrefix,
            ),
        ]);
    const releasePairs = allPairsAt(
        releaseRequests, releaseResponses, releasePrefix,
    ).filter((p) => p.method === 'POST');

    const transitionPrefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/transition/',
    );
    const [
        transitionRequests, transitionResponses,
    ] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', transitionPrefix),
        db.responses.getAllWhere('uri_prefix', transitionPrefix),
    ]);
    const transitionPairs = allPairsAt(
        transitionRequests, transitionResponses,
        transitionPrefix,
    ).filter((p) => p.method === 'POST');

    // The create pair's 3-slot arrays synthesize the three birth
    // events, all authored by the create pair's own
    // requesterIdentityId.
    const events: StateEntity[] = [];
    const ids = createPair.body['stateEventIds'] as
        readonly string[];
    const ats = createPair.body['stateEventAts'] as
        readonly string[];
    const states = createPair.body['states'] as
        readonly string[];
    for (let i = 0; i < 3; i++) {
        events.push({
            id: ids[i]!,
            entity_id: workOrderId,
            state: states[i]!,
            member_id: createPair.requesterIdentityId,
            at: ats[i]!,
        });
    }

    const fieldValues: FieldValueTriple[] = [];
    type Kind = 'claim' | 'transition' | 'release';
    const actions: { kind: Kind; pair: AnyPair }[] = [
        ...claimPairs.map((pair) => ({
            kind: 'claim' as const, pair,
        })),
        ...transitionPairs.map((pair) => ({
            kind: 'transition' as const, pair,
        })),
        ...releasePairs.map((pair) => ({
            kind: 'release' as const, pair,
        })),
    ].sort((a, b) => atIdCompare(a.pair, b.pair));

    for (const action of actions) {
        if (action.kind === 'claim') {
            applyClaimPair(
                events, entityPairs, action.pair, workOrderId,
            );
        } else if (action.kind === 'transition') {
            applyTransitionPair(
                events, fieldValues, action.pair, workOrderId,
            );
        } else {
            applyReleasePair(
                events, entityPairs, action.pair, workOrderId,
            );
        }
    }

    events.sort(atIdCompare);
    return { events, fieldValues };
}

test('THE TRACE-REPLAY PROOF: a test-side replay of a live'
+ ' work order\'s message pairs alone reproduces its full'
+ ' states history, event-for-event and (at, id)-ordered',
async () => {
    const db = await seededDb();
    const tokenA = await organizationToken('current');
    await seedOrganizationMember(db, 'member-b');
    const tokenB = await organizationToken('member-b');

    const workOrderId = 'wo-drift-trace-1';
    const flowWorkOrderId = 'wo-drift-trace-1-fwo';
    const flowId = EMPTY_FLOW_ID;
    // A TINY lockTimeout: isClaimEventExpired checks the LIVE
    // route's decision via msSinceUtc (the clock seam), never a
    // body timestamp, so every claim-related `at` below is minted
    // via nowUtc() at the point of use (never a fixed literal —
    // see case 5's own note) and the expired-takeover leg (5)
    // advances the test clock past this tiny window —
    // client-minted ats far from the boundary either way, since
    // the advance comfortably clears it.
    const tinyLockTimeoutSeconds = 1;
    const graph = workOrderFlowGraph(tinyLockTimeoutSeconds);

    // Leg 1: birth-claimed create by A.
    const created = await handleRequest(db, req(
        'POST', '/work-orders', tokenA,
        createWorkOrderBody(
            workOrderId, flowWorkOrderId, flowId, graph,
            {
                ids: [
                    'wo-drift-trace-1-ev1',
                    'wo-drift-trace-1-ev2',
                    'wo-drift-trace-1-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);

    // Leg 2: release — a transition carrying release, ending
    // A's birth claim (distinct from leg 8's named release
    // op). Mint transitionAt before releaseAt (the api-work-
    // order-transition.test.ts idiom).
    const releaseTransitionAt = nowUtc();
    const releaseAt = nowUtc();
    const release = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        tokenA, {
            transitionEventId: 'wo-drift-trace-1-te1',
            targetState: 'n-middle',
            fieldValues: [],
            release: {
                id: 'wo-drift-trace-1-rel1',
                state: 'claim_released',
                at: releaseAt,
            },
            transitionAt: releaseTransitionAt,
        },
    ));
    assert.equal(release.status, 204);

    // The entity PUT: position bump, flow_graph held CONSTANT
    // (case 5's named invariant) — LOCKTIMEOUT SOURCING is
    // exercised across a document head change without a moving
    // lock_timeout target. Compare the STORED, round-tripped
    // create body's own workOrder.flow_graph against the entity
    // PUT's STORED, round-tripped response body — two
    // independently re-encoded values, not the same in-memory
    // literal — so a canonical-JSON regression that mangled
    // either differently would be caught.
    const storedCreatePostRow = (await db.requests.getAllWhere(
        'uri_prefix',
        canonicalUriPrefix(STARK_ORGANIZATION, '/work-orders/'),
    )).find(
        (r) => r.uri_id === workOrderId
            && decodeRequestMessage(r.message).method === 'POST',
    )!;
    const storedCreateFlowGraph = (
        decodeRequestMessage(storedCreatePostRow.message)
            .body['workOrder'] as { flow_graph: string }
    ).flow_graph;
    const entityPut = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, tokenA, {
            display_id: 'drift-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
    ));
    assert.equal(entityPut.status, 200);
    const putBody = await entityPut.json() as {
        flow_graph: string;
    };
    assert.deepEqual(putBody.flow_graph, storedCreateFlowGraph);

    // Leg 3: re-claim by A — fresh (prior is 'claim_released').
    const reclaimAt = nowUtc();
    const reclaim = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        tokenA, {
            claimEventId: 'wo-drift-trace-1-ce1',
            claimAt: reclaimAt,
            expireEventId: 'wo-drift-trace-1-ee1',
            expireAt: reclaimAt,
        },
    ));
    assert.equal(reclaim.status, 204);

    // Leg 4: idempotent re-claim by A — fires milliseconds after
    // leg 3, well within the tiny lockTimeout, same actor — 0
    // events.
    const idempotentAt = nowUtc();
    const idempotent = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        tokenA, {
            claimEventId: 'wo-drift-trace-1-ce2',
            claimAt: idempotentAt,
            expireEventId: 'wo-drift-trace-1-ee2',
            expireAt: idempotentAt,
        },
    ));
    assert.equal(idempotent.status, 204);

    // Advance the test clock past the tiny lockTimeout so leg
    // 3's claim genuinely reads as expired to the LIVE route's
    // isClaimEventExpired (msSinceUtc seam).
    setClockForTest(() =>
        Date.now()
        + (tinyLockTimeoutSeconds + 2) * MS_PER_SECOND);

    // Leg 5: expired takeover by B — 2 events ('claim_expired'
    // naming A, 'claimed' naming B).
    const takeoverExpireAt = nowUtc();
    const takeoverClaimAt = nowUtc();
    const takeover = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        tokenB, {
            claimEventId: 'wo-drift-trace-1-ce3',
            claimAt: takeoverClaimAt,
            expireEventId: 'wo-drift-trace-1-ee3',
            expireAt: takeoverExpireAt,
        },
    ));
    assert.equal(takeover.status, 204);

    // Leg 6: transition with values, by B.
    const withValuesAt = nowUtc();
    const withValues = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        tokenB, {
            transitionEventId: 'wo-drift-trace-1-te2',
            targetState: 'n-middle',
            fieldValues: [
                {
                    id: 'wo-drift-trace-1-fv1',
                    fields: {
                        state_event_id: 'wo-drift-trace-1-te2',
                        attribute_id: 'attr-severity',
                        value: 'medium',
                    },
                },
                {
                    id: 'wo-drift-trace-1-fv2',
                    fields: {
                        state_event_id: 'wo-drift-trace-1-te2',
                        attribute_id: 'attr-notes',
                        value: 'reviewed',
                    },
                },
            ],
            release: null,
            transitionAt: withValuesAt,
        },
    ));
    assert.equal(withValues.status, 204);

    // Leg 7: transition to finish by B — claim stays live so
    // Leg 8's named release op has a live claim to end
    // (distinct from Leg 2's embedded transition+release).
    const finishTransitionAt = nowUtc();
    const finish = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        tokenB, {
            transitionEventId: 'wo-drift-trace-1-te3',
            targetState: 'n-finish',
            fieldValues: [],
            release: null,
            transitionAt: finishTransitionAt,
        },
    ));
    assert.equal(finish.status, 204);

    // Leg 8: unclaim via POST work-orders/:id/release
    // (deleteWorkOrderClaim's wire path), by A.
    const unclaimEventId = generateCryptoSafeBase62();
    const unclaim = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/release',
        tokenA, {
            releaseEventId: unclaimEventId,
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(unclaim.status, 204);

    const replay = await replayWorkOrderStates(
        db, STARK_ORGANIZATION, workOrderId,
    );
    // Pin the test-side pair replay against the live
    // production derive (deriveStatesFor) — both read the same
    // op-pair composition (create/claim/release/transition).
    const derivedHistory = await deriveStatesFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.deepEqual(replay.events, derivedHistory);
    // create(3) + release-transition(2) + reclaim(1) +
    // idempotent(0) + expired-takeover(2) + values-transition(1)
    // + finish-transition(1) + unclaim(1) = 11.
    assert.equal(replay.events.length, 11);

    // Phase Final Task 2: SFV row plane empty; pair-plane
    // two-source union carries the transition fold.
    const derivedFieldValues =
        await stateFieldValuesForStateEvent(
            db, STARK_ORGANIZATION, 'wo-drift-trace-1-te2',
        );
    assert.equal(replay.fieldValues.length, 2);
    // Phase Final Stage B: state_field_values table retired.
    assert.deepEqual(
        sortById(replay.fieldValues).map((row) => ({
            state_event_id: row.state_event_id,
            attribute_id: row.attribute_id,
            value: row.value,
        })),
        sortById(derivedFieldValues).map((row) => ({
            state_event_id: row.state_event_id,
            attribute_id: row.attribute_id,
            value: row.value,
        })),
    );
});

// -- 10. same-join-id retry: the join stays chain-less ----------
// (Phase 9 Task 2 Step 0(d') pin, additive and pass-first against
// HEAD: the create route's join pair hardcodes headPairId:
// undefined by design — no head-read at all — so a SECOND,
// genuinely different create [a fresh work-order id, a fresh
// operation] that happens to reuse a prior create's flow-work-
// order id still appends a chain-less join pair, never a
// Supersedes onto the first. Pinned BEFORE the shared former
// absorbs this site, so a future uniform head-read regresses
// here first.)

test('same-join-id retry: two different work-order creates '
+ 'reusing one flow-work-order id each append a chain-less '
+ 'join pair (neither Supersedes nor Follows)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = EMPTY_FLOW_ID;
    const graph = workOrderFlowGraph(8 * 60 * 60);
    const sharedFwoId = 'wo-drift-retry-fwo-shared';

    const first = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            'wo-drift-retry-a', sharedFwoId, flowId, graph,
            {
                ids: [
                    'wo-drift-retry-a-ev1',
                    'wo-drift-retry-a-ev2',
                    'wo-drift-retry-a-ev3',
                ],
                ats: [
                    '2026-05-03T00:00:00.000000Z',
                    '2026-05-03T00:00:00.000001Z',
                    '2026-05-03T00:00:00.000002Z',
                ],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            '2026-05-03T00:00:00.000000Z',
        ),
    ));
    assert.equal(first.status, 204);

    // A DIFFERENT work order, a DIFFERENT operation (fresh event
    // ids) — not a byte-identical resend, which would replay via
    // the E6 fast path and append no second pair at all.
    const second = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            'wo-drift-retry-b', sharedFwoId, flowId, graph,
            {
                ids: [
                    'wo-drift-retry-b-ev1',
                    'wo-drift-retry-b-ev2',
                    'wo-drift-retry-b-ev3',
                ],
                ats: [
                    '2026-05-03T00:00:01.000000Z',
                    '2026-05-03T00:00:01.000001Z',
                    '2026-05-03T00:00:01.000002Z',
                ],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            '2026-05-03T00:00:01.000000Z',
        ),
    ));
    assert.equal(second.status, 204);

    const joinPrefix = canonicalUriPrefix(
        STARK_ORGANIZATION,
        '/flows/' + flowId + '/work-orders/',
    );
    const joinResponses = (await db.responses.getAllWhere(
        'uri_id', sharedFwoId,
    )).filter((row) => row.uri_prefix === joinPrefix);
    assert.equal(joinResponses.length, 2);
    for (const response of joinResponses) {
        assert.equal(response.supersedes, undefined);
        assert.equal(response.follows, undefined);
    }
});
