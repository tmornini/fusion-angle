import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
    TABLE_NAMES,
} from '../api/db.ts';
import { nowUtc } from '../shared/types.ts';
import {
    workOrderHeadFor,
    workOrderHistoryFor,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import {
    appendLegacyTransition,
} from './legacy-transition-fixture.ts';
import {
    flowGraphBindingsFromMessagePairs,
    deriveFlows,
} from '../api/derive-flows.ts';
import {
    relationFailClosed,
} from '../api/flow-graph-relations.ts';
import { latestByKey } from
    '../shared/ledger-reduction.ts';
import type {
    GraphEdge,
} from '../shared/types.ts';
import {
    collectAttributeReferrers,
    type AttributeReferrers,
} from '../api/record-attribute-refs.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { membershipOf, membershipsOfIdentity } from
    '../api/memberships.ts';
import { organizationToken } from './token-fixtures.ts';
import { landMembership } from
    './membership-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { asWorkOrderFlowGraph } from '../shared/flow-graph-body.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    pairIdOf,
    partBodiesOf,
} from './http-fixtures.ts';
import {
    documentCollectionGetHandler,
    documentFamilyWiring,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
// This file reaches routes.ts only through mock-seed.ts;
// import it directly for the family-wiring registration
// side effect getCollection below depends on.
import '../api/routes.ts';

const N_START = generateIdentifier();
const N_FINISH = generateIdentifier();
const NO_SUCH_CLAIM_GRAPH_WO = generateIdentifier();
const GHOST_NOWHERE_P15_FENCE = generateIdentifier();
const P15_FNA_ADD = generateIdentifier();
const P15_FNA_RM = generateIdentifier();
const P15_SOFTDEL_FNA = generateIdentifier();
const P15_SOFTDEL_DEL = generateIdentifier();
const GHOST_P15_VIS = generateIdentifier();
const P15_RESTRICT_FNA = generateIdentifier();
const N_WO = generateIdentifier();
const P15_RESTRICT_WO = generateIdentifier();
const WORKORDERID_FWO = generateIdentifier();
const WORKORDERID_EV1 = generateIdentifier();
const WORKORDERID_EV2 = generateIdentifier();
const WORKORDERID_EV3 = generateIdentifier();
const FLOWID_EV_RM = generateIdentifier();
const FLOWID_EV_DEL = generateIdentifier();
const WORKORDERID_TE = generateIdentifier();
const WORKORDERID_FV = generateIdentifier();
const WORKORDERID_ATTR = generateIdentifier();
const WOID_FWO = generateIdentifier();
const WOID_EV1 = generateIdentifier();
const WOID_EV2 = generateIdentifier();
const WOID_EV3 = generateIdentifier();

// Phase 15: view-safe derive cores (Task 1) + claim-gate
// graph re-anchor pins (Task 2) + field-values visibility
// re-anchor pins (Task 3) + RESTRICT graph-leg re-anchor
// pins (Task 4) + pre-dispatch fence re-anchor parity
// (Task 5). Pre-tx-vs-in-tx parity and residual drift
// against the dual-write row plane.

// The work order's head version, as the ops read it.
async function headVersionOf(
    db: DbAdapter,
    workOrderId: string,
): Promise<Record<string, unknown> | null> {
    const head = await workOrderHeadFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    return head === null ? null : { ...head.version };
}

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

const READER = 'XXZruirZyAOoRpNxaDnpSA';

function wiringOf(family: string): DocumentFamilyWiring {
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) {
        throw new Error('no wiring registered for ' + family);
    }
    return wiring;
}

async function getCollection(
    db: MemoryDbAdapter, family: string, organization: string,
): Promise<{ id: string; state: string }[]> {
    const rows = await documentCollectionGetHandler(
        wiringOf(family),
    )(db, [organization], READER, organization, []);
    return rows as { id: string; state: string }[];
}

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Phase15 Head Fixture Flow',
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
                fromNodeId: N_START,
                toNodeId: N_FINISH,
            },
        ],
    };
}

const EMPTY_FLOW_ID = 'GgfDbXOJUvvaCekCTcvhuw';

// -- workOrderHeadFor --------------------------------------------

