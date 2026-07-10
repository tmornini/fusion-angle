import { deriveStatesFor } from
    '../api/derive-states.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type {
    FlowWithGraph,
} from '../api/types.ts';
import { DEFAULT_LOCK_TIMEOUT } from
    '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import { l2cProjectId } from '../api/mock-data/projects.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { canonicalUriPrefix } from '../api/message-pair.ts';
import { deriveDocumentsAt } from '../api/derive-documents.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveFlow,
    deriveFlows,
    deriveFlowStateHistory,
} from '../api/derive-flows.ts';
import { deriveProjectFlows } from
    '../api/derive-project-flows.ts';

// Phase Final Task 2: flows(+graph relations+flow_versions)
// dual-write stripped. This file no longer compares derive
// vs old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions
// and non-lexical live fixtures.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
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

function emptyGraph(): string {
    return JSON.stringify({ nodes: [], edges: [] });
}

interface WireNode {
    readonly id: string;
    readonly name: string;
    readonly positionX: number;
    readonly positionY: number;
    readonly isCreate: boolean;
    readonly isArchive: boolean;
    readonly memberIds: readonly string[];
    readonly attributes: readonly {
        readonly attribute_id: string;
        readonly mode: string;
        readonly isRequired: boolean;
    }[];
    readonly taskInstructions: string;
}

function wireNode(
    id: string,
    name: string,
    isCreate = false,
    memberIds: readonly string[] = [],
    attributes: WireNode['attributes'] = [],
): WireNode {
    return {
        id, name, positionX: 0, positionY: 0,
        isCreate, isArchive: false,
        memberIds, attributes,
        taskInstructions: '',
    };
}

function wireEdge(
    id: string, name: string, from: string, to: string,
) {
    return { id, name, fromNodeId: from, toNodeId: to };
}

function graphJson(
    nodes: readonly WireNode[],
    edges: readonly ReturnType<typeof wireEdge>[],
): string {
    return JSON.stringify({ nodes, edges });
}

function deltaNode(
    id: string, flowId: string, name: string,
    isCreate: boolean, at: string,
) {
    return {
        id, flow_id: flowId, name,
        position_x: 0, position_y: 0,
        is_create: isCreate, is_archive: false,
        task_instructions: '', at,
    };
}

function deltaEdge(
    id: string, flowId: string, name: string,
    from: string, to: string, at: string,
) {
    return {
        id, flow_id: flowId, name,
        from_node_id: from, to_node_id: to, at,
    };
}

function deltaMember(
    id: string, flowNodeId: string, memberId: string, at: string,
) {
    return {
        id, flow_node_id: flowNodeId, member_id: memberId,
        action: 'added', at,
    };
}

function deltaAttribute(
    id: string, flowNodeId: string, attributeId: string,
    mode: string, isRequired: boolean, at: string,
) {
    return {
        id, flow_node_id: flowNodeId, attribute_id: attributeId,
        mode, is_required: isRequired, action: 'added', at,
    };
}

function documentBody(
    name: string,
    stateEventId: string,
    overrides?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
        ...(overrides ?? {}),
    };
}

async function headResponseId(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert.ok(id, 'no Response-ID on GET /flows/' + flowId);
    return id!;
}

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
    projectFlowId: string,
    projectId: string,
    eventId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/flows', token, {
            id: flowId,
            flow: flowFields('Fresh Flow'),
            projectFlowId,
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: eventId,
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
}

// Wire-byte GET helper: handleRequest text must equal
// JSON.stringify(derive) for pair-plane oracles.
async function wireFlowText(
    db: MemoryDbAdapter,
    organization: string,
    flowId: string,
): Promise<string> {
    const token = await organizationToken(
        'current', organization,
    );
    const res = await handleRequest(
        db, req('GET', '/flows/' + flowId, token),
    );
    assert.equal(res.status, 200);
    return res.text();
}

