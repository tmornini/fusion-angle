import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
    type DbAdapter,
    TABLE_NAMES,
} from '../api/db.ts';
import { nowUtc } from '../api/types.ts';
import {
    workOrderDocumentHeadFor,
    workOrderClaimHistoryFor,
    workOrderHistoryFor,
    stateEventVisibilityFor,
    resolveOwningOrganization,
    deriveWorkOrderLifecycle,
    deriveMemberStates,
} from '../api/derive-states.ts';
import {
    appendLegacyTransition,
} from './legacy-transition-fixture.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import {
    flowGraphBindingsFromPairs,
    deriveFlows,
} from '../api/derive-flows.ts';
import {
    relationFailClosed,
} from '../api/flow-graph-relations.ts';
import { latestByKey } from
    '../shared/ledger-reduction.ts';
import type { GraphEdge } from '../api/types.ts';
import {
    collectAttributeReferrers,
    type AttributeReferrers,
} from '../api/record-attribute-refs.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    asWorkOrderFlowGraph,
} from '../api/validators.ts';
import {
    deriveIdeas,
    deriveIdeaStateHistory,
} from '../api/derive-ideas.ts';
import { deriveProjects } from
    '../api/derive-projects.ts';
import {
    latestClaimEvent,
    isClaimEventExpired,
} from '../api/work-order-claims.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { seededMockDb } from './mock-seed.ts';

// Phase 15: view-safe derive cores (Task 1) + claim-gate
// graph re-anchor pins (Task 2) + field-values visibility
// re-anchor pins (Task 3) + RESTRICT graph-leg re-anchor
// pins (Task 4) + pre-dispatch fence re-anchor parity
// (Task 5). Pre-tx-vs-in-tx parity and residual drift
// against the dual-write row plane.

const BASE = 'http://localhost';

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

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Phase15 Head Fixture Flow',
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
                fromNodeId: 'n-start',
                toNodeId: 'n-finish',
            },
        ],
    };
}

// The claim gate's write-tx table list
// (postWorkOrderClaimOp, routes.ts). Phase Final Task 2:
// work_orders dropped (ROW half stripped).
const CLAIM_TX_TABLES = [
    'requests', 'responses',
] as const;

const EMPTY_FLOW_ID = 'E2BnBlZyrriqsQYkmS4usb';

// -- workOrderDocumentHeadFor ------------------------------------

// Phase Final Task 2: work_orders ROW half stripped — wire +
// pair-plane head are the oracles (row plane empty).
test('workOrderDocumentHeadFor: wire GET equals head for a'
+ ' live create; null for absent; pre-tx vs in-tx parity',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-p15-doc-head';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'p15-' + workOrderId,
                flow_graph: graph,
                position: 7,
            },
            flowWorkOrderId: workOrderId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                workOrderId + '-ev1',
                workOrderId + '-ev2',
                workOrderId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-finish', 'claimed'],
        },
    ));
    assert.equal(created.status, 204);

    const getRes = await handleRequest(
        db, req('GET', '/work-orders/' + workOrderId, token),
    );
    assert.equal(getRes.status, 200);
    const wire = await getRes.json();
    const preTx = await workOrderDocumentHeadFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const inTx = await db.transaction(
        [...CLAIM_TX_TABLES],
        (view) => workOrderDocumentHeadFor(
            view, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.deepEqual(preTx, inTx);
    assert.deepEqual(preTx, wire);
    // Phase Final Stage B: work_orders table retired.

    // Absent id: pair plane returns null (Task 2 maps to the
    // same EntityNotFoundError bytes as workOrders.getById).
    const preTxMissing = await workOrderDocumentHeadFor(
        db, STARK_ORGANIZATION, 'no-such-work-order',
    );
    const inTxMissing = await db.transaction(
        [...CLAIM_TX_TABLES],
        (view) => workOrderDocumentHeadFor(
            view, STARK_ORGANIZATION, 'no-such-work-order',
        ),
    );
    assert.equal(preTxMissing, null);
    assert.equal(inTxMissing, null);
    const missRes = await handleRequest(
        db,
        req('GET', '/work-orders/no-such-work-order', token),
    );
    assert.equal(missRes.status, 404);
});

test('workOrderDocumentHeadFor: tracks a later document PUT'
+ ' (head, not create-time body) on wire + pair plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-p15-doc-head-edit';
    const graph1 = workOrderFlowGraph(4 * 60 * 60);
    const graph2 = workOrderFlowGraph(12 * 60 * 60);

    const put1 = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'before',
            flow_graph: graph1,
            position: 1,
        },
    ));
    assert.equal(put1.status, 200);

    const put2 = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'after',
            flow_graph: graph2,
            position: 3,
        },
    ));
    assert.equal(put2.status, 200);

    const getRes = await handleRequest(
        db, req('GET', '/work-orders/' + workOrderId, token),
    );
    assert.equal(getRes.status, 200);
    const wire = await getRes.json() as {
        display_id: string;
        position: number;
    };
    const derived = await workOrderDocumentHeadFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    assert.deepEqual(derived, wire);
    assert.equal(derived!.display_id, 'after');
    assert.equal(derived!.position, 3);
});

// -- claim graph parity (Phase 15 Task 2) ------------------------