// Phase Final Task 2: work_orders ROW half stripped — wire +
// message-plane head are the oracles (row plane empty).
Deno.test('workOrderHeadFor: wire GET equals head for a'
+ ' live create; null for absent; pre-tx vs in-tx parity',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'p15-' + workOrderId,
                flow_graph: graph,
                position: 7,
            },
            flowWorkOrderId: WORKORDERID_FWO,
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                WORKORDERID_EV1,
                WORKORDERID_EV2,
                WORKORDERID_EV3,
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: [N_START, N_FINISH, 'claimed'],
        },
    ));
    assertStrictEquals(created.status, 201);

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token),
    );
    assertStrictEquals(getRes.status, 200);
    const wire = await getRes.json();
    const preTx = await headVersionOf(db, workOrderId);
    const inTx = await db.readTransaction(
        (view) => headVersionOf(view, workOrderId),
    );
    assertEquals(preTx, inTx);
    assertEquals(preTx, wire);
    // Phase Final Stage B: work_orders table retired.

    // Absent id: message plane returns null (Task 2 maps to the
    // same EntityNotFoundError bytes as workOrders.getById).
    const preTxMissing = await headVersionOf(db, 'oYnbiWXzroVnyolOhmkBIQ');
    const inTxMissing = await db.readTransaction(
        (view) => headVersionOf(view, 'oYnbiWXzroVnyolOhmkBIQ'),
    );
    assertStrictEquals(preTxMissing, null);
    assertStrictEquals(inTxMissing, null);
    const missRes = await handleRequest(
        db,
        req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'oYnbiWXzroVnyolOhmkBIQ', token),
    );
    assertStrictEquals(missRes.status, 404);
});

Deno.test('workOrderHeadFor: tracks a later document PUT'
+ ' (head, not create-time body) on wire + message plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph1 = workOrderFlowGraph(4 * 60 * 60);
    const graph2 = workOrderFlowGraph(12 * 60 * 60);

    const put1 = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'before',
            flow_graph: graph1,
            position: 1,
        },
        { 'If-None-Match': '*' },
    ));
    assertStrictEquals(put1.status, 201);
    await put1.body?.cancel();

    const put2 = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'after',
            flow_graph: graph2,
            position: 3,
        },
        { 'If-Match': put1.headers.get('ETag')! },
    ));
    assertStrictEquals(put2.status, 200);
    await put2.body?.cancel();

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token),
    );
    assertStrictEquals(getRes.status, 200);
    const wire = await getRes.json() as {
        display_id: string;
        position: number;
    };
    const derived = await headVersionOf(db, workOrderId);
    assertEquals(derived, wire);
    assertStrictEquals(derived!['display_id'], 'after');
    assertStrictEquals(derived!['position'], 3);
});

// -- claim graph parity (Phase 15 Task 2) ------------------------

// Phase Final Task 2: claim graph is message-plane only.
// Seed via PUT (document message pair, no birth claim) so the live
// claim is a real append, not an idempotent re-claim.
Deno.test('claim graph: pre-tx vs in-tx flow_graph parity and'
+ ' claim-outcome on the message plane',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const lockTimeoutSeconds = 8 * 60 * 60;
    const graph = workOrderFlowGraph(lockTimeoutSeconds);

    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'p15-cg-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
        { 'If-None-Match': '*' },
    ));
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();

    const preTx = await headVersionOf(db, workOrderId);
    const inTx = await db.readTransaction(
        (view) => headVersionOf(view, workOrderId),
    );
    assertEquals(preTx, inTx);
    assertEquals(preTx!['flow_graph'], graph);

    const headGraph = asWorkOrderFlowGraph(
        preTx!['flow_graph'], 'work_orders.flow_graph',
    );
    assertStrictEquals(headGraph.lockTimeout, lockTimeoutSeconds);

    // Fresh PUT: the head carries no claim.
    assertStrictEquals(Object.hasOwn(preTx!, 'claim'), false);

    // Live path: claim against the re-anchored gate succeeds.
    const claimResponse = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/claim',
        token, {
            claimEventId: generateIdentifier(),
            claimAt: nowUtc(),
            expireEventId: generateIdentifier(),
            expireAt: nowUtc(),
        },
        { 'If-Match': put.headers.get('ETag')! },
    ));
    assertStrictEquals(claimResponse.status, 200);
    await claimResponse.body?.cancel();

    // Absent id: document head null pre-tx and in-tx; wire
    // 404 carries the same Not found: work_orders/:id bytes.
    const missingId = NO_SUCH_CLAIM_GRAPH_WO;
    const preMissing = await headVersionOf(db, missingId);
    const inMissing = await db.readTransaction(
        (view) => headVersionOf(view, missingId),
    );
    assertStrictEquals(preMissing, null);
    assertStrictEquals(inMissing, null);
    const missRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + missingId, token),
    );
    assertStrictEquals(missRes.status, 404);
    const missBody = await missRes.json() as {
        error: string;
    };
    assertStrictEquals(
        missBody.error,
        'Not found: work_orders/' + missingId,
    );
});