async function wireFlowsText(
    db: MemoryDbAdapter,
    organization: string,
): Promise<string> {
    const token = await organizationToken(
        'current', organization,
    );
    const res = await handleRequest(
        db, req('GET', '/flows', token),
    );
    assert.equal(res.status, 200);
    return res.text();
}

function normalizedGraph(graph: string): unknown {
    const parsed = JSON.parse(graph) as {
        nodes: {
            id: string;
            memberIds: string[];
            attributes: { attribute_id: string }[];
        }[];
        edges: { id: string }[];
    };
    return {
        nodes: sortById(parsed.nodes).map((node) => ({
            ...node,
            memberIds: [...node.memberIds].sort(),
            attributes: sortById(
                node.attributes.map((a) => ({
                    ...a, id: a.attribute_id,
                })),
            ),
        })),
        edges: sortById(parsed.edges),
    };
}

function assertWireEqualsDerived(
    wireText: string,
    derived: FlowWithGraph,
): void {
    assert.equal(wireText, JSON.stringify(derived));
}

// The SAME reduction deriveFlow calls internally (derive-
// documents.ts's deriveDocumentsAt), exposed here so case 11 can
// assert the Follows-chain terminal reaches EXACTLY this pair
// id, not merely "a flow that looks right".
async function derivedHeadPairId(
    db: MemoryDbAdapter, organization: string, flowId: string,
): Promise<string> {
    const prefix = canonicalUriPrefix(organization, '/flows/');
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const documents = deriveDocumentsAt(
        requests, responses, prefix,
    );
    const document = documents.get(flowId);
    assert.ok(document, 'no derived document for ' + flowId);
    return document!.pairId;
}

// Every seeded flow's own id, paired with the org the seed
// actually stamped it into: buildFlows() (4 rows) all land on
// STARK_ORGANIZATION; the 5th is org '2's own flow (Task 6's
// closure proof), driven through postFlowDocumentOp directly —
// no exported id constant exists for it (unlike the projects
// sibling's secondOrganizationProjectId), so the literal
// mirrors api/mock-data.ts's own.
const SEEDED_FLOWS = [
    ...buildFlows().map((flow) => ({
        id: flow.id,
        organization: STARK_ORGANIZATION,
    })),
    {
        id: 'seed-flow-org2',
        organization: ORGANIZATION_TWO,
    },
];

// The project ids mockProjectFlows.ts joins a seeded flow to —
// 'u6YkHhlGc91oDMkr3x0isa' carries TWO (Customer Onboarding AND
// Layout Test), the multi-row ordering case.
const TWO_FLOWS_PROJECT_ID = 'u6YkHhlGc91oDMkr3x0isa';
const SEEDED_PROJECT_FLOW_PROJECT_IDS = [
    TWO_FLOWS_PROJECT_ID,
    'jRE2Tj32NHsFGZIeEADp0p',
    l2cProjectId,
];

// -- 1. seeded GET /flows wire equals deriveFlows -------------

test('seeded GET /flows wire equals deriveFlows per org',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const wireText = await wireFlowsText(
            db, organization,
        );
        const derived = await deriveFlows(db, organization);
        assert.equal(wireText, JSON.stringify(derived));
        assert.ok(derived.length > 0);
    }
});

// -- 2. per-flow GET wire equals deriveFlow --------------------

test('per-flow GET wire equals deriveFlow for every seed',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_FLOWS) {
        const derived = await deriveFlow(db, organization, id);
        const wireText = await wireFlowText(
            db, organization, id,
        );
        assertWireEqualsDerived(wireText, derived);
    }
});

// -- 3. foreign-org id 404 on GET and derive --------------------

test('a foreign-org flow id 404s on GET and on derive',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_FLOWS.find(
        (seed) => seed.organization === '1',
    )!;
    const otherOrganization = '2';
    await assert.rejects(
        () => deriveFlow(db, otherOrganization, foreign.id),
        EntityNotFoundError,
    );
    const token = await organizationToken(
        'current', otherOrganization,
    );
    const res = await handleRequest(
        db, req('GET', '/flows/' + foreign.id, token),
    );
    assert.equal(res.status, 404);
});