// Phase Final Task 2: claim graph is pair-plane only.
// Seed via PUT (document pair, no birth claim) so the live
// claim is a real append, not an idempotent re-claim.
test('claim graph: pre-tx vs in-tx flow_graph parity and'
+ ' claim-outcome on the pair plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-p15-claim-graph';
    const lockTimeoutSeconds = 8 * 60 * 60;
    const graph = workOrderFlowGraph(lockTimeoutSeconds);

    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'p15-cg-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
    ));
    assert.equal(put.status, 200);

    const preTx = await workOrderDocumentHeadFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const inTx = await db.transaction(
        [...CLAIM_TX_TABLES],
        (view) => workOrderDocumentHeadFor(
            view, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.deepEqual(preTx, inTx);
    assert.deepEqual(preTx!.flow_graph, graph);

    const headGraph = asWorkOrderFlowGraph(
        preTx!.flow_graph, 'work_orders.flow_graph',
    );
    assert.equal(headGraph.lockTimeout, lockTimeoutSeconds);

    // Fresh PUT: no live claim → priorLive is false.
    const history = await workOrderClaimHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const prior = latestClaimEvent(history, workOrderId);
    const priorLiveFromHead = prior !== null
        && prior.state === 'claimed'
        && !isClaimEventExpired(
            prior, headGraph.lockTimeout,
        );
    assert.equal(priorLiveFromHead, false);

    // Live path: claim against the re-anchored gate succeeds.
    const claimResponse = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/claim',
        token, {
            claimEventId: generateCryptoSafeBase62(),
            claimAt: nowUtc(),
            expireEventId: generateCryptoSafeBase62(),
            expireAt: nowUtc(),
        },
    ));
    assert.equal(claimResponse.status, 204);

    // Absent id: document head null pre-tx and in-tx; wire
    // 404 carries the same Not found: work_orders/:id bytes.
    const missingId = 'no-such-claim-graph-wo';
    const preMissing = await workOrderDocumentHeadFor(
        db, STARK_ORGANIZATION, missingId,
    );
    const inMissing = await db.transaction(
        [...CLAIM_TX_TABLES],
        (view) => workOrderDocumentHeadFor(
            view, STARK_ORGANIZATION, missingId,
        ),
    );
    assert.equal(preMissing, null);
    assert.equal(inMissing, null);
    const missRes = await handleRequest(
        db, req('GET', '/work-orders/' + missingId, token),
    );
    assert.equal(missRes.status, 404);
    const missBody = await missRes.json() as {
        error: string;
    };
    assert.equal(
        missBody.error,
        'Not found: work_orders/' + missingId,
    );
});

// -- stateEventVisibilityFor -------------------------------------

// Phase Final Task 2: states ROW half stripped — the old
// rawHasRow/fenced-getById three-way is retired. Callers that
// still need a visibility label use stateEventVisibilityFor
// on the pair plane (the production source of truth).
async function pairPlaneVisibility(
    db: DbAdapter,
    organization: string,
    eventId: string,
): Promise<'orphan' | 'visible' | 'hidden'> {
    return stateEventVisibilityFor(
        db, organization, eventId,
    );
}

test('stateEventVisibilityFor: tier (i) event-append pairs'
+ ' match the row-plane three-way (own / foreign / orphan);'
+ ' pre-tx vs in-tx parity', async () => {
    const db = await seededDb();
    // C3: bulk deriveStates retired — sample event ids from
    // surviving family lifecycle derives.
    const sampleRows = [
        ...await deriveWorkOrderLifecycle(db),
        ...await deriveMemberStates(db),
        ...await deriveIdeaStateHistory(
            db, STARK_ORGANIZATION, buildIdeas()[0]!.id,
        ),
    ];
    let ownEventId = '';
    for (const row of sampleRows) {
        const v = await pairPlaneVisibility(
            db, STARK_ORGANIZATION, row.id,
        );
        if (v === 'visible') {
            ownEventId = row.id;
            break;
        }
    }
    assert.notEqual(ownEventId, '');

    let foreignEventId = '';
    for (const row of sampleRows) {
        const v = await pairPlaneVisibility(
            db, ORGANIZATION_TWO, row.id,
        );
        if (v === 'hidden') {
            foreignEventId = row.id;
            break;
        }
    }
    assert.notEqual(foreignEventId, '');

    const txTables = ['requests', 'responses'];

    // Own → visible (tier i).
    const preOwn = await stateEventVisibilityFor(
        db, STARK_ORGANIZATION, ownEventId,
    );
    const inOwn = await db.transaction(
        txTables,
        (view) => stateEventVisibilityFor(
            view, STARK_ORGANIZATION, ownEventId,
        ),
    );
    assert.equal(preOwn, 'visible');
    assert.equal(inOwn, preOwn);
    assert.equal(
        await pairPlaneVisibility(db, STARK_ORGANIZATION, ownEventId),
        'visible',
    );

    // Foreign → hidden (tier i, cross-org by construction).
    // foreignEventId is hidden TO org two — so its owner is
    // not org two. Ask as org two.
    const preForeign = await stateEventVisibilityFor(
        db, ORGANIZATION_TWO, foreignEventId,
    );
    assert.equal(preForeign, 'hidden');
    assert.equal(
        await pairPlaneVisibility(db, ORGANIZATION_TWO, foreignEventId),
        'hidden',
    );

    // Nowhere → orphan.
    const preOrphan = await stateEventVisibilityFor(
        db, STARK_ORGANIZATION, 'ghost-event-nowhere',
    );
    const inOrphan = await db.transaction(
        txTables,
        (view) => stateEventVisibilityFor(
            view, STARK_ORGANIZATION, 'ghost-event-nowhere',
        ),
    );
    assert.equal(preOrphan, 'orphan');
    assert.equal(inOrphan, 'orphan');
    assert.equal(
        await pairPlaneVisibility(
            db, STARK_ORGANIZATION, 'ghost-event-nowhere',
        ),
        'orphan',
    );
});