Deno.test('resolveOwningOrganization: identity without a'
+ ' membership is unowned; an accepted membership is'
+ ' own-org / foreign-hidden',
async () => {
    const db = await seededDb();
    const token = await organizationToken();

    const unownedId = generateIdentifier();
    const unownedCreate = await handleRequest(db, req(
        'PUT', '/identities/' + unownedId, token, {
            kind: 'person',
            title: 'Engineer',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(unownedCreate.status, 201);

    assertStrictEquals(
        await resolveOwningOrganization(
            db, unownedId, STARK_ORGANIZATION,
        ),
        null,
    );

    const ownedId = generateIdentifier();
    const ownedCreate = await handleRequest(db, req(
        'PUT', '/identities/' + ownedId, token, {
            kind: 'person',
            title: 'Engineer',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
        },
    ));
    assertStrictEquals(ownedCreate.status, 201);
    await seedSeat(
        db, STARK_ORGANIZATION, ownedId, 'member', nowUtc(),
    );
    const accepted = await membershipOf(
        db, STARK_ORGANIZATION, ownedId,
    );
    assert(accepted !== null);
    assertStrictEquals(accepted.state, 'accepted');

    assertStrictEquals(
        await resolveOwningOrganization(
            db, ownedId, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, ownedId, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );
});

const AT = '2026-06-04T00:00:00.000000Z';
const LATER = '2026-06-05T00:00:00.000000Z';

Deno.test('resolveOwningOrganization holds an accepted'
+ ' membership with no seat', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organization = generateIdentifier();
    const identity = generateIdentifier();
    await landMembership(
        db, organization, identity, 'accepted', 'member',
        AT,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, identity, organization,
        ),
        organization,
    );
});

Deno.test('resolveOwningOrganization holds nothing when'
+ ' the membership is removed',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organization = generateIdentifier();
    const identity = generateIdentifier();
    await seedSeat(
        db, organization, identity, 'member', AT,
    );
    await landMembership(
        db, organization, identity, 'removed', 'member',
        LATER,
    );
    assertStrictEquals(
        await membershipOf(db, organization, identity),
        null,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, identity, organization,
        ),
        null,
    );
});

Deno.test('resolveOwningOrganization holds nothing for a'
+ ' non-accepted membership', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organization = generateIdentifier();
    const states = [
        'pending', 'declined', 'revoked', 'removed',
    ] as const;
    for (const state of states) {
        const identity = generateIdentifier();
        await landMembership(
            db, organization, identity, state, 'member',
            AT,
        );
        assertStrictEquals(
            await resolveOwningOrganization(
                db, identity, organization,
            ),
            null,
            state,
        );
    }
});

Deno.test('resolveOwningOrganization holds nothing for an'
+ ' accepted version under a removed head',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organization = generateIdentifier();
    const identity = generateIdentifier();
    await landMembership(
        db, organization, identity, 'accepted', 'member',
        AT,
    );
    await landMembership(
        db, organization, identity, 'removed', 'member',
        LATER,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, identity, organization,
        ),
        null,
    );
});

Deno.test('resolveOwningOrganization prefers the bound'
+ ' accepted membership', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const bound = generateIdentifier();
    const other = generateIdentifier();
    const identity = generateIdentifier();
    await landMembership(
        db, other, identity, 'accepted', 'member', AT,
    );
    await landMembership(
        db, bound, identity, 'accepted', 'member', LATER,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, identity, bound,
        ),
        bound,
    );
});

Deno.test('resolveOwningOrganization returns another'
+ ' accepted membership when the bound one misses',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const bound = generateIdentifier();
    const other = generateIdentifier();
    const identity = generateIdentifier();
    await landMembership(
        db, other, identity, 'accepted', 'member', AT,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, identity, bound,
        ),
        other,
    );
});

// -- flowGraphBindingsFromMessagePairs ----------------------------------

