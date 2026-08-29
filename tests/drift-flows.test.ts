import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { seedIdentifier } from
    '../api/mock-data/seed-kit.ts';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
import type {
    FlowWithGraph,
} from '../api/types.ts';
import { DEFAULT_LOCK_TIMEOUT } from
    '../api/types.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import { l2cProjectId } from '../api/mock-data/projects.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { canonicalUriCollection } from '../api/message-pair.ts';
import { deriveDocumentsAt } from '../api/derive-documents.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveFlow,
    deriveFlows,
    deriveFlowStateHistory,
} from '../api/derive-flows.ts';
import { deriveProjectFlows } from
    '../api/derive-project-flows.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

const SEED_FLOW_ORGANIZATION_TWO = seedIdentifier('seed-flow-org2');
const FLOW_DRIFT_JOIN = generateIdentifier();
const FLOW_DRIFT_DUP_EV_A = generateIdentifier();
const FLOW_DRIFT_DUP_EV_B = generateIdentifier();
const FLOW_DRIFT_METHOD_FILTER = generateIdentifier();
const SIDECAR_GRAPH_NODE = generateIdentifier();
const FLOW_DRIFT_SIDECAR_EV = generateIdentifier();
const SIDECAR_DELTA_NODE = generateIdentifier();
const FLOW_DRIFT_SIDECAR_RESTORE = generateIdentifier();
const SOME_UNRELATED_ENTITY = generateIdentifier();
const FLOW_DRIFT_LOCK_HEAD_CHAIN = generateIdentifier();
const FLOW_DRIFT_LOCK_HEAD_GENESIS = generateIdentifier();
const ZZ_MEMBER = generateIdentifier();
const AA_MEMBER = generateIdentifier();
const ZZ_ATTR = generateIdentifier();
const AA_ATTR = generateIdentifier();
const MULTI_NODE_1_FNM_AA = generateIdentifier();
const MULTI_NODE_1_FNM_ZZ = generateIdentifier();
const MULTI_NODE_1_FNA_AA = generateIdentifier();
const MULTI_NODE_1_FNA_ZZ = generateIdentifier();
const FLOW_DRIFT_MULTI_NODE_EV = generateIdentifier();
const FLOW_DRIFT_RETRY_PF_SHARED = generateIdentifier();
const FLOW_DRIFT_RETRY_A = generateIdentifier();
const FLOW_DRIFT_RETRY_EV_A = generateIdentifier();
const FLOW_DRIFT_RETRY_B = generateIdentifier();
const FLOW_DRIFT_RETRY_EV_B = generateIdentifier();
const FLOWID_SAVE = generateIdentifier();
const FLOWID_VERSIONED = generateIdentifier();
const FLOWID_DELETE_NODE = generateIdentifier();
const FLOWID_DEL_N2 = generateIdentifier();
const FLOWID_DEL_E1 = generateIdentifier();
const FLOWID_UNDO_EV = generateIdentifier();
const FLOWID_REDO = generateIdentifier();
const FLOWID_REDO_DEL_N2 = generateIdentifier();
const FLOWID_REDO_DEL_E1 = generateIdentifier();
const FLOWID_TOMB = generateIdentifier();
const FLOWID_PF = generateIdentifier();
const FLOWID_EV = generateIdentifier();

