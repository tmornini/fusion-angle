import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    deriveFlow,
    deriveFlows,
    deriveFlowStateHistory,
} from '../api/derive-flows.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';


// The flows sibling of tests/derive-ideas.test.ts/derive-
// projects.test.ts: unit-level lifecycle-reduction guarantees
// that tests/drift-flows.test.ts (parity-against-old-plane
// only) does not exercise. MECHANISM: flows are the LOCKED
// class (Decision 7) — a SECOND PUT to an existing flow is
// non-genesis and must thread If-Match via a header-
// capable req helper (echo the first PUT's pair-id ETag),
// unlike the bare-req idiom the
// organizations/AjdvjuECVZEgZoFajaIEkg/ideas/projects skew tests
// use.

const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
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
        operationId: TEST_OPERATION_ID,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

function flowFields(name: string) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
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

function graphWithNode(nodeId: string, name: string) {
    return {
        nodes: [{
            id: nodeId, name,
            positionX: 0, positionY: 0,
            isCreate: false, isArchive: false,
            memberIds: [], attributes: [],
            taskInstructions: '',
        }],
        edges: [],
    };
}

function flowDocument(
    name: string,
    state: string,
    stateAt: string,
    stateEventId: string,
    graph: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...flowFields(name),
        state, state_at: stateAt, state_event_id: stateEventId,
        graph,
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

function putFlow(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    name: string,
    state: string,
    stateAt: string,
    stateEventId: string,
    graph: Record<string, unknown>,
    headers?: Record<string, string>,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + id, token,
        flowDocument(name, state, stateAt, stateEventId, graph),
        headers,
    ));
}

Deno.test(
    'a clock-skewed transition does NOT displace genesis — '
    + 'the graph still tracks the DOCUMENT head',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const id = generateIdentifier();
        const genesisEventId = generateIdentifier();
        const laterEventId = generateIdentifier();
        const genesisGraph = graphWithNode(
            generateIdentifier(), 'Genesis Node',
        );

        // Genesis claims a LATER state_at than the skewed
        // transition below — exactly the clock-skew scenario
        // the (state_at, id) reduction must resist.
        const genesis = await putFlow(
            db, token, id, 'Genesis Title', 'active',
            '2026-06-01T00:00:00.000000Z', genesisEventId,
            genesisGraph,
        );
        assertStrictEquals(genesis.status, 201);
        const head = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + id, token,
        ));
        const etag = head.headers.get('ETag');
        assert(etag
            , 'no ETag on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + id);

        // The locked class: this second PUT is non-genesis, so
        // it must echo the current head's ETag rather
        // than the bare-req idiom the
        // organizations/AjdvjuECVZEgZoFajaIEkg/ideas/projects skew
        // tests
        // use — a save with no echo 412s outright.
        const skewedGraph = graphWithNode(
            generateIdentifier(), 'Skewed Node',
        );
        const res = await putFlow(
            db, token, id, 'Skewed Title', 'deleted',
            '2020-01-01T00:00:00.000000Z', laterEventId,
            skewedGraph, { 'if-match': etag },
        );
        assertStrictEquals(res.status, 201);

        // Genesis must still win the lifecycle reduction: the
        // flow stays visible despite the later-arriving
        // 'deleted' transition, because that transition's OWN
        // state_at is older than genesis's.
        const derived = await deriveFlow(
            db, STARK_ORGANIZATION, id,
        );
        // Arrival order still governs the entity's OTHER
        // fields — the two reductions are independent.
        assertStrictEquals(derived.name, 'Skewed Title');
        // Design decision 6's third-head distinction: `graph`
        // tracks the DOCUMENT head (the second, envelope-later
        // PUT) — never the lifecycle-current pair (genesis),
        // even though genesis wins the lifecycle reduction.
        assertEquals(
            derived.graph,
            skewedGraph,
        );

        const flows = await deriveFlows(
            db, STARK_ORGANIZATION,
        );
        assertStrictEquals(
            flows.some((flow) => flow.id === id), true,
        );

        const history = await deriveFlowStateHistory(
            db, STARK_ORGANIZATION, id,
        );
        // Order- AND content-sensitive: (state_at, id)
        // ascending — the SAME order store-state.ts's
        // getAllForIn returns. The later-ARRIVED but earlier-
        // STAMPED 'deleted' event sorts FIRST; genesis SECOND.
        assertEquals(
            history.map((entry) => ({
                id: entry.id,
                entity_id: entry.entity_id,
                state: entry.state,
                at: entry.at,
            })),
            [
                {
                    id: laterEventId,
                    entity_id: id,
                    state: 'deleted',
                    at: '2020-01-01T00:00:00.000000Z',
                },
                {
                    id: genesisEventId,
                    entity_id: id,
                    state: 'active',
                    at: '2026-06-01T00:00:00.000000Z',
                },
            ],
        );
    },
);

Deno.test('ordering is oldest live head (at, id)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ids = [
        generateIdentifier(),
        generateIdentifier(),
        generateIdentifier(),
    ];
    for (const id of ids) {
        const res = await putFlow(
            db, token, id, 'Order ' + id, 'active',
            AT, generateIdentifier(), emptyGraph(),
        );
        assertStrictEquals(res.status, 201);
    }
    const derived = await deriveFlows(db, STARK_ORGANIZATION);
    const observed = derived
        .map((flow) => flow.id)
        .filter((id) => ids.includes(id));
    assertEquals(observed, ids);
});