// Phase Final Task 2: graph relation ROW halves stripped —
// message plane (flowGraphBindingsFromMessagePairs) is sole oracle.
Deno.test('flowGraphBindingsFromMessagePairs: seed attribute + member'
+ ' ledgers non-empty; pre-tx vs in-tx parity; nodeFlowIds'
+ ' cover every bound node', async () => {
    const db = await seededDb();
    const preTx = await flowGraphBindingsFromMessagePairs(
        db, STARK_ORGANIZATION,
    );
    const inTx = await db.readTransaction(
        (view) => flowGraphBindingsFromMessagePairs(
            view, STARK_ORGANIZATION,
        ),
    );
    assertEquals(inTx, preTx);

    // Seed is all Stark — non-empty graphDelta events.
    assert(
        preTx.attributeEvents.length > 0,
        'seed attributeEvents empty',
    );
    assert(
        preTx.memberEvents.length > 0,
        'seed memberEvents empty',
    );
    // Phase Final Stage B: flow graph tables retired — the
    // message-plane bindings above are the residual pin.

    // Every attribute/member event's node resolves a flow.
    for (const event of preTx.attributeEvents) {
        assert(
            preTx.nodeFlowIds.has(event.flow_node_id),
            'attr node ' + event.flow_node_id,
        );
    }
    for (const event of preTx.memberEvents) {
        assert(
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
    assert(derivedLatest.size > 0);
});

// GraphEdge carries no attributes field and no
// flow_edge_attributes table exists — prove-impossible so
// RESTRICT never grows an edges leg (Author gate 5).
Deno.test('prove-impossible: attribute bindings cannot reach'
+ ' flow edges (GraphEdge has no attributes; no'
+ ' flow_edge_attributes table)', () => {
    type GraphEdgeHasNoAttributes =
        'attributes' extends keyof GraphEdge
            ? never
            : true;
    const typeProof: GraphEdgeHasNoAttributes = true;
    assertStrictEquals(typeProof, true);

    const edgeKeys: readonly (keyof GraphEdge)[] = [
        'id', 'name', 'fromNodeId', 'toNodeId',
    ];
    assertEquals(
        edgeKeys.slice().sort(),
        (['id', 'name', 'fromNodeId', 'toNodeId'] as const)
            .slice().sort(),
    );
    assertStrictEquals(
        (edgeKeys as readonly string[])
            .includes('attributes'),
        false,
    );
    assertStrictEquals(
        (TABLE_NAMES as readonly string[])
            .includes('flow_edge_attributes'),
        false,
    );
});

// -- residual cross-core pins (Phase 15 Task 1 final) ----------

Deno.test('residual pin: workOrderHeadFor matches wire'
+ ' GET for every seeded Stark work order',
async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , token),
    );
    assertStrictEquals(listRes.status, 200);
    const rows = await partBodiesOf<{ id: string }>(listRes);
    assert(rows.length > 0);
    for (const row of rows) {
        const getRes = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + row.id, token),
        );
        assertStrictEquals(getRes.status, 200);
        // The wire GET streams the head: its binding rides
        // the version itself.
        const wire = await getRes.json() as Record<
            string, unknown
        >;
        const derived = await headVersionOf(db, row.id);
        assertEquals(derived, wire, row.id);
    }
    // Phase Final Stage B: work_orders table retired.
});