// Phase Final Task 2: flows(+graph relations+flow_versions)
// dual-write stripped. This file no longer compares derive
// vs old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions
// and non-lexical live fixtures.

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
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
) {
    return { nodes, edges };
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
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert.ok(id
        , 'no Response-ID on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + '' + flowId);
    return id!;
}

async function headEtag(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const tag = got.headers.get('ETag');
    assert.ok(tag
        , 'no ETag on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + flowId);
    return tag!;
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
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
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
// JSON.stringify(derive) for message-plane oracles.
async function wireFlowText(
    db: MemoryDbAdapter,
    organization: string,
    flowId: string,
): Promise<string> {
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + organization
                + '/flows/' + flowId,
            token,
        ),
    );
    assert.equal(res.status, 200);
    return res.text();
}

async function wireFlowsText(
    db: MemoryDbAdapter,
    organization: string,
): Promise<string> {
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + organization + '/flows/',
            token,
        ),
    );
    assert.equal(res.status, 200);
    return res.text();
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
async function derivedHeadMessagePairId(
    db: MemoryDbAdapter, organization: string, flowId: string,
): Promise<string> {
    const prefix = canonicalUriCollection(organization, '/flows/');
    const [requests] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', prefix),
        db.messagePairs.getAllWhere('uri_collection', prefix),
    ]);
    const documents = deriveDocumentsAt(requests, prefix);
    const document = documents.get(flowId);
    assert.ok(document, 'no derived document for ' + flowId);
    return document!.messagePairId;
}

// Every seeded flow's own id, paired with the org the seed
// actually stamped it into: buildFlows() (4 rows) all land on
// STARK_ORGANIZATION; the 5th is org 'BBjWJsjYIDkTRKIIPrzWRw's own flow (Task
// 6's
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
        id: SEED_FLOW_ORGANIZATION_TWO,
        organization: ORGANIZATION_TWO,
    },
];

// The project ids mockProjectFlows.ts joins a seeded flow to —
// 'wqGTTFdYUGnmBxWCppmkOQ' carries TWO (Customer Onboarding AND
// Layout Test), the multi-row ordering case.
const TWO_FLOWS_PROJECT_ID = 'wqGTTFdYUGnmBxWCppmkOQ';
const SEEDED_PROJECT_FLOW_PROJECT_IDS = [
    TWO_FLOWS_PROJECT_ID,
    'kAxUZTXdcMCAttuoyCdSYA',
    l2cProjectId,
];

// -- 1. seeded GET /flows wire equals deriveFlows -------------

test('seeded GET /flows wire equals deriveFlows per org',
async () => {
    const db = await seededDb();
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
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
        (seed) => seed.organization === 'AjdvjuECVZEgZoFajaIEkg',
    )!;
    const otherOrganization = 'BBjWJsjYIDkTRKIIPrzWRw';
    await assert.rejects(
        () => deriveFlow(db, otherOrganization, foreign.id),
        EntityNotFoundError,
    );
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', otherOrganization,
    );
    const res = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + otherOrganization
                + '/flows/' + foreign.id,
            token,
        ),
    );
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: flows/' + foreign.id,
    );
});

// -- 4. state-history parity, every seeded flow ----------------

test('state-history parity across every seeded flow',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_FLOWS) {
        const derived = await deriveFlowStateHistory(
            db, organization, id,
        );
        // Family history is the sole live oracle (C2).
        assert.ok(Array.isArray(derived));
    }
});

// -- 5. project-flows wire equals derive (Phase Final Task 2:
// -- project_flows row half stripped) --------------------------