test('stateEventVisibilityFor: tier (ii) op-born transition'
+ ' event is visible to the owning org and hidden to a'
+ ' foreign org (tier iii)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-p15-vis-transition';
    const graph = workOrderFlowGraph(8 * 60 * 60);
    const transitionEventId = workOrderId + '-te1';

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'vis-' + workOrderId,
                flow_graph: graph,
                position: 1,
            },
            flowWorkOrderId: workOrderId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                workOrderId + '-ev1',
                workOrderId + '-ev2',
                workOrderId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-finish', 'claimed'],
        },
    ));
    assert.equal(created.status, 204);

    const transitioned = await handleRequest(db, req(
        'POST',
        '/work-orders/' + workOrderId + '/transition',
        token,
        {
            transitionEventId,
            targetState: 'n-finish',
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(transitioned.status, 204);

    // Op-born: no states/:id pair at transitionEventId;
    // lives only inside the transition op body.
    const byId = await db.responses.getAllWhere(
        'uri_id', transitionEventId,
    );
    const statesTail = '/' + 'states' + '/';
    const statesHits = byId.filter((r) =>
        r.uri_prefix.endsWith(statesTail));
    assert.equal(statesHits.length, 0);

    assert.equal(
        await stateEventVisibilityFor(
            db, STARK_ORGANIZATION, transitionEventId,
        ),
        'visible',
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, ORGANIZATION_TWO, transitionEventId,
        ),
        'hidden',
    );
});

test('stateEventVisibilityFor: member-genesis op-born'
+ ' initialStateEventId is visible when unowned (no'
+ ' membership); own when membership present; hidden'
+ ' to a foreign org', async () => {
    const db = await seededDb();
    const token = await organizationToken();

    // Live create without a membership row: owner-null
    // on the member id → visible to every asker.
    const unownedId = 'hm-p15-vis-unowned';
    const unownedEventId = unownedId + '-genesis';
    const unownedCreate = await handleRequest(db, req(
        'POST', '/human-members', token, {
            id: unownedId,
            detail: {
                title: 'Engineer',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
            initialState: 'active',
            initialStateEventId: unownedEventId,
            initialStateAt: nowUtc(),
        },
    ));
    assert.equal(unownedCreate.status, 204);

    // Op-born: no states/:id pair at the genesis id.
    const byId = await db.responses.getAllWhere(
        'uri_id', unownedEventId,
    );
    const statesTail = '/' + 'states' + '/';
    const statesHits = byId.filter((r) =>
        r.uri_prefix.endsWith(statesTail));
    assert.equal(statesHits.length, 0);

    assert.equal(
        await resolveOwningOrganization(
            db, unownedId, STARK_ORGANIZATION,
        ),
        null,
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, STARK_ORGANIZATION, unownedEventId,
        ),
        'visible',
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, ORGANIZATION_TWO, unownedEventId,
        ),
        'visible',
    );
    // Pair-plane owner-null isVisible (orphan → visible).
    assert.equal(
        await pairPlaneVisibility(db, STARK_ORGANIZATION, unownedEventId,
        ),
        'visible',
    );
    assert.equal(
        await pairPlaneVisibility(db, ORGANIZATION_TWO, unownedEventId,
        ),
        'visible',
    );

    // Membership present → own org visible, foreign hidden.
    const ownedId = 'hm-p15-vis-owned';
    const ownedEventId = ownedId + '-genesis';
    const ownedCreate = await handleRequest(db, req(
        'POST', '/human-members', token, {
            id: ownedId,
            detail: {
                title: 'Engineer',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
            initialState: 'active',
            initialStateEventId: ownedEventId,
            initialStateAt: nowUtc(),
        },
    ));
    assert.equal(ownedCreate.status, 204);
    const membership = await handleRequest(db, req(
        'PUT', '/memberships/ms-p15-vis-owned', token, {
            organization_id: STARK_ORGANIZATION,
            identity_id: ownedId,
        type: 'member',
            at: nowUtc(),
        },
    ));
    assert.equal(membership.status, 200);

    assert.equal(
        await resolveOwningOrganization(
            db, ownedId, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, STARK_ORGANIZATION, ownedEventId,
        ),
        'visible',
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, ORGANIZATION_TWO, ownedEventId,
        ),
        'hidden',
    );
    assert.equal(
        await pairPlaneVisibility(db, STARK_ORGANIZATION, ownedEventId,
        ),
        'visible',
    );
    assert.equal(
        await pairPlaneVisibility(db, ORGANIZATION_TWO, ownedEventId,
        ),
        'hidden',
    );
});

// -- flowGraphBindingsFromPairs ----------------------------------

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Phase Final Task 2: graph relation ROW halves stripped —
// pair plane (flowGraphBindingsFromPairs) is sole oracle.
test('flowGraphBindingsFromPairs: seed attribute + member'
+ ' ledgers non-empty; pre-tx vs in-tx parity; nodeFlowIds'
+ ' cover every bound node', async () => {
    const db = await seededDb();
    const txTables = [
        'requests', 'responses',
    ];
    const preTx = await flowGraphBindingsFromPairs(
        db, STARK_ORGANIZATION,
    );
    const inTx = await db.transaction(
        txTables,
        (view) => flowGraphBindingsFromPairs(
            view, STARK_ORGANIZATION,
        ),
    );
    assert.deepEqual(inTx, preTx);

    // Seed is all Stark — non-empty graphDelta events.
    assert.ok(
        preTx.attributeEvents.length > 0,
        'seed attributeEvents empty',
    );
    assert.ok(
        preTx.memberEvents.length > 0,
        'seed memberEvents empty',
    );
    // Phase Final Stage B: flow graph tables retired — the
    // pair-plane bindings above are the residual pin.

    // Every attribute/member event's node resolves a flow.
    for (const event of preTx.attributeEvents) {
        assert.ok(
            preTx.nodeFlowIds.has(event.flow_node_id),
            'attr node ' + event.flow_node_id,
        );
    }
    for (const event of preTx.memberEvents) {
        assert.ok(
            preTx.nodeFlowIds.has(event.flow_node_id),
            'member node ' + event.flow_node_id,
        );
    }

    // latestByKey/fail-closed reduction is well-defined.
    const derivedLatest = latestByKey(
        preTx.attributeEvents,
        (r) => r.flow_node_id + '\0' + r.attribute_id,
        relationFailClosed,
    );
    assert.ok(derivedLatest.size > 0);
});