// -- 4. state-history parity, every seeded flow ----------------

test('state-history parity across every seeded flow',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_FLOWS) {
        const derived = await deriveFlowStateHistory(
            db, organization, id,
        );
        // Phase Final Task 2: states ROW half stripped —
        // flow history equals union history for the flow id.
        const union = await deriveStatesFor(
            db, organization, id,
        );
        assert.deepEqual(derived, union);
    }
});

// -- 5. project-flows wire equals derive (Phase Final Task 2:
// -- project_flows row half stripped) --------------------------

test('project-flows wire equals derive across every'
+ ' seeded project', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    for (const projectId of SEEDED_PROJECT_FLOW_PROJECT_IDS) {
        const res = await handleRequest(db, req(
            'GET', '/projects/' + projectId + '/flows', token,
        ));
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveProjectFlows(
            db, STARK_ORGANIZATION, projectId,
        );
        assert.equal(wireText, JSON.stringify(derived));
    }
});

test('the two-flows project orders both join rows'
+ ' on wire and derive', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const res = await handleRequest(db, req(
        'GET',
        '/projects/' + TWO_FLOWS_PROJECT_ID + '/flows',
        token,
    ));
    assert.equal(res.status, 200);
    const wire = await res.json() as { flow_id: string }[];
    const derived = await deriveProjectFlows(
        db, STARK_ORGANIZATION, TWO_FLOWS_PROJECT_ID,
    );
    assert.equal(derived.length, 2);
    assert.equal(JSON.stringify(wire), JSON.stringify(derived));
    // id-lex order is pinned by derive; wire equals derive.
    assert.deepEqual(
        wire.map((row) => row.flow_id),
        derived.map((row) => row.flow_id),
    );
});

// -- 6. live-write chain, re-compared at each step -------------