test('project-flows wire equals derive across every'
+ ' seeded project', async () => {
    const db = await seededDb();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    for (const projectId of SEEDED_PROJECT_FLOW_PROJECT_IDS) {
        const res = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + projectId +
                '/flows/', token,
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
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + TWO_FLOWS_PROJECT_ID + '/flows/',
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
    const flowId = generateIdentifier();
    const projectId = l2cProjectId;

    const n1 = generateIdentifier();
    const n2 = generateIdentifier();
    const YiJPbufDpkyrZcZCYbUJpg = generateIdentifier();
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
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: flowId,
            flow: flowFields('Chain Flow'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: genesisAt,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: genesisAt,
            graphDelta: {
                nodes: [
                    deltaNode(n1, flowId, 'Create', true,
                        genesisAt),
                    deltaNode(n2, flowId, 'Review', false,
                        genesisAt),
                ],
                edges: [
                    deltaEdge(YiJPbufDpkyrZcZCYbUJpg, flowId, 'begin', n1, n2,
                        genesisAt),
                ],
                deletions: [], memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(created.status, 201);
    let derived = await assertStep();

    const fullGraph = graphJson(
        [wireNode(n1, 'Create', true), wireNode(n2, 'Review')],
        [wireEdge(YiJPbufDpkyrZcZCYbUJpg, 'begin', n1, n2)],
    );

    // Plain save: rename only, no graph change.
    await headResponseId(db, token, flowId);
    const saveAt = '2026-03-02T00:00:00.000000Z';
    const saved = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody('Chain Flow Saved', FLOWID_SAVE, {
            state_at: saveAt, graph: fullGraph,
        }),
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(saved.status, 201);
    derived = await assertStep();

    // Further save (versions POST retired Phase 15 Task 7).
    const versionAt = '2026-03-03T00:00:00.000000Z';
    const versionedSave = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody(
            'Chain Flow Versioned', FLOWID_VERSIONED, {
                state_at: versionAt, graph: fullGraph,
            },
        ),
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(versionedSave.status, 201);
    derived = await assertStep();

    // Node delete via save: n2 and YiJPbufDpkyrZcZCYbUJpg are tombstoned.
    const deleteAt = '2026-03-04T00:00:00.000000Z';
    const deletedGraph = graphJson(
        [wireNode(n1, 'Create', true)], [],
    );
    const deletedSave = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody(
            'Chain Flow Trimmed', FLOWID_DELETE_NODE, {
                state_at: deleteAt, graph: deletedGraph,
                graphDelta: {
                    ...emptyDelta(),
                    deletions: [
                        {
                            eventId: FLOWID_DEL_N2,
                            entityId: n2, at: deleteAt,
                        },
                        {
                            eventId: FLOWID_DEL_E1,
                            entityId: YiJPbufDpkyrZcZCYbUJpg, at: deleteAt,
                        },
                    ],
                },
            },
        ),
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(deletedSave.status, 201);
    derived = await assertStep();
    assert.equal(
        (derived.graph as { nodes: { id: string }[] })
            .nodes.length,
        1,
    );

    // Undo-as-replay: reverts to Versioned (fullGraph).
    const undoAt = '2026-03-05T00:00:00.000000Z';
    const undone = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/undo', token, {
            eventId: FLOWID_UNDO_EV,
            at: undoAt,
        },
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(undone.status, 201);
    await headResponseId(db, token, flowId);
    derived = await assertStep();
    assert.equal(
        (derived.graph as { nodes: { id: string }[] })
            .nodes.some((n) => n.id === n2),
        true,
        'the revived node must be visible on the message plane',
    );

    // Redo-as-save: re-apply the node deletion.
    const redoAt = '2026-03-06T00:00:01.000000Z';
    const redone = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody('Chain Flow Redone', FLOWID_REDO, {
            state_at: redoAt, graph: deletedGraph,
            graphDelta: {
                ...emptyDelta(),
                deletions: [
                    {
                        eventId: FLOWID_REDO_DEL_N2,
                        entityId: n2, at: redoAt,
                    },
                    {
                        eventId: FLOWID_REDO_DEL_E1,
                        entityId: YiJPbufDpkyrZcZCYbUJpg, at: redoAt,
                    },
                ],
            },
        }),
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(redone.status, 201);
    derived = await assertStep();

    // Terminal: a state-'deleted' document PUT — vanishes from
    // list, 404s on GET and derive.
    const tombstoneAt = '2026-03-07T00:00:00.000000Z';
    const tombstoned = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody('Chain Flow Deleted', FLOWID_TOMB, {
            state: 'deleted', state_at: tombstoneAt,
            graph: deletedGraph,
        }),
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(tombstoned.status, 201);

    await assert.rejects(
        () => deriveFlow(db, STARK_ORGANIZATION, flowId),
        EntityNotFoundError,
    );
    const gone = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token),
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
    assert.ok(derivedHistory.length >= 0);
});

// -- 7. live join-row chain: PUT appears, DELETE vanishes ------

test('live join-row chain: PUT appears on wire/derive, '
+ 'DELETE removes it from both', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = l2cProjectId;
    const pfid = generateIdentifier();
    const listPath = '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
        + projectId + '/flows/';

    const putRes = await handleRequest(db, req(
        'PUT', listPath + pfid,
        token,
        {
            project_id: projectId,
            flow_id: FLOW_DRIFT_JOIN,
            at: AT,
        },
    ));
    assert.equal(putRes.status, 201);

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
        listPath + pfid, token,
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
    const flowId = generateIdentifier();
    const projectId = l2cProjectId;
    const pfidA = generateIdentifier();
    const pfidB = generateIdentifier();

    const first = await createFlow(
        db, token, flowId, pfidA, projectId,
        FLOW_DRIFT_DUP_EV_A,
    );
    assert.equal(first.status, 201);
    const second = await createFlow(
        db, token, flowId, pfidB, projectId,
        FLOW_DRIFT_DUP_EV_B,
    );
    // The create op holds no echo of its own — a duplicate
    // create succeeds outright, never 412ing.
    assert.equal(second.status, 201);

    // ONE flow head on wire/derive — the derived head is the
    // (at, id) winner, the second create's own document message pair.
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
    assert.ok(derivedHistory.length >= 0);
    assert.equal(derivedHistory.length, 2);

    // TWO join rows on wire and derive (Phase Final Task 2:
    // project_flows row half stripped).
    const joinsRes = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId + '/flows/', token,
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

test('the create-op POST pair is not read as a document'
+ ' message pair (the method-filter proof at drift altitude)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = FLOW_DRIFT_METHOD_FILTER;

    const created = await createFlow(
        db, token, flowId, FLOWID_PF, l2cProjectId,
        FLOWID_EV,
    );
    assert.equal(created.status, 201);

    const requests = await db.messagePairs.getAll();
    const atAddress = requests.filter(
        (r) => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
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
    const flowId = generateIdentifier();

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
        [wireNode(SIDECAR_GRAPH_NODE, 'Graph Node')], [],
    );
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            , token, {
            ...flowFields('Sidecar Flow'),
            state: 'active',
            state_at: AT,
            state_event_id: FLOW_DRIFT_SIDECAR_EV,
            graph,
            graphDelta: {
                ...emptyDelta(),
                nodes: [deltaNode(
                    SIDECAR_DELTA_NODE, flowId,
                    'Delta Node', false, AT,
                )],
            },
            revivals: [{
                eventId: FLOW_DRIFT_SIDECAR_RESTORE,
                entityId: SOME_UNRELATED_ENTITY, at: AT,
            }],
        },
    ));
    assert.equal(res.status, 201);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const derivedNodes = (derived.graph as {
        nodes: { id: string }[];
    }).nodes;
    assert.deepEqual(
        derivedNodes.map((n) => n.id), [SIDECAR_GRAPH_NODE],
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    assertWireEqualsDerived(wireText, derived);
    // graphDelta node never becomes the working graph head.
    assert.equal(
        derivedNodes.some(
            (n) => n.id === SIDECAR_DELTA_NODE,
        ),
        false,
    );
});