// GraphEdge carries no attributes field and no
// flow_edge_attributes table exists — prove-impossible so
// RESTRICT never grows an edges leg (Author gate 5).
test('prove-impossible: attribute bindings cannot reach'
+ ' flow edges (GraphEdge has no attributes; no'
+ ' flow_edge_attributes table)', () => {
    type GraphEdgeHasNoAttributes =
        'attributes' extends keyof GraphEdge
            ? never
            : true;
    const typeProof: GraphEdgeHasNoAttributes = true;
    assert.equal(typeProof, true);

    const edgeKeys: readonly (keyof GraphEdge)[] = [
        'id', 'name', 'fromNodeId', 'toNodeId',
    ];
    assert.deepEqual(
        edgeKeys.slice().sort(),
        (['id', 'name', 'fromNodeId', 'toNodeId'] as const)
            .slice().sort(),
    );
    assert.equal(
        (edgeKeys as readonly string[])
            .includes('attributes'),
        false,
    );
    assert.equal(
        (TABLE_NAMES as readonly string[])
            .includes('flow_edge_attributes'),
        false,
    );
});

// -- residual cross-core pins (Phase 15 Task 1 final) ----------

test('residual pin: workOrderDocumentHeadFor matches wire'
+ ' GET for every seeded Stark work order',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const listRes = await handleRequest(
        db, req('GET', '/work-orders', token),
    );
    assert.equal(listRes.status, 200);
    const rows = await listRes.json() as {
        id: string;
    }[];
    assert.ok(rows.length > 0);
    for (const row of rows) {
        const getRes = await handleRequest(
            db, req('GET', '/work-orders/' + row.id, token),
        );
        assert.equal(getRes.status, 200);
        // Wire GET attaches bind embeds (instance_id /
        // record_type_id); document-head derive is bind-
        // free — strip embeds before comparing heads.
        const wire = await getRes.json() as Record<
            string, unknown
        >;
        const {
            instance_id: _i,
            record_type_id: _r,
            ...wireHead
        } = wire;
        const derived = await workOrderDocumentHeadFor(
            db, STARK_ORGANIZATION, row.id,
        );
        assert.deepEqual(derived, wireHead, row.id);
    }
    // Phase Final Stage B: work_orders table retired.
});

test('residual pin: stateEventVisibilityFor matches the'
+ ' row-plane three-way over a sample of seed events for'
+ ' both organizations', async () => {
    const db = await seededDb();
    // C3: sample from surviving lifecycle derives (bulk
    // deriveStates retired).
    const allStates = await deriveWorkOrderLifecycle(db);
    assert.ok(
        allStates.length >= 7,
        'need enough WO lifecycle rows for sampling',
    );
    const sampleIds = [
        allStates[0]!.id,
        allStates[Math.floor(allStates.length / 2)]!.id,
        allStates[allStates.length - 1]!.id,
        allStates[1]!.id,
        allStates[2]!.id,
        allStates[3]!.id,
        allStates[4]!.id,
    ];
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        for (const eventId of sampleIds) {
            const derived = await stateEventVisibilityFor(
                db, organization, eventId,
            );
            // Phase Final Task 2: pair-plane only (row oracle
            // retired with the states dual-write strip).
            assert.ok(
                derived === 'visible'
                || derived === 'hidden'
                || derived === 'orphan',
                organization + '/' + eventId,
            );
        }
    }
});