Deno.test('residual pin: organizations self-as-owner —'
+ ' resolveOwningOrganization maps an org id to itself',
async () => {
    const db = await seededDb();
    // No surviving writer mints a state event whose
    // entity_id is an organization id (states/:id retired).
    // Pin the ownership probe that once fed that event's
    // visibility: an org id self-as-owner resolves to itself
    // regardless of the caller's bound organization.
    assertStrictEquals(
        await resolveOwningOrganization(
            db, STARK_ORGANIZATION, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, STARK_ORGANIZATION, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );
    assertStrictEquals(
        await resolveOwningOrganization(
            db, ORGANIZATION_TWO, STARK_ORGANIZATION,
        ),
        ORGANIZATION_TWO,
    );
});

// -- Task 5: message-plane ownership (row-plane fence retired) --

Deno.test('fence pin: resolveOwningOrganization owns seed'
+ ' entities on the message plane; orphan stays null',
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

    // Ideas + projects + flows + records load from the
    // message plane (row halves retired across Stage B).
    const ideasStark = await getCollection(
        db, 'ideas', STARK_ORGANIZATION,
    );
    const ideasTwo = await getCollection(
        db, 'ideas', ORGANIZATION_TWO,
    );
    const projectsStark = await getCollection(
        db, 'projects', STARK_ORGANIZATION,
    );
    const projectsTwo = await getCollection(
        db, 'projects', ORGANIZATION_TWO,
    );
    const recordToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const recordsRes = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', recordToken),
    );
    assertStrictEquals(recordsRes.status, 200);
    const recordsStark = await partBodiesOf<{
        id: string;
    }>(recordsRes);
    const flowsStark = await deriveFlows(
        db, STARK_ORGANIZATION,
    );
    const flowsTwo = await deriveFlows(
        db, ORGANIZATION_TWO,
    );
    const currentMemberships = await membershipsOfIdentity(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    const memberStark = currentMemberships.find(
        (m) => m.organization_id === STARK_ORGANIZATION,
    )!;
    assert(memberStark, 'current has stark membership');

    const ideaStark = ideasStark[0]!;
    const ideaTwo = ideasTwo[0]!;
    assert(ideaStark, 'stark ideas non-empty');
    assert(ideaTwo, 'org-two ideas non-empty');
    const projectStark = projectsStark[0]!;
    const projectTwo = projectsTwo[0]!;
    assert(projectStark, 'stark projects non-empty');
    assert(projectTwo, 'org-two projects non-empty');
    const recordStark = recordsStark[0]!;
    assert(recordStark, 'stark records non-empty');
    const flowStark = flowsStark[0]!;
    const flowTwo = flowsTwo[0]!;
    assert(flowStark, 'stark flows non-empty');
    assert(flowTwo, 'org-two flows non-empty');
    // A live node id from the message-plane graph (graphDelta
    // upserts) — seed Customer Onboarding create node.
    const nodeStarkId = 'laXQcGGyWrbEiExtgkyCcw';

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
        assertStrictEquals(
            await pairOwner(entityId, owner), owner,
        );
        const foreignBound = owner === STARK_ORGANIZATION
            ? ORGANIZATION_TWO
            : STARK_ORGANIZATION;
        assertStrictEquals(
            await pairOwner(entityId, foreignBound), owner,
        );
    }

    // Identity ownership resolves through memberships on
    // the message plane: bound organization when a membership
    // document exists there.
    for (const bound of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        assertStrictEquals(
            await pairOwner(
                memberStark.identity_id, bound,
            ),
            bound,
            'message-plane owner for '
            + memberStark.identity_id
            + ' bound=' + bound,
        );
    }
    // Genuine orphan: null.
    assertStrictEquals(
        await pairOwner(
            GHOST_NOWHERE_P15_FENCE,
            STARK_ORGANIZATION,
        ),
        null,
    );

    // WP1: organization id is self-as-owner.
    assertStrictEquals(
        await pairOwner(
            STARK_ORGANIZATION, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assertStrictEquals(
        await pairOwner(
            STARK_ORGANIZATION, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );

    // Records retain message-plane ownership after row strip.
    assertStrictEquals(
        await pairOwner(
            recordStark.id, STARK_ORGANIZATION,
        ),
        STARK_ORGANIZATION,
    );
    assertStrictEquals(
        await pairOwner(
            recordStark.id, ORGANIZATION_TWO,
        ),
        STARK_ORGANIZATION,
    );
});

// Phase Final Task 2: graph ROW half stripped — message plane
// alone tracks the live attribute add/remove ledger.
Deno.test('residual pin: flowGraphBindingsFromMessagePairs tracks a'
+ ' live attribute add then remove (fail-closed) on the'
+ ' message plane', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const nodeId = generateIdentifier();
    const attrId = generateIdentifier();
    const at1 = '2026-06-15T00:00:00.000000Z';
    const at2 = '2026-06-15T00:00:01.000000Z';
    // A seeded project the create can join.
    const projectId = 'wqGTTFdYUGnmBxWCppmkOQ';

    const attrPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'sJxkGGTrPegHqFbQAkXnjw'
            + '/attributes/' + attrId, token, {
            name: 'P15 Bind',
            attribute_type: 'text',
            sort_order: 99,
            options: [],
            constraints: [],
            read_roles: ['member', 'admin'],
            write_roles: ['member', 'admin'],
        },
    ));
    assertStrictEquals(attrPut.status, 201);

    // Create with the binding already 'added'.
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: flowId,
            flow: {
                name: 'P15 Bind Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 8 * 60 * 60,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: at1,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
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
                    id: P15_FNA_ADD,
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
    assertStrictEquals(created.status, 201);

    const afterAdd = await flowGraphBindingsFromMessagePairs(
        db, STARK_ORGANIZATION,
    );
    const addRow = afterAdd.attributeEvents.find(
        (r) => r.id === P15_FNA_ADD,
    );
    assert(addRow);
    assertStrictEquals(addRow!.action, 'added');
    assertStrictEquals(
        afterAdd.nodeFlowIds.get(nodeId), flowId,
    );

    // Chain a remove off the create's document head.
    const headGet = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token),
    );
    assertStrictEquals(headGet.status, 200);
    const headId = pairIdOf(headGet);
    assert(headId);

    const putRemove = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        {
            name: 'P15 Bind Flow',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: 8 * 60 * 60,
            state: 'active',
            state_at: at2,
            state_event_id: FLOWID_EV_RM,
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
                    id: P15_FNA_RM,
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
        { 'if-match': (
            await handleRequest(
                db,
                req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + flowId, token),
            )
        ).headers.get('ETag')! },
    ));
    assertStrictEquals(putRemove.status, 200);

    const afterRm = await flowGraphBindingsFromMessagePairs(
        db, STARK_ORGANIZATION,
    );
    const rmRow = afterRm.attributeEvents.find(
        (r) => r.id === P15_FNA_RM,
    );
    assert(rmRow);
    assertStrictEquals(rmRow!.action, 'removed');

    const latest = latestByKey(
        afterRm.attributeEvents.filter(
            (r) => r.flow_node_id === nodeId
                && r.attribute_id === attrId,
        ),
        (r) => r.flow_node_id,
        relationFailClosed,
    );
    assertStrictEquals(latest.get(nodeId)!.action, 'removed');
});