// -- 11. the Follows-chain terminal -----------------------------

test('the lock-head terminal reaches exactly the derived '
+ 'head pair id', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = FLOW_DRIFT_LOCK_HEAD_CHAIN;

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody('Genesis', FLOW_DRIFT_LOCK_HEAD_GENESIS),
    ));
    assert.equal(genesis.status, 201);
    const genesisId = genesis.headers.get('Response-ID')!;
    let headId = genesisId;

    const saveCount = 4; // N >= 3 sequential saves beyond genesis
    for (let i = 0; i < saveCount; i++) {
        const saved = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
                , token,
            documentBody(
                'Save ' + i, generateIdentifier(),
            ),
            { 'if-match': await headEtag(db, token, flowId) },
        ));
        assert.equal(saved.status, 201);
        assert.equal(saved.headers.get('Follows'), null);
        headId = saved.headers.get('Response-ID')!;
    }

    const headMessagePairId = await derivedHeadMessagePairId(
        db, STARK_ORGANIZATION, flowId,
    );
    assert.equal(headId, headMessagePairId);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    assert.equal(derived.name, 'Save ' + (saveCount - 1));
    assert.notEqual(headId, genesisId);
});

// -- 12. a live multi-member, multi-attribute node save --------

test('a live multi-member, multi-attribute node save derives '
+ 'content-identically on wire and derive (order-independent)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const nodeId = generateIdentifier();

    // Deliberately reverse-alphabetical in `graph` and the
    // OPPOSITE order in the storage-shaped delta events.
    const graph = graphJson(
        [wireNode(
            nodeId, 'Multi Node', false,
            [ZZ_MEMBER, AA_MEMBER],
            [
                {
                    attribute_id: ZZ_ATTR, mode: 'editable',
                    isRequired: true,
                },
                {
                    attribute_id: AA_ATTR, mode: 'readonly',
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
                MULTI_NODE_1_FNM_AA, nodeId, AA_MEMBER, AT,
            ),
            deltaMember(
                MULTI_NODE_1_FNM_ZZ, nodeId, ZZ_MEMBER, AT,
            ),
        ],
        attributeEvents: [
            deltaAttribute(
                MULTI_NODE_1_FNA_AA, nodeId, AA_ATTR,
                'readonly', false, AT,
            ),
            deltaAttribute(
                MULTI_NODE_1_FNA_ZZ, nodeId, ZZ_ATTR,
                'editable', true, AT,
            ),
        ],
    };

    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            , token, {
            ...flowFields('Multi-Member Flow'),
            state: 'active', state_at: AT,
            state_event_id: FLOW_DRIFT_MULTI_NODE_EV,
            graph, graphDelta, revivals: [],
        },
    ));
    assert.equal(res.status, 201);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    assertWireEqualsDerived(wireText, derived);
    // Graph content preserves both members/attrs regardless
    // of insertion order (normalizedGraph order-independence
    // still applies on the message plane).
    const nodes = (derived.graph as {
        nodes: {
            id: string;
            memberIds: string[];
            attributes: { attribute_id: string }[];
        }[];
    }).nodes;
    const node = nodes.find((n) => n.id === nodeId)!;
    assert.deepEqual(
        [...node.memberIds].sort(),
        [AA_MEMBER, ZZ_MEMBER].sort(),
    );
    assert.deepEqual(
        node.attributes.map((a) => a.attribute_id).sort(),
        [AA_ATTR, ZZ_ATTR].sort(),
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
    const sharedPfid = FLOW_DRIFT_RETRY_PF_SHARED;

    const first = await createFlow(
        db, token, FLOW_DRIFT_RETRY_A, sharedPfid, projectId,
        FLOW_DRIFT_RETRY_EV_A,
    );
    assert.equal(first.status, 201);

    // A DIFFERENT flow, a DIFFERENT operation (fresh event id) —
    // not a byte-identical resend, which would replay via the E6
    // fast path and append no second pair at all.
    const second = await createFlow(
        db, token, FLOW_DRIFT_RETRY_B, sharedPfid, projectId,
        FLOW_DRIFT_RETRY_EV_B,
    );
    assert.equal(second.status, 201);

    const joinPrefix = canonicalUriCollection(
        STARK_ORGANIZATION,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            + '/flows/',
    );
    const joinResponses = await db.messagePairs.getAllAtAddress(
        joinPrefix, sharedPfid,
    );
    assert.equal(joinResponses.length, 2);
    for (const response of joinResponses) {
        assert.equal('supersedes' in response, false);
        assert.equal('follows' in response, false);
    }
});