test('live-write chain: create, save, node delete, undo, '
+ 'redo, and a terminal delete — wire equals derive '
+ 'at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-chain';
    const projectId = l2cProjectId;

    const n1 = 'chain-n1';
    const n2 = 'chain-n2';
    const e1 = 'chain-e1';
    const genesisAt = '2026-03-01T00:00:00.000000Z';

    async function assertStep(): Promise<FlowWithGraph> {
        const derived = await deriveFlow(
            db, STARK_ORGANIZATION, flowId,
        );
        const wireText = await wireFlowText(
            db, STARK_ORGANIZATION, flowId,
        );
        assertWireEqualsDerived(wireText, derived);
        return derived;
    }

    // Create: two nodes, one edge.
    const created = await handleRequest(db, req(
        'POST', '/flows', token, {
            id: flowId,
            flow: flowFields('Chain Flow'),
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: genesisAt,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: genesisAt,
            graphDelta: {
                nodes: [
                    deltaNode(n1, flowId, 'Create', true,
                        genesisAt),
                    deltaNode(n2, flowId, 'Review', false,
                        genesisAt),
                ],
                edges: [
                    deltaEdge(e1, flowId, 'begin', n1, n2,
                        genesisAt),
                ],
                deletions: [], memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(created.status, 204);
    let derived = await assertStep();

    const fullGraph = graphJson(
        [wireNode(n1, 'Create', true), wireNode(n2, 'Review')],
        [wireEdge(e1, 'begin', n1, n2)],
    );

    // Plain save: rename only, no graph change.
    let headId = await headResponseId(db, token, flowId);
    const saveAt = '2026-03-02T00:00:00.000000Z';
    const saved = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody('Chain Flow Saved', flowId + '-save', {
            state_at: saveAt, graph: fullGraph,
        }),
        { 'if-response-id': headId },
    ));
    assert.equal(saved.status, 200);
    headId = saved.headers.get('Response-ID')!;
    derived = await assertStep();

    // Further save (versions POST retired Phase 15 Task 7).
    const versionAt = '2026-03-03T00:00:00.000000Z';
    const versionedSave = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody(
            'Chain Flow Versioned', flowId + '-versioned', {
                state_at: versionAt, graph: fullGraph,
            },
        ),
        { 'if-response-id': headId },
    ));
    assert.equal(versionedSave.status, 200);
    headId = versionedSave.headers.get('Response-ID')!;
    derived = await assertStep();

    // Node delete via save: n2 and e1 are tombstoned.
    const deleteAt = '2026-03-04T00:00:00.000000Z';
    const deletedGraph = graphJson(
        [wireNode(n1, 'Create', true)], [],
    );
    const deletedSave = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody(
            'Chain Flow Trimmed', flowId + '-delete-node', {
                state_at: deleteAt, graph: deletedGraph,
                graphDelta: {
                    ...emptyDelta(),
                    deletions: [
                        {
                            eventId: flowId + '-del-n2',
                            entityId: n2, at: deleteAt,
                        },
                        {
                            eventId: flowId + '-del-e1',
                            entityId: e1, at: deleteAt,
                        },
                    ],
                },
            },
        ),
        { 'if-response-id': headId },
    ));
    assert.equal(deletedSave.status, 200);
    headId = deletedSave.headers.get('Response-ID')!;
    derived = await assertStep();
    assert.equal(
        (JSON.parse(derived.graph) as { nodes: { id: string }[] })
            .nodes.length,
        1,
    );

    // Undo-as-replay: reverts to Versioned (fullGraph).
    const undoAt = '2026-03-05T00:00:00.000000Z';
    const undone = await handleRequest(db, req(
        'POST', '/flows/' + flowId + '/undo', token, {
            eventId: flowId + '-undo-ev',
            at: undoAt,
        },
    ));
    assert.equal(undone.status, 204);
    headId = await headResponseId(db, token, flowId);
    derived = await assertStep();
    assert.equal(
        (JSON.parse(derived.graph) as { nodes: { id: string }[] })
            .nodes.some((n) => n.id === n2),
        true,
        'the revived node must be visible on the pair plane',
    );

    // Redo-as-save: re-apply the node deletion.
    const redoAt = '2026-03-06T00:00:01.000000Z';
    const redone = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody('Chain Flow Redone', flowId + '-redo', {
            state_at: redoAt, graph: deletedGraph,
            graphDelta: {
                ...emptyDelta(),
                deletions: [
                    {
                        eventId: flowId + '-redo-del-n2',
                        entityId: n2, at: redoAt,
                    },
                    {
                        eventId: flowId + '-redo-del-e1',
                        entityId: e1, at: redoAt,
                    },
                ],
            },
        }),
        { 'if-response-id': headId },
    ));
    assert.equal(redone.status, 200);
    headId = redone.headers.get('Response-ID')!;
    derived = await assertStep();

    // Terminal: a state-'deleted' document PUT — vanishes from
    // list, 404s on GET and derive.
    const tombstoneAt = '2026-03-07T00:00:00.000000Z';
    const tombstoned = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody('Chain Flow Deleted', flowId + '-tomb', {
            state: 'deleted', state_at: tombstoneAt,
            graph: deletedGraph,
        }),
        { 'if-response-id': headId },
    ));
    assert.equal(tombstoned.status, 200);

    await assert.rejects(
        () => deriveFlow(db, STARK_ORGANIZATION, flowId),
        EntityNotFoundError,
    );
    const gone = await handleRequest(
        db, req('GET', '/flows/' + flowId, token),
    );
    assert.equal(gone.status, 404);
    const derivedList = await deriveFlows(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        derivedList.some((f) => f.id === flowId), false,
    );
    const listText = await wireFlowsText(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        listText.includes('"' + flowId + '"'), false,
    );

    const derivedHistory = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    const oldHistory = await deriveStatesFor(db, STARK_ORGANIZATION, flowId);
    assert.deepEqual(derivedHistory, oldHistory);
});

// -- 7. live join-row chain: PUT appears, DELETE vanishes ------