// F1 fix pin: soft-deleting a node via graphDelta.deletions
// must drop it from nodeFlowIds. Residual 'added' must NOT
// RESTRICT attribute DELETE (message-plane path).
Deno.test('residual pin: soft-deleted node drops from'
+ ' nodeFlowIds so residual attribute binding is not a'
+ ' RESTRICT referrer (DELETE → 204)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const nodeId = generateIdentifier();
    const attrId = generateIdentifier();
    const at1 = '2026-06-17T00:00:00.000000Z';
    const at2 = '2026-06-17T00:00:01.000000Z';
    const projectId = 'wqGTTFdYUGnmBxWCppmkOQ';

    const attrPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'sJxkGGTrPegHqFbQAkXnjw'
            + '/attributes/' + attrId, token, {
            name: 'P15 SoftDel',
            attribute_type: 'text',
            sort_order: 99,
            options: [],
            constraints: [],
            read_roles: ['member', 'admin'],
            write_roles: ['member', 'admin'],
        },
    ));
    assertStrictEquals(attrPut.status, 201);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: flowId,
            flow: {
                name: 'P15 SoftDel Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 8 * 60 * 60,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: at1,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
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
                    id: P15_SOFTDEL_FNA,
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
    assertStrictEquals(created.status, 201);

    const afterAdd = await flowGraphBindingsFromMessagePairs(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        afterAdd.nodeFlowIds.get(nodeId), flowId,
    );

    const headGet = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token),
    );
    assertStrictEquals(headGet.status, 200);
    const headId = pairIdOf(headGet);
    assert(headId);

    // Soft-delete the bound node only — residual 'added'
    // attributeEvent remains; no attributeEvents 'removed'.
    const putDelete = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        {
            name: 'P15 SoftDel Flow',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: 8 * 60 * 60,
            state: 'active',
            state_at: at2,
            state_event_id: FLOWID_EV_DEL,
            graph: {
                nodes: [],
                edges: [],
            },
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [{
                    eventId: P15_SOFTDEL_DEL,
                    entityId: nodeId,
                    at: at2,
                }],
                memberEvents: [],
                attributeEvents: [],
            },
            revivals: [],
        },
        { 'if-match': (
            await handleRequest(
                db,
                req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + flowId, token),
            )
        ).headers.get('ETag')! },
    ));
    assertStrictEquals(putDelete.status, 200);

    const afterDel = await flowGraphBindingsFromMessagePairs(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        afterDel.nodeFlowIds.has(nodeId), false,
        'soft-deleted node must leave nodeFlowIds',
    );
    // Residual 'added' still in the event ledger.
    const residual = afterDel.attributeEvents.find(
        (r) => r.id === P15_SOFTDEL_FNA,
    );
    assert(residual);
    assertStrictEquals(residual!.action, 'added');

    // recordTypeId scopes the Task 7 instance leg (empty
    // until Task 14 writes instances).
    const pairPlane = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, [attrId], 'rOEPOcVMQdJiiiMuiiEhlg',
    );
    assertEquals(
        pairPlane.get(attrId)!.flowIds, [],
        'no current-node flow referrer',
    );

    // Wire contract: residual binding on a soft-deleted
    // node is NOT a RESTRICT referrer → DELETE 204.
    const deleted = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'sJxkGGTrPegHqFbQAkXnjw'
            + '/attributes/' + attrId,
        token,
    ));
    assertStrictEquals(deleted.status, 204);
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
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'fv-' + workOrderId,
                flow_graph: graph,
                position: 1,
            },
            flowWorkOrderId: WORKORDERID_FWO,
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                WORKORDERID_EV1,
                WORKORDERID_EV2,
                WORKORDERID_EV3,
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: [N_START, N_FINISH, 'claimed'],
        },
    ));
    assertStrictEquals(created.status, 201);

    // Phase Final Stage B: record_attributes retired.
    const typePut = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/record-types/rrAaARbMuzlMVlOpTxcsmA',
        token,
        {
            name: 'P15 FV Parent', description: '',
            position: 0,
            state: 'active',
        },
    ));
    assertStrictEquals(typePut.status, 201);
    const attrWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + STARK_ORGANIZATION
            + '/record-types/rrAaARbMuzlMVlOpTxcsmA'
            + '/attributes/' + attributeId,
        token,
        {
            name: 'Note',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: ['member', 'admin'],
            write_roles: ['member', 'admin'],
        },
    ));
    assertStrictEquals(attrWrite.status, 201);

    // Task 8 CUT: legacy fieldValues below the gate.
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
            transitionEventId,
            targetState: N_FINISH,
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