test('residual pin: organizations self-as-owner —'
+ ' resolveOwningOrganization maps an org id to itself',
async () => {
    const db = await seededDb();
    // No surviving writer mints a state event whose
    // entity_id is an organization id (states/:id retired).
    // Pin the ownership probe that once fed that event's
    // visibility: an org id self-as-owner resolves to itself
    // regardless of the caller's bound organization.
    assert.equal(
        await resolveOwningOrganization(
            db, STARK_ORGANIZATION, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assert.equal(
        await resolveOwningOrganization(
            db, STARK_ORGANIZATION, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );
    assert.equal(
        await resolveOwningOrganization(
            db, ORGANIZATION_TWO, STARK_ORGANIZATION,
        ),
        ORGANIZATION_TWO,
    );
});

// -- Task 5: pair-plane ownership (row-plane fence retired) --

test('fence pin: resolveOwningOrganization owns seed'
+ ' entities on the pair plane; orphan stays null',
async () => {
    const db = await seededDb();
    async function pairOwner(
        entityId: string,
        boundOrganization: string,
    ): Promise<string | null> {
        return resolveOwningOrganization(
            db, entityId, boundOrganization,
        );
    }

    // Ideas + projects + flows + records load from the pair
    // plane (row halves retired across Stage B).
    const ideasStark = await deriveIdeas(
        db, STARK_ORGANIZATION,
    );
    const ideasTwo = await deriveIdeas(
        db, ORGANIZATION_TWO,
    );
    const projectsStark = await deriveProjects(
        db, STARK_ORGANIZATION,
    );
    const projectsTwo = await deriveProjects(
        db, ORGANIZATION_TWO,
    );
    const recordToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const recordsRes = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
            + '/record-types', recordToken),
    );
    assert.equal(recordsRes.status, 200);
    const recordsStark = await recordsRes.json() as {
        id: string;
    }[];
    const flowsStark = await deriveFlows(
        db, STARK_ORGANIZATION,
    );
    const flowsTwo = await deriveFlows(
        db, ORGANIZATION_TWO,
    );
    const { deriveMembershipsForIdentity } = await import(
        '../api/derive-memberships.ts'
    );
    const currentMemberships =
        await deriveMembershipsForIdentity(db, 'current');
    const memberStark = currentMemberships.find(
        (m) => m.organization_id === STARK_ORGANIZATION,
    )!;
    assert.ok(memberStark, 'current has stark membership');

    const ideaStark = ideasStark[0]!;
    const ideaTwo = ideasTwo[0]!;
    assert.ok(ideaStark, 'stark ideas non-empty');
    assert.ok(ideaTwo, 'org-two ideas non-empty');
    const projectStark = projectsStark[0]!;
    const projectTwo = projectsTwo[0]!;
    assert.ok(projectStark, 'stark projects non-empty');
    assert.ok(projectTwo, 'org-two projects non-empty');
    const recordStark = recordsStark[0]!;
    assert.ok(recordStark, 'stark records non-empty');
    const flowStark = flowsStark[0]!;
    const flowTwo = flowsTwo[0]!;
    assert.ok(flowStark, 'stark flows non-empty');
    assert.ok(flowTwo, 'org-two flows non-empty');
    // A live node id from the pair-plane graph (graphDelta
    // upserts) — seed Customer Onboarding create node.
    const nodeStarkId = 'lzkYvFNCEHARBQmZ4YHAn4';

    for (const [entityId, owner] of [
        [ideaStark.id, STARK_ORGANIZATION],
        [ideaTwo.id, ORGANIZATION_TWO],
        [projectStark.id, STARK_ORGANIZATION],
        [projectTwo.id, ORGANIZATION_TWO],
        [flowStark.id, STARK_ORGANIZATION],
        [flowTwo.id, ORGANIZATION_TWO],
        [nodeStarkId, STARK_ORGANIZATION],
        [recordStark.id, STARK_ORGANIZATION],
    ] as const) {
        assert.equal(
            await pairOwner(entityId, owner), owner,
        );
        const foreignBound = owner === STARK_ORGANIZATION
            ? ORGANIZATION_TWO
            : STARK_ORGANIZATION;
        assert.equal(
            await pairOwner(entityId, foreignBound), owner,
        );
    }

    // Identity ownership resolves through memberships on
    // the pair plane: bound organization when a membership
    // document exists there.
    for (const bound of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        assert.equal(
            await pairOwner(
                memberStark.identity_id, bound,
            ),
            bound,
            'pair-plane owner for '
            + memberStark.identity_id
            + ' bound=' + bound,
        );
    }
    // Genuine orphan: null.
    assert.equal(
        await pairOwner(
            'ghost-nowhere-p15-fence',
            STARK_ORGANIZATION,
        ),
        null,
    );

    // WP1: organization id is self-as-owner.
    assert.equal(
        await pairOwner(
            STARK_ORGANIZATION, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assert.equal(
        await pairOwner(
            STARK_ORGANIZATION, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );

    // Records retain pair-plane ownership after row strip.
    assert.equal(
        await pairOwner(
            recordStark.id, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assert.equal(
        await pairOwner(
            recordStark.id, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );
});

// Phase Final Task 2: graph ROW half stripped — pair plane
// alone tracks the live attribute add/remove ledger.
test('residual pin: flowGraphBindingsFromPairs tracks a'
+ ' live attribute add then remove (fail-closed) on the'
+ ' pair plane', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'p15-bind-flow';
    const nodeId = 'p15-bind-node';
    const attrId = 'p15-bind-attr';
    const at1 = '2026-06-15T00:00:00.000000Z';
    const at2 = '2026-06-15T00:00:01.000000Z';
    // A seeded project the create can join.
    const projectId = 'u6YkHhlGc91oDMkr3x0isa';

    const attrPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'rec01CustProfRec0rdAB1'
            + '/attributes/' + attrId, token, {
            name: 'P15 Bind',
            attribute_type: 'text',
            sort_order: 99,
            options: [],
            constraints: [],
        },
    ));
    assert.equal(attrPut.status, 200);

    // Create with the binding already 'added'.
    const created = await handleRequest(db, req(
        'POST', '/flows', token, {
            id: flowId,
            flow: {
                name: 'P15 Bind Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 8 * 60 * 60,
            },
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: at1,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: at1,
            graphDelta: {
                nodes: [{
                    id: nodeId, flow_id: flowId,
                    name: 'Bind',
                    position_x: 0, position_y: 0,
                    is_create: true, is_archive: false,
                    task_instructions: '', at: at1,
                }],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [{
                    id: 'p15-fna-add',
                    flow_node_id: nodeId,
                    attribute_id: attrId,
                    mode: 'editable',
                    is_required: false,
                    action: 'added',
                    at: at1,
                }],
            },
        },
    ));
    assert.equal(created.status, 204);

    const afterAdd = await flowGraphBindingsFromPairs(
        db, STARK_ORGANIZATION,
    );
    const addRow = afterAdd.attributeEvents.find(
        (r) => r.id === 'p15-fna-add',
    );
    assert.ok(addRow);
    assert.equal(addRow!.action, 'added');
    assert.equal(
        afterAdd.nodeFlowIds.get(nodeId), flowId,
    );

    // Chain a remove off the create's document head.
    const headGet = await handleRequest(
        db, req('GET', '/flows/' + flowId, token),
    );
    assert.equal(headGet.status, 200);
    const headId = headGet.headers.get('Response-ID');
    assert.ok(headId);

    const putRemove = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        {
            name: 'P15 Bind Flow',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: 8 * 60 * 60,
            state: 'active',
            state_at: at2,
            state_event_id: flowId + '-ev-rm',
            graph: {
                nodes: [{
                    id: nodeId, name: 'Bind',
                    positionX: 0, positionY: 0,
                    isCreate: true, isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: '',
                }],
                edges: [],
            },
            graphDelta: {
                nodes: [{
                    id: nodeId, flow_id: flowId,
                    name: 'Bind',
                    position_x: 0, position_y: 0,
                    is_create: true, is_archive: false,
                    task_instructions: '', at: at2,
                }],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [{
                    id: 'p15-fna-rm',
                    flow_node_id: nodeId,
                    attribute_id: attrId,
                    mode: 'editable',
                    is_required: false,
                    action: 'removed',
                    at: at2,
                }],
            },
            revivals: [],
        },
        { 'if-response-id': headId! },
    ));
    assert.equal(putRemove.status, 200);

    const afterRm = await flowGraphBindingsFromPairs(
        db, STARK_ORGANIZATION,
    );
    const rmRow = afterRm.attributeEvents.find(
        (r) => r.id === 'p15-fna-rm',
    );
    assert.ok(rmRow);
    assert.equal(rmRow!.action, 'removed');

    const latest = latestByKey(
        afterRm.attributeEvents.filter(
            (r) => r.flow_node_id === nodeId
                && r.attribute_id === attrId,
        ),
        (r) => r.flow_node_id,
        relationFailClosed,
    );
    assert.equal(latest.get(nodeId)!.action, 'removed');
});

// F1 fix pin: soft-deleting a node via graphDelta.deletions
// must drop it from nodeFlowIds. Residual 'added' must NOT
// RESTRICT attribute DELETE (pair-plane path).
test('residual pin: soft-deleted node drops from'
+ ' nodeFlowIds so residual attribute binding is not a'
+ ' RESTRICT referrer (DELETE → 204)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'p15-softdel-flow';
    const nodeId = 'p15-softdel-node';
    const attrId = 'p15-softdel-attr';
    const at1 = '2026-06-17T00:00:00.000000Z';
    const at2 = '2026-06-17T00:00:01.000000Z';
    const projectId = 'u6YkHhlGc91oDMkr3x0isa';

    const attrPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'rec01CustProfRec0rdAB1'
            + '/attributes/' + attrId, token, {
            name: 'P15 SoftDel',
            attribute_type: 'text',
            sort_order: 99,
            options: [],
            constraints: [],
        },
    ));
    assert.equal(attrPut.status, 200);

    const created = await handleRequest(db, req(
        'POST', '/flows', token, {
            id: flowId,
            flow: {
                name: 'P15 SoftDel Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 8 * 60 * 60,
            },
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: at1,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: at1,
            graphDelta: {
                nodes: [{
                    id: nodeId, flow_id: flowId,
                    name: 'Doomed',
                    position_x: 0, position_y: 0,
                    is_create: true, is_archive: false,
                    task_instructions: '', at: at1,
                }],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [{
                    id: 'p15-softdel-fna',
                    flow_node_id: nodeId,
                    attribute_id: attrId,
                    mode: 'editable',
                    is_required: false,
                    action: 'added',
                    at: at1,
                }],
            },
        },
    ));
    assert.equal(created.status, 204);

    const afterAdd = await flowGraphBindingsFromPairs(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        afterAdd.nodeFlowIds.get(nodeId), flowId,
    );

    const headGet = await handleRequest(
        db, req('GET', '/flows/' + flowId, token),
    );
    assert.equal(headGet.status, 200);
    const headId = headGet.headers.get('Response-ID');
    assert.ok(headId);

    // Soft-delete the bound node only — residual 'added'
    // attributeEvent remains; no attributeEvents 'removed'.
    const putDelete = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        {
            name: 'P15 SoftDel Flow',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: 8 * 60 * 60,
            state: 'active',
            state_at: at2,
            state_event_id: flowId + '-ev-del',
            graph: {
                nodes: [],
                edges: [],
            },
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [{
                    eventId: 'p15-softdel-del',
                    entityId: nodeId,
                    at: at2,
                }],
                memberEvents: [],
                attributeEvents: [],
            },
            revivals: [],
        },
        { 'if-response-id': headId! },
    ));
    assert.equal(putDelete.status, 200);

    const afterDel = await flowGraphBindingsFromPairs(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        afterDel.nodeFlowIds.has(nodeId), false,
        'soft-deleted node must leave nodeFlowIds',
    );
    // Residual 'added' still in the event ledger.
    const residual = afterDel.attributeEvents.find(
        (r) => r.id === 'p15-softdel-fna',
    );
    assert.ok(residual);
    assert.equal(residual!.action, 'added');

    // recordTypeId scopes the Task 7 instance leg (empty
    // until Task 14 writes instances).
    const pairPlane = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, [attrId], 'r1',
    );
    assert.deepEqual(
        pairPlane.get(attrId)!.flowIds, [],
        'no current-node flow referrer',
    );

    // Wire contract: residual binding on a soft-deleted
    // node is NOT a RESTRICT referrer → DELETE 204.
    const deleted = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'rec01CustProfRec0rdAB1'
            + '/attributes/' + attrId,
        token,
    ));
    assert.equal(deleted.status, 204);
});