test('live join-row chain: PUT appears on wire/derive, '
+ 'DELETE removes it from both', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = l2cProjectId;
    const pfid = 'pf-drift-join-1';
    const listPath = '/projects/' + projectId + '/flows';

    const putRes = await handleRequest(db, req(
        'PUT', listPath + '/' + pfid,
        token,
        {
            project_id: projectId,
            flow_id: 'flow-drift-join',
            at: AT,
        },
    ));
    assert.equal(putRes.status, 200);

    const afterPutRes = await handleRequest(
        db, req('GET', listPath, token),
    );
    assert.equal(afterPutRes.status, 200);
    const wireAfterPut = await afterPutRes.json() as {
        id: string;
    }[];
    const derivedAfterPut = await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    );
    assert.ok(wireAfterPut.some((row) => row.id === pfid));
    assert.equal(
        JSON.stringify(wireAfterPut),
        JSON.stringify(derivedAfterPut),
    );

    const delRes = await handleRequest(db, req(
        'DELETE',
        listPath + '/' + pfid, token,
    ));
    assert.equal(delRes.status, 204);

    const afterDelRes = await handleRequest(
        db, req('GET', listPath, token),
    );
    const wireAfterDelete = await afterDelRes.json() as {
        id: string;
    }[];
    const derivedAfterDelete = await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    );
    assert.equal(
        wireAfterDelete.some((row) => row.id === pfid), false,
    );
    assert.equal(
        derivedAfterDelete.some((row) => row.id === pfid), false,
    );
    assert.equal(
        JSON.stringify(wireAfterDelete),
        JSON.stringify(derivedAfterDelete),
    );
});

// -- 8. duplicate-create (the R2 multiset case) ----------------

test('duplicate-create: two creates, same flow id, distinct '
+ 'lifecycle events, and a fresh join row on wire/derive',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-dup';
    const projectId = l2cProjectId;
    const pfidA = 'flow-drift-dup-pf-a';
    const pfidB = 'flow-drift-dup-pf-b';

    const first = await createFlow(
        db, token, flowId, pfidA, projectId,
        'flow-drift-dup-ev-a',
    );
    assert.equal(first.status, 204);
    const second = await createFlow(
        db, token, flowId, pfidB, projectId,
        'flow-drift-dup-ev-b',
    );
    // The create op holds no echo of its own — a duplicate
    // create succeeds outright, never 412ing.
    assert.equal(second.status, 204);

    // ONE flow head on wire/derive — the derived head is the
    // (at, id) winner, the second create's own document pair.
    const derivedFlow = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    assertWireEqualsDerived(wireText, derivedFlow);

    // TWO lifecycle events (derive vs states dual-write).
    const derivedHistory = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    const oldHistory = await deriveStatesFor(db, STARK_ORGANIZATION, flowId);
    assert.deepEqual(derivedHistory, oldHistory);
    assert.equal(derivedHistory.length, 2);

    // TWO join rows on wire and derive (Phase Final Task 2:
    // project_flows row half stripped).
    const joinsRes = await handleRequest(db, req(
        'GET', '/projects/' + projectId + '/flows', token,
    ));
    const wireJoins = (await joinsRes.json() as {
        id: string;
    }[]).filter(
        (row) => row.id === pfidA || row.id === pfidB,
    );
    const derivedJoins = (await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    assert.equal(wireJoins.length, 2);
    assert.equal(derivedJoins.length, 2);
    assert.deepEqual(
        sortById(wireJoins), sortById(derivedJoins),
    );
});

// -- 9. the create-op POST pair is never the derived head -----

test('the create-op POST pair is not read as a document pair '
+ '(the method-filter proof at drift altitude)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-method-filter';

    const created = await createFlow(
        db, token, flowId, flowId + '-pf', l2cProjectId,
        flowId + '-ev',
    );
    assert.equal(created.status, 204);

    const requests = await db.requests.getAll();
    const atAddress = requests.filter(
        (r) => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === flowId,
    );
    // Both an operation (POST, 204) pair and a document (PUT)
    // pair share the SAME uriId.
    assert.equal(atAddress.length, 2);

    // If the POST pair leaked into the document reduction it
    // would either throw (its body has no top-level
    // state_event_id — the create wraps it as
    // initialStateEventId) or double-count the genesis event.
    // ONE lifecycle event proves the FILTER, not merely the
    // envelope ordering, decided this.
    const history = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    assert.equal(history.length, 1);
    assert.equal(history[0]!.state, 'active');

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    assertWireEqualsDerived(wireText, derived);
});