// Wire-shape pin (C4): GET organizations/:id/work-orders/:id/history is
// 200 / 404 by document (own → rows with field_values;
// never written here → 404; absent → 404). Field values
// fold inline; the retired GET states/:id/field-values
// three-way force lives here.
Deno.test('work-order history GET: 200/404 two-way for'
+ ' own / foreign-or-absent work orders', async () => {
    const db = await seededDb();
    const starkToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const twoToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const workOrderId = generateIdentifier();
    const transitionEventId = WORKORDERID_TE;
    const fieldValueId = WORKORDERID_FV;
    await transitionWithFieldValue(
        db, workOrderId, transitionEventId,
        fieldValueId, WORKORDERID_ATTR,
    );

    // (own) Stark sees the folded row on history.
    const own = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + workOrderId + '/history',
            starkToken,
        ),
    );
    assertStrictEquals(own.status, 200);
    const ownRows = await own.json() as {
        id: string;
        field_values: { id: string }[];
    }[];
    const ownTe = ownRows.find(
        (r) => r.id === transitionEventId,
    );
    assert(ownTe !== undefined);
    assertEquals(
        ownTe!.field_values.map((r) => r.id), [fieldValueId],
    );

    // (foreign) Org two 404s — never written at this document.
    const foreign = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/work-orders/' + workOrderId + '/history',
            twoToken,
        ),
    );
    assertStrictEquals(foreign.status, 404);
    const foreignBody =
        await foreign.json() as { error: string };
    assertStrictEquals(
        foreignBody.error,
        'Not found: work_orders/' + workOrderId,
    );

    // (absent) Ghost work-order id → 404.
    const orphan = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'ecupcwyehqSNYeaJpJtNFw/history',
            starkToken,
        ),
    );
    assertStrictEquals(orphan.status, 404);
    const orphanBody =
        await orphan.json() as { error: string };
    assertStrictEquals(
        orphanBody.error,
        'Not found: work_orders/ecupcwyehqSNYeaJpJtNFw',
    );
});

// Derive-path (C4): workOrderHistoryFor throws on foreign
// miss (404) and absent (404); own still returns folded rows.
Deno.test('workOrderHistoryFor visibility: own field_values,'
+ ' foreign rejects, absent rejects',
async () => {
    const db = await seededDb();
    const workOrderId = generateIdentifier();
    const transitionEventId = WORKORDERID_TE;
    const fieldValueId = WORKORDERID_FV;
    await transitionWithFieldValue(
        db, workOrderId, transitionEventId,
        fieldValueId, WORKORDERID_ATTR,
    );

    // Own → history returns the transition fold.
    const ownHistory = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const ownTe = ownHistory.find(
        (row) => row.id === transitionEventId,
    );
    assert(ownTe !== undefined);
    assertStrictEquals(ownTe!.field_values.length, 1);
    assertStrictEquals(ownTe!.field_values[0]!.id, fieldValueId);

    // Foreign → work-order ownership rejects.
    await assertRejects(
        () => workOrderHistoryFor(
            db, ORGANIZATION_TWO, workOrderId,
        ),
        EntityNotFoundError,
    );

    // Absent work order → EntityNotFoundError.
    await assertRejects(
        () => workOrderHistoryFor(
            db, STARK_ORGANIZATION, GHOST_P15_VIS,
        ),
        EntityNotFoundError,
    );
});