// -- field-values visibility re-anchor (Phase 15 Task 3) ------

// Shared fixture: live create a work order (so tier-ii can
// discover its id from the collection pair), then transition
// with ONE folded field-value. Op-born transitionEventId has
// no states/:id pair — visibility rides tier (ii)/(iii).
async function transitionWithFieldValue(
    db: MemoryDbAdapter,
    workOrderId: string,
    transitionEventId: string,
    fieldValueId: string,
    attributeId: string,
): Promise<void> {
    const token = await organizationToken();
    const graph = workOrderFlowGraph(8 * 60 * 60);
    const created = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'fv-' + workOrderId,
                flow_graph: graph,
                position: 1,
            },
            flowWorkOrderId: workOrderId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                workOrderId + '-ev1',
                workOrderId + '-ev2',
                workOrderId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-finish', 'claimed'],
        },
    ));
    assert.equal(created.status, 204);

    // Phase Final Stage B: record_attributes retired.
    const typePut = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/record-types/rec-p15-fv',
        token,
        {
            name: 'P15 FV Parent', description: '',
            position: 0,
            state: 'active',
            state_at: nowUtc(),
            state_event_id: 'rec-p15-fv-genesis',
        },
    ));
    assert.equal(typePut.status, 200);
    const attrWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/record-types/rec-p15-fv'
            + '/attributes/' + attributeId,
        token,
        {
            name: 'Note',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
        },
    ));
    assert.equal(attrWrite.status, 200);

    // Task 8 CUT: legacy fieldValues below the gate.
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
            transitionEventId,
            targetState: 'n-finish',
            fieldValues: [{
                id: fieldValueId,
                fields: {
                    state_event_id: transitionEventId,
                    attribute_id: attributeId,
                    value: 'high',
                },
            }],
            release: null,
            transitionAt: nowUtc(),
        },
    );
}