// -- 10. sidecar insensitivity ----------------------------------

test('sidecar insensitivity: graphDelta/revivals disagreeing '
+ 'with graph derives from graph alone', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-sidecar';

    // A shape no real client ever sends: `graph` claims ONE
    // node while `graphDelta` upserts a DIFFERENT one and
    // `revivals` restores an unrelated entity —
    // validateFlowDocumentBody never cross-checks the sidecars
    // against `graph` (they are independent fields), so this is
    // a legal below-gate write. Phase Final Task 2: derive and
    // wire both track `graph` alone; graphDelta only feeds
    // deriveFlowGraphStates (SIDECAR-KEEP), not the working
    // graph.
    const graph = graphJson(
        [wireNode('sidecar-graph-node', 'Graph Node')], [],
    );
    const res = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token, {
            ...flowFields('Sidecar Flow'),
            state: 'active',
            state_at: AT,
            state_event_id: 'flow-drift-sidecar-ev',
            graph,
            graphDelta: {
                ...emptyDelta(),
                nodes: [deltaNode(
                    'sidecar-delta-node', flowId,
                    'Delta Node', false, AT,
                )],
            },
            revivals: [{
                eventId: 'flow-drift-sidecar-restore',
                entityId: 'some-unrelated-entity', at: AT,
            }],
        },
    ));
    assert.equal(res.status, 200);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const derivedNodes = (JSON.parse(derived.graph) as {
        nodes: { id: string }[];
    }).nodes;
    assert.deepEqual(
        derivedNodes.map((n) => n.id), ['sidecar-graph-node'],
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    assertWireEqualsDerived(wireText, derived);
    // graphDelta node never becomes the working graph head.
    assert.equal(
        derivedNodes.some(
            (n) => n.id === 'sidecar-delta-node',
        ),
        false,
    );
});

// -- 11. the Follows-chain terminal -----------------------------

test('the Follows chain terminal reaches exactly the derived '
+ 'head pair id', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-follows-chain';

    const genesis = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody('Genesis', 'flow-drift-follows-genesis'),
    ));
    assert.equal(genesis.status, 200);
    const genesisId = genesis.headers.get('Response-ID')!;
    let headId = genesisId;

    const saveCount = 4; // N >= 3 sequential saves beyond genesis
    for (let i = 0; i < saveCount; i++) {
        const saved = await handleRequest(db, req(
            'PUT', '/flows/' + flowId, token,
            documentBody(
                'Save ' + i, 'flow-drift-follows-ev-' + i,
            ),
            { 'if-response-id': headId },
        ));
        assert.equal(saved.status, 200);
        assert.equal(saved.headers.get('Follows'), headId);
        headId = saved.headers.get('Response-ID')!;
    }

    // Walk the stored follows chain from genesis: the chain's
    // own terminal must be exactly the head the derivation
    // resolves to.
    const responses = await db.responses.getAll();
    let cursor = genesisId;
    let steps = 0;
    for (;;) {
        const next = responses.find((r) => r.follows === cursor);
        if (next === undefined) break;
        cursor = next.id;
        steps++;
    }
    assert.equal(steps, saveCount);

    const headPairId = await derivedHeadPairId(
        db, STARK_ORGANIZATION, flowId,
    );
    assert.equal(cursor, headPairId);
    assert.equal(cursor, headId);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    assert.equal(derived.name, 'Save ' + (saveCount - 1));
});

// -- 12. a live multi-member, multi-attribute node save --------