// -- RESTRICT graph-leg re-anchor (Phase 15 Task 4) ------------

// Phase Final Task 2: flow_node_attributes/flow_nodes +
// work_orders ROW halves stripped — collectAttributeReferrers
// graph + WO legs are message-plane-only.
function sortedReferrerShape(
    refs: AttributeReferrers,
): {
    flowIds: string[];
    workOrderIds: string[];
    instanceIds: string[];
} {
    return {
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
        assert(a, label + ' left ' + attributeId);
        assert(b, label + ' right ' + attributeId);
        assertEquals(
            sortedReferrerShape(a!),
            sortedReferrerShape(b!),
            label + ' ' + attributeId,
        );
    }
}

Deno.test('collectAttributeReferrers graph legs: seed attributes'
+ ' with any referrer; pre-tx vs in-tx parity (message plane)',
async () => {
    const db = await seededDb();
    // Seed attributes from message-plane graph bindings + WO
    // frozen graphs.
    const bindings = await flowGraphBindingsFromMessagePairs(
        db, STARK_ORGANIZATION,
    );
    const attrFromRelations = new Set(
        bindings.attributeEvents.map(
            (r) => r.attribute_id,
        ),
    );
    // Phase Final Task 2: WO graphs from the message plane.
    const attrFromWorkOrders = new Set<string>();
    const woToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const woListRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , woToken),
    );
    assertStrictEquals(woListRes.status, 200);
    const workOrders = await partBodiesOf<{
        flow_graph: Record<string, unknown>;
    }>(woListRes);
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
    assert(
        attributeIds.length > 0,
        'seed must name at least one bound attribute',
    );

    // recordTypeId scopes the Task 7 instance leg (empty
    // until Task 14 writes instances).
    const preTx = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, attributeIds, 'seed-type',
    );
    const inTx = await db.readTransaction(
        // Stage B: roster +
        // organizations/AjdvjuECVZEgZoFajaIEkg/objectives/records retired.
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
    assert(flowBound > 0, 'seed flow bindings empty');
});

Deno.test('collectAttributeReferrers graph legs: live-minted'
+ ' flow binding + work-order head stay message-plane stable',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const nodeId = generateIdentifier();
    const attrId = generateIdentifier();
    const woId = generateIdentifier();
    const at = '2026-06-16T00:00:00.000000Z';
    const projectId = 'wqGTTFdYUGnmBxWCppmkOQ';

    const attrPut = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/' + 'sJxkGGTrPegHqFbQAkXnjw'
            + '/attributes/' + attrId, token, {
            name: 'P15 Restrict',
            attribute_type: 'text',
            sort_order: 99,
            options: [],
            constraints: [],
            read_roles: ['member', 'admin'],
            write_roles: ['member', 'admin'],
        },
    ));
    assertStrictEquals(attrPut.status, 201);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: flowId,
            flow: {
                name: 'P15 Restrict Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 8 * 60 * 60,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
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
                    id: P15_RESTRICT_FNA,
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
    assertStrictEquals(created.status, 201);

    const woGraph = {
        name: 'P15 Restrict WO',
        lockTimeout: 8 * 60 * 60,
        nodes: [{
            id: N_WO, name: 'Step',
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
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token, {
            id: woId,
            workOrder: {
                display_id: P15_RESTRICT_WO,
                flow_graph: woGraph,
                position: 1,
            },
            flowWorkOrderId: WOID_FWO,
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: woId,
                at: nowUtc(),
            },
            stateEventIds: [
                WOID_EV1,
                WOID_EV2,
                WOID_EV3,
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: [N_START, N_FINISH, 'claimed'],
        },
    ));
    assertStrictEquals(woCreated.status, 201);

    // recordTypeId scopes the Task 7 instance leg (empty
    // until Task 14 writes instances).
    const pairPlane = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, [attrId], 'rOEPOcVMQdJiiiMuiiEhlg',
    );
    // Pre-tx vs in-tx parity (message plane only).
    const inTx = await db.readTransaction(
        // Stage B: roster + records/work_orders retired.
        (view) => collectAttributeReferrers(
            view,
            STARK_ORGANIZATION,
            [attrId],
            'rOEPOcVMQdJiiiMuiiEhlg',
        ),
    );
    assertReferrerParity(
        'live mint pre-tx vs in-tx',
        pairPlane, inTx, [attrId],
    );
    const refs = pairPlane.get(attrId)!;
    assert(refs.flowIds.includes(flowId));
    assert(refs.workOrderIds.includes(woId));
});