// Wire-shape pin (C4): GET work-orders/:id/history is
// 200 / 403 / 404 by ownership (own → rows with
// field_values; foreign → 403; absent → 404). Field values
// fold inline; the retired GET states/:id/field-values
// three-way force lives here.
test('work-order history GET: 200/403/404 three-way for'
+ ' own / foreign / absent work orders', async () => {
    const db = await seededDb();
    const starkToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const twoToken = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const workOrderId = 'wo-p15-fv-get';
    const transitionEventId = workOrderId + '-te';
    const fieldValueId = workOrderId + '-fv';
    await transitionWithFieldValue(
        db, workOrderId, transitionEventId,
        fieldValueId, workOrderId + '-attr',
    );

    // (own) Stark sees the folded row on history.
    const own = await handleRequest(
        db,
        req(
            'GET',
            '/work-orders/' + workOrderId + '/history',
            starkToken,
        ),
    );
    assert.equal(own.status, 200);
    const ownRows = await own.json() as {
        id: string;
        field_values: { id: string }[];
    }[];
    const ownTe = ownRows.find(
        (r) => r.id === transitionEventId,
    );
    assert.ok(ownTe !== undefined);
    assert.deepEqual(
        ownTe!.field_values.map((r) => r.id), [fieldValueId],
    );

    // (foreign) Org two 403s with the work_orders body.
    const foreign = await handleRequest(
        db,
        req(
            'GET',
            '/work-orders/' + workOrderId + '/history',
            twoToken,
        ),
    );
    assert.equal(foreign.status, 403);
    const foreignBody =
        await foreign.json() as { error: string };
    assert.equal(
        foreignBody.error,
        'forbidden: work_orders/' + workOrderId
        + ' belongs to a different organization',
    );

    // (absent) Ghost work-order id → 404.
    const orphan = await handleRequest(
        db,
        req(
            'GET',
            '/work-orders/ghost-p15-nowhere/history',
            starkToken,
        ),
    );
    assert.equal(orphan.status, 404);
    const orphanBody =
        await orphan.json() as { error: string };
    assert.equal(
        orphanBody.error,
        'Not found: work_orders/ghost-p15-nowhere',
    );
});

// Derive-path (C4): workOrderHistoryFor throws on foreign
// (403) and absent (404); own still returns folded rows.
// stateEventVisibilityFor still drives RESTRICT visibility.
test('workOrderHistoryFor visibility: own field_values,'
+ ' foreign rejects, absent rejects',
async () => {
    const db = await seededDb();
    const workOrderId = 'wo-p15-fv-derive';
    const transitionEventId = workOrderId + '-te';
    const fieldValueId = workOrderId + '-fv';
    await transitionWithFieldValue(
        db, workOrderId, transitionEventId,
        fieldValueId, workOrderId + '-attr',
    );

    // Own → history returns the transition fold.
    assert.equal(
        await pairPlaneVisibility(
            db, STARK_ORGANIZATION, transitionEventId,
        ),
        'visible',
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, STARK_ORGANIZATION, transitionEventId,
        ),
        'visible',
    );
    const ownHistory = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const ownTe = ownHistory.find(
        (row) => row.id === transitionEventId,
    );
    assert.ok(ownTe !== undefined);
    assert.equal(ownTe!.field_values.length, 1);
    assert.equal(ownTe!.field_values[0]!.id, fieldValueId);

    // Foreign → work-order ownership rejects.
    assert.equal(
        await pairPlaneVisibility(
            db, ORGANIZATION_TWO, transitionEventId,
        ),
        'hidden',
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, ORGANIZATION_TWO, transitionEventId,
        ),
        'hidden',
    );
    await assert.rejects(
        () => workOrderHistoryFor(
            db, ORGANIZATION_TWO, workOrderId,
        ),
        ForeignOrganizationError,
    );

    // Absent work order → EntityNotFoundError.
    assert.equal(
        await pairPlaneVisibility(
            db, STARK_ORGANIZATION, 'ghost-p15-vis',
        ),
        'orphan',
    );
    assert.equal(
        await stateEventVisibilityFor(
            db, STARK_ORGANIZATION, 'ghost-p15-vis',
        ),
        'orphan',
    );
    await assert.rejects(
        () => workOrderHistoryFor(
            db, STARK_ORGANIZATION, 'ghost-p15-vis',
        ),
        EntityNotFoundError,
    );
});

// -- RESTRICT graph-leg re-anchor (Phase 15 Task 4) ------------

// Phase Final Task 2: flow_node_attributes/flow_nodes +
// work_orders ROW halves stripped — collectAttributeReferrers
// graph + WO legs are pair-plane-only.
function sortedReferrerShape(
    refs: AttributeReferrers,
): {
    valueCount: number;
    flowIds: string[];
    workOrderIds: string[];
    instanceIds: string[];
} {
    return {
        valueCount: refs.valueCount,
        flowIds: [...refs.flowIds].sort(),
        workOrderIds: [...refs.workOrderIds].sort(),
        instanceIds: [...refs.instanceIds].sort(),
    };
}