test('a live multi-member, multi-attribute node save derives '
+ 'content-identically on wire and derive (order-independent)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-multi-node';
    const nodeId = 'multi-node-1';

    // Deliberately reverse-alphabetical in `graph` and the
    // OPPOSITE order in the storage-shaped delta events.
    const graph = graphJson(
        [wireNode(
            nodeId, 'Multi Node', false,
            ['zz-member', 'aa-member'],
            [
                {
                    attribute_id: 'zz-attr', mode: 'editable',
                    isRequired: true,
                },
                {
                    attribute_id: 'aa-attr', mode: 'readonly',
                    isRequired: false,
                },
            ],
        )],
        [],
    );
    const graphDelta = {
        nodes: [deltaNode(nodeId, flowId, 'Multi Node', false, AT)],
        edges: [],
        deletions: [],
        memberEvents: [
            deltaMember(
                'multi-node-1-fnm-aa', nodeId, 'aa-member', AT,
            ),
            deltaMember(
                'multi-node-1-fnm-zz', nodeId, 'zz-member', AT,
            ),
        ],
        attributeEvents: [
            deltaAttribute(
                'multi-node-1-fna-aa', nodeId, 'aa-attr',
                'readonly', false, AT,
            ),
            deltaAttribute(
                'multi-node-1-fna-zz', nodeId, 'zz-attr',
                'editable', true, AT,
            ),
        ],
    };

    const res = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token, {
            ...flowFields('Multi-Member Flow'),
            state: 'active', state_at: AT,
            state_event_id: 'flow-drift-multi-node-ev',
            graph, graphDelta, revivals: [],
        },
    ));
    assert.equal(res.status, 200);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    assertWireEqualsDerived(wireText, derived);
    // Graph content preserves both members/attrs regardless
    // of insertion order (normalizedGraph order-independence
    // still applies on the pair plane).
    const nodes = (JSON.parse(derived.graph) as {
        nodes: {
            id: string;
            memberIds: string[];
            attributes: { attribute_id: string }[];
        }[];
    }).nodes;
    const node = nodes.find((n) => n.id === nodeId)!;
    assert.deepEqual(
        [...node.memberIds].sort(),
        ['aa-member', 'zz-member'],
    );
    assert.deepEqual(
        node.attributes.map((a) => a.attribute_id).sort(),
        ['aa-attr', 'zz-attr'],
    );
});

// -- 13. same-join-id retry: the join stays chain-less ----------
// (Phase 9 Task 2 Step 0(d') pin, additive and pass-first against
// HEAD: the create route's join pair hardcodes headPairId:
// undefined by design — no head-read at all — so a SECOND,
// genuinely different create [a fresh flow id, a fresh operation]
// that happens to reuse a prior create's project-flow id still
// appends a chain-less join pair, never a Supersedes onto the
// first. Pinned BEFORE the shared former absorbs this site, so a
// future uniform head-read regresses here first.)

test('same-join-id retry: two different flow creates reusing '
+ 'one project-flow id each append a chain-less join pair '
+ '(neither Supersedes nor Follows)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = l2cProjectId;
    const sharedPfid = 'flow-drift-retry-pf-shared';

    const first = await createFlow(
        db, token, 'flow-drift-retry-a', sharedPfid, projectId,
        'flow-drift-retry-ev-a',
    );
    assert.equal(first.status, 204);

    // A DIFFERENT flow, a DIFFERENT operation (fresh event id) —
    // not a byte-identical resend, which would replay via the E6
    // fast path and append no second pair at all.
    const second = await createFlow(
        db, token, 'flow-drift-retry-b', sharedPfid, projectId,
        'flow-drift-retry-ev-b',
    );
    assert.equal(second.status, 204);

    const joinPrefix = canonicalUriPrefix(
        STARK_ORGANIZATION,
        '/projects/' + projectId + '/flows/',
    );
    const joinResponses = (await db.responses.getAllWhere(
        'uri_id', sharedPfid,
    )).filter((row) => row.uri_prefix === joinPrefix);
    assert.equal(joinResponses.length, 2);
    for (const response of joinResponses) {
        assert.equal(response.supersedes, undefined);
        assert.equal(response.follows, undefined);
    }
});