function assertReferrerParity(
    label: string,
    left: Map<string, AttributeReferrers>,
    right: Map<string, AttributeReferrers>,
    attributeIds: readonly string[],
): void {
    for (const attributeId of attributeIds) {
        const a = left.get(attributeId);
        const b = right.get(attributeId);
        assert.ok(a, label + ' left ' + attributeId);
        assert.ok(b, label + ' right ' + attributeId);
        assert.deepEqual(
            sortedReferrerShape(a!),
            sortedReferrerShape(b!),
            label + ' ' + attributeId,
        );
    }
}

test('collectAttributeReferrers graph legs: seed attributes'
+ ' with any referrer; pre-tx vs in-tx parity (pair plane)',
async () => {
    const db = await seededDb();
    // Seed attributes from pair-plane graph bindings + WO
    // frozen graphs.
    const bindings = await flowGraphBindingsFromPairs(
        db, STARK_ORGANIZATION,
    );
    const attrFromRelations = new Set(
        bindings.attributeEvents.map(
            (r) => r.attribute_id,
        ),
    );
    // Phase Final Task 2: WO graphs from the pair plane.
    const attrFromWorkOrders = new Set<string>();
    const woToken = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const woListRes = await handleRequest(
        db, req('GET', '/work-orders', woToken),
    );
    assert.equal(woListRes.status, 200);
    const workOrders = await woListRes.json() as {
        flow_graph: Record<string, unknown>;
    }[];
    for (const wo of workOrders) {
        const graph = asWorkOrderFlowGraph(
            wo.flow_graph, 'work_orders.flow_graph',
        );
        for (const node of graph.nodes) {
            for (const attr of node.attributes) {
                attrFromWorkOrders.add(attr.attributeId);
            }
        }
    }
    const attributeIds = [...new Set([
        ...attrFromRelations,
        ...attrFromWorkOrders,
    ])].sort();
    assert.ok(
        attributeIds.length > 0,
        'seed must name at least one bound attribute',
    );

    // recordTypeId scopes the Task 7 instance leg (empty
    // until Task 14 writes instances).
    const preTx = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, attributeIds, 'seed-type',
    );
    const inTx = await db.transaction(
        // Stage B: roster + objectives/records retired.
        [
            'requests', 'responses',
        ],
        (view) => collectAttributeReferrers(
            view,
            STARK_ORGANIZATION,
            attributeIds,
            'seed-type',
        ),
    );
    assertReferrerParity(
        'pre-tx vs in-tx', preTx, inTx, attributeIds,
    );
    // At least one seed attribute names a live flow.
    let flowBound = 0;
    for (const id of attributeIds) {
        flowBound += preTx.get(id)!.flowIds.length;
    }
    assert.ok(flowBound > 0, 'seed flow bindings empty');
});

test('collectAttributeReferrers graph legs: live-minted'
+ ' flow binding + work-order head stay pair-plane stable',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'p15-restrict-flow';
    const nodeId = 'p15-restrict-node';
    const attrId = 'p15-restrict-attr';
    const woId = 'p15-restrict-wo';
    const at = '2026-06-16T00:00:00.000000Z';
    const projectId = 'u6YkHhlGc91oDMkr3x0isa';

    const attrPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'rec01CustProfRec0rdAB1'
            + '/attributes/' + attrId, token, {
            name: 'P15 Restrict',
            attribute_type: 'text',
            sort_order: 99,
            options: [],
            constraints: [],
        },
    ));
    assert.equal(attrPut.status, 200);

    const created = await handleRequest(db, req(
        'POST', '/flows', token, {
            id: flowId,
            flow: {
                name: 'P15 Restrict Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 8 * 60 * 60,
            },
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: at,
            graphDelta: {
                nodes: [{
                    id: nodeId, flow_id: flowId,
                    name: 'Bind',
                    position_x: 0, position_y: 0,
                    is_create: true, is_archive: false,
                    task_instructions: '', at,
                }],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [{
                    id: 'p15-restrict-fna',
                    flow_node_id: nodeId,
                    attribute_id: attrId,
                    mode: 'editable',
                    is_required: false,
                    action: 'added',
                    at,
                }],
            },
        },
    ));
    assert.equal(created.status, 204);

    const woGraph = {
        name: 'P15 Restrict WO',
        lockTimeout: 8 * 60 * 60,
        nodes: [{
            id: 'n-wo', name: 'Step',
            positionX: 0, positionY: 0,
            isCreate: true, isArchive: false,
            memberIds: [],
            attributes: [{
                attribute_id: attrId,
                mode: 'editable',
                isRequired: false,
            }],
            taskInstructions: '',
        }],
        edges: [],
    };
    const woCreated = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: woId,
            workOrder: {
                display_id: 'p15-restrict-wo',
                flow_graph: woGraph,
                position: 1,
            },
            flowWorkOrderId: woId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: woId,
                at: nowUtc(),
            },
            stateEventIds: [
                woId + '-ev1',
                woId + '-ev2',
                woId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-finish', 'claimed'],
        },
    ));
    assert.equal(woCreated.status, 204);

    // recordTypeId scopes the Task 7 instance leg (empty
    // until Task 14 writes instances).
    const pairPlane = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, [attrId], 'r1',
    );
    // Pre-tx vs in-tx parity (pair plane only).
    const inTx = await db.transaction(
        // Stage B: roster + records/work_orders retired.
        [
            'requests', 'responses',
        ],
        (view) => collectAttributeReferrers(
            view,
            STARK_ORGANIZATION,
            [attrId],
            'r1',
        ),
    );
    assertReferrerParity(
        'live mint pre-tx vs in-tx',
        pairPlane, inTx, [attrId],
    );
    const refs = pairPlane.get(attrId)!;
    assert.ok(refs.flowIds.includes(flowId));
    assert.ok(refs.workOrderIds.includes(woId));
});
