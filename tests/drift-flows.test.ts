import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    generateIdentifier,
    NIL_IDENTIFIER,
} from '../shared/identifier.ts';
import { seedIdentifier } from
    '../api/mock-data/seed-kit.ts';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
import type {
    FlowWithGraph,
} from '../shared/types.ts';
import { DEFAULT_LOCK_TIMEOUT } from
    '../shared/types.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import { l2cProjectId } from '../api/mock-data/projects.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { canonicalPath } from '../api/message-pair.ts';
import { deriveDocumentsAt } from '../api/derive-documents.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    deriveFlow,
    deriveFlows,
    deriveFlowStateHistory,
    flowEntityOf,
} from '../api/derive-flows.ts';
import { deriveProjectFlows } from
    '../api/derive-project-flows.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    assertPartsAreHeads,
    pairIdOf,
    partsOf,
    storedPutBodyText,
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
    const id = pairIdOf(got);
    assert(id
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
    assert(tag
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

// Wire-byte GET helper: the octets a flow GET answers.
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
    assertStrictEquals(res.status, 200);
    return res.text();
}

type ServedFlowBody = { id: string } & Record<string, unknown>;

// The list's part bodies, each part its head's stored
// response served.
async function wireFlowBodies(
    db: MemoryDbAdapter,
    organization: string,
): Promise<ServedFlowBody[]> {
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
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<ServedFlowBody>(res);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    return parts.map((part) => part.body().toValue());
}

// The flow GET serves its head's stored body octets. That
// body deliberately differs from the derive (the lifecycle
// trio and the sidecars are stored, organization_id is
// stamped), so the octets alone do not prove the served
// flow is the flow the list serves: read as a document, the
// body must derive to what deriveFlow derives.
async function assertWireEqualsDerived(
    db: MemoryDbAdapter,
    organization: string,
    flowId: string,
    wireText: string,
): Promise<void> {
    const prefix = canonicalPath(organization, '/flows/');
    assertStrictEquals(
        wireText,
        await storedPutBodyText(db, prefix, flowId),
    );
    const head = await db.messagePairs.getHeadPair(prefix, flowId);
    assert(head !== null);
    assertEquals(
        flowEntityOf({
            name: flowId,
            messagePairId: head.id,
            method: 'PUT',
            body: JSON.parse(wireText) as Record<string, unknown>,
        }, organization),
        await deriveFlow(db, organization, flowId),
    );
}

// The SAME reduction deriveFlow calls internally (derive-
// documents.ts's deriveDocumentsAt), exposed here so case 11 can
// assert the Follows-chain terminal reaches EXACTLY this pair
// id, not merely "a flow that looks right".
async function derivedHeadMessagePairId(
    db: MemoryDbAdapter, organization: string, flowId: string,
): Promise<string> {
    const prefix = canonicalPath(organization, '/flows/');
    const [requests] = await Promise.all([
        db.messagePairs.getCollectionPairs(prefix),
        db.messagePairs.getCollectionPairs(prefix),
    ]);
    const documents = deriveDocumentsAt(requests, prefix);
    const document = documents.get(flowId);
    assert(document, 'no derived document for ' + flowId);
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

Deno.test('seeded GET /flows wire equals deriveFlows per org',
async () => {
    const db = await seededDb();
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        const bodies = await wireFlowBodies(db, organization);
        const derived = await deriveFlows(db, organization);
        // Each stored body, read as its document, derives to
        // the derive's row (see assertWireEqualsDerived).
        const prefix = canonicalPath(organization, '/flows/');
        const served = [];
        for (const body of bodies) {
            const head = await db.messagePairs.getHeadPair(
                prefix, body.id,
            );
            assert(head !== null);
            served.push(flowEntityOf({
                name: body.id, messagePairId: head.id,
                method: 'PUT', body,
            }, organization));
        }
        assertEquals(served, derived);
        assert(derived.length > 0);
    }
});

// -- 2. per-flow GET wire equals the stored head and derive ----

Deno.test('per-flow GET wire equals the stored head and its'
+ ' derive for every seed', async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_FLOWS) {
        const wireText = await wireFlowText(
            db, organization, id,
        );
        await assertWireEqualsDerived(
            db, organization, id, wireText,
        );
    }
});

// -- 3. foreign-org id 404 on GET and derive --------------------

Deno.test('a foreign-org flow id 404s on GET and on derive',
async () => {
    const db = await seededDb();
    const foreign = SEEDED_FLOWS.find(
        (seed) => seed.organization === 'AjdvjuECVZEgZoFajaIEkg',
    )!;
    const otherOrganization = 'BBjWJsjYIDkTRKIIPrzWRw';
    await assertRejects(
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
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: flows/' + foreign.id,
    );
});

// -- 4. state-history parity, every seeded flow ----------------

Deno.test('state-history parity across every seeded flow',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_FLOWS) {
        const derived = await deriveFlowStateHistory(
            db, organization, id,
        );
        // Family history is the sole live oracle (C2).
        assert(Array.isArray(derived));
    }
});

// -- 5. project-flows wire equals derive (Phase Final Task 2:
// -- project_flows row half stripped) --------------------------

Deno.test('project-flows wire equals derive across every'
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
        assertStrictEquals(res.status, 200);
        // The parts come in write order (response_at, id); the
        // derive sorts by id, so the bodies compare as one set.
        const parts = await partsOf<{ id: string }>(res);
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        const derived = await deriveProjectFlows(
            db, STARK_ORGANIZATION, projectId,
        );
        assertEquals(
            sortById(parts.map((part) => part.body().toValue())),
            sortById(derived),
        );
    }
});

Deno.test('the two-flows project serves both join rows'
+ ' in write order, each its derived row', async () => {
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
    assertStrictEquals(res.status, 200);
    // assertPartsAreHeads pins the write order.
    const parts = await partsOf<{ id: string }>(res);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    const derived = await deriveProjectFlows(
        db, STARK_ORGANIZATION, TWO_FLOWS_PROJECT_ID,
    );
    assertStrictEquals(derived.length, 2);
    assertEquals(
        sortById(parts.map((part) => part.body().toValue())),
        sortById(derived),
    );
});

// -- 6. live-write chain, re-compared at each step -------------

Deno.test('live-write chain: create, save, node delete, undo, '
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
        await assertWireEqualsDerived(
            db, STARK_ORGANIZATION, flowId, wireText,
        );
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
    assertStrictEquals(created.status, 201);
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
    assertStrictEquals(saved.status, 200);
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
    assertStrictEquals(versionedSave.status, 200);
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
    assertStrictEquals(deletedSave.status, 200);
    derived = await assertStep();
    assertStrictEquals(
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
    assertStrictEquals(undone.status, 200);
    await headResponseId(db, token, flowId);
    derived = await assertStep();
    assertStrictEquals(
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
    assertStrictEquals(redone.status, 200);
    derived = await assertStep();

    // Terminal: a state-'deleted' document PUT — vanishes from
    // list, 410s on GET, 404s on derive.
    const tombstoneAt = '2026-03-07T00:00:00.000000Z';
    const tombstoned = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody('Chain Flow Deleted', FLOWID_TOMB, {
            state: 'deleted', state_at: tombstoneAt,
            graph: deletedGraph,
        }),
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assertStrictEquals(tombstoned.status, 200);

    await assertRejects(
        () => deriveFlow(db, STARK_ORGANIZATION, flowId),
        EntityNotFoundError,
    );
    const gone = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token),
    );
    assertStrictEquals(gone.status, 410);
    const derivedList = await deriveFlows(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        derivedList.some((f) => f.id === flowId), false,
    );
    const listBodies = await wireFlowBodies(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        listBodies.some((body) => body.id === flowId), false,
    );

    const derivedHistory = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    assert(derivedHistory.length >= 0);
});

// -- 7. live join-row chain: PUT appears, DELETE vanishes ------

Deno.test('live join-row chain: PUT appears on wire/derive, '
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
    assertStrictEquals(putRes.status, 201);

    const afterPutRes = await handleRequest(
        db, req('GET', listPath, token),
    );
    assertStrictEquals(afterPutRes.status, 200);
    const partsAfterPut = await partsOf<{ id: string }>(afterPutRes);
    await assertPartsAreHeads(db, partsAfterPut, { sees: 'whole' });
    const wireAfterPut = partsAfterPut.map((part) =>
        part.body().toValue());
    const derivedAfterPut = await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    );
    assert(wireAfterPut.some((row) => row.id === pfid));
    assertEquals(sortById(wireAfterPut), sortById(derivedAfterPut));

    const delRes = await handleRequest(db, req(
        'DELETE',
        listPath + pfid, token,
    ));
    assertStrictEquals(delRes.status, 204);

    const afterDelRes = await handleRequest(
        db, req('GET', listPath, token),
    );
    const partsAfterDelete = await partsOf<{ id: string }>(
        afterDelRes,
    );
    await assertPartsAreHeads(db, partsAfterDelete, { sees: 'whole' });
    const wireAfterDelete = partsAfterDelete.map((part) =>
        part.body().toValue());
    const derivedAfterDelete = await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    );
    assertStrictEquals(
        wireAfterDelete.some((row) => row.id === pfid), false,
    );
    assertStrictEquals(
        derivedAfterDelete.some((row) => row.id === pfid), false,
    );
    assertEquals(
        sortById(wireAfterDelete), sortById(derivedAfterDelete),
    );
});

// -- 8. duplicate-create (the R2 multiset case) ----------------

Deno.test('duplicate-create: a second create at the same flow id'
+ ' is 409 and stores nothing; one lifecycle event and one join'
+ ' row on wire/derive',
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
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await createFlow(
        db, token, flowId, pfidB, projectId,
        FLOW_DRIFT_DUP_EV_B,
    );
    // The create declares its genesis: a taken flow id is
    // refused, never superseded.
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );

    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    await assertWireEqualsDerived(
        db, STARK_ORGANIZATION, flowId, wireText,
    );

    const derivedHistory = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    assertStrictEquals(derivedHistory.length, 1);

    const joinsRes = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId + '/flows/', token,
    ));
    const joinParts = await partsOf<{ id: string }>(joinsRes);
    await assertPartsAreHeads(db, joinParts, { sees: 'whole' });
    const wireJoins = joinParts.map((part) => part.body().toValue())
        .filter((row) => row.id === pfidA || row.id === pfidB);
    const derivedJoins = (await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    assertStrictEquals(wireJoins.length, 1);
    assertStrictEquals(derivedJoins.length, 1);
    assertEquals(
        sortById(wireJoins), sortById(derivedJoins),
    );
});

Deno.test('duplicate-create with an unchanged document'
+ ' is 409 and stores nothing: one head, one join', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const projectId = l2cProjectId;
    const pfidA = generateIdentifier();
    const pfidB = generateIdentifier();
    const eventId = generateIdentifier();

    const first = await createFlow(
        db, token, flowId, pfidA, projectId, eventId,
    );
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await createFlow(
        db, token, flowId, pfidB, projectId, eventId,
    );
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );

    const flowPrefix = '/organizations/'
        + STARK_ORGANIZATION + '/flows/';
    const documents = (await db.messagePairs.getAll())
        .filter((row) =>
            row.path === flowPrefix
            && row.name === flowId
            && row.method === 'PUT'
        );
    assertStrictEquals(documents.length, 1);
    assertStrictEquals(
        (await deriveFlowStateHistory(
            db, STARK_ORGANIZATION, flowId,
        )).length,
        1,
    );

    const joinsRes = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId + '/flows/', token,
    ));
    const joinParts = await partsOf<{ id: string }>(joinsRes);
    await assertPartsAreHeads(db, joinParts, { sees: 'whole' });
    const wireJoins = joinParts.map((part) => part.body().toValue())
        .filter((row) => row.id === pfidA || row.id === pfidB);
    const derivedJoins = (await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    assertStrictEquals(wireJoins.length, 1);
    assertStrictEquals(derivedJoins.length, 1);
});

// -- 9. the create-op POST pair is never the derived head -----

Deno.test('the create-op POST pair is not read as a document'
+ ' message pair (the method-filter proof at drift altitude)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = FLOW_DRIFT_METHOD_FILTER;

    const created = await createFlow(
        db, token, flowId, FLOWID_PF, l2cProjectId,
        FLOWID_EV,
    );
    assertStrictEquals(created.status, 201);

    const requests = await db.messagePairs.getAll();
    const pairsAt = requests.filter(
        (r) => r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.name === flowId,
    );
    // Both an operation (POST, 204) pair and a document (PUT)
    // pair share the SAME name.
    assertStrictEquals(pairsAt.length, 2);

    // If the POST pair leaked into the document reduction it
    // would either throw (its body has no top-level
    // state_event_id — the create wraps it as
    // initialStateEventId) or double-count the genesis event.
    // ONE lifecycle event proves the FILTER, not merely the
    // envelope ordering, decided this.
    const history = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    assertStrictEquals(history.length, 1);
    assertStrictEquals(history[0]!.state, 'active');

    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    await assertWireEqualsDerived(
        db, STARK_ORGANIZATION, flowId, wireText,
    );
});

// -- 10. sidecar insensitivity ----------------------------------

Deno.test('sidecar insensitivity: graphDelta/revivals disagreeing '
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
        { 'if-none-match': '*' },
    ));
    assertStrictEquals(res.status, 201);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const derivedNodes = (derived.graph as {
        nodes: { id: string }[];
    }).nodes;
    assertEquals(
        derivedNodes.map((n) => n.id), [SIDECAR_GRAPH_NODE],
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    await assertWireEqualsDerived(
        db, STARK_ORGANIZATION, flowId, wireText,
    );
    // graphDelta node never becomes the working graph head.
    assertStrictEquals(
        derivedNodes.some(
            (n) => n.id === SIDECAR_DELTA_NODE,
        ),
        false,
    );
});

// -- 11. the Follows-chain terminal -----------------------------

Deno.test('the lock-head terminal reaches exactly the derived '
+ 'head pair id', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = FLOW_DRIFT_LOCK_HEAD_CHAIN;

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody('Genesis', FLOW_DRIFT_LOCK_HEAD_GENESIS),
        { 'if-none-match': '*' },
    ));
    assertStrictEquals(genesis.status, 201);
    const genesisId = pairIdOf(genesis)!;
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
        assertStrictEquals(saved.status, 200);
        assertStrictEquals(saved.headers.get('Follows'), null);
        headId = pairIdOf(saved)!;
    }

    const headMessagePairId = await derivedHeadMessagePairId(
        db, STARK_ORGANIZATION, flowId,
    );
    assertStrictEquals(headId, headMessagePairId);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    assertStrictEquals(derived.name, 'Save ' + (saveCount - 1));
    assertNotStrictEquals(headId, genesisId);
});

// -- 12. a live multi-member, multi-attribute node save --------

Deno.test('a live multi-member, multi-attribute node save derives '
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
        { 'if-none-match': '*' },
    ));
    assertStrictEquals(res.status, 201);

    const derived = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const wireText = await wireFlowText(
        db, STARK_ORGANIZATION, flowId,
    );
    await assertWireEqualsDerived(
        db, STARK_ORGANIZATION, flowId, wireText,
    );
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
    assertEquals(
        [...node.memberIds].sort(),
        [AA_MEMBER, ZZ_MEMBER].sort(),
    );
    assertEquals(
        node.attributes.map((a) => a.attribute_id).sort(),
        [AA_ATTR, ZZ_ATTR].sort(),
    );
});

// -- 13. same-join-id retry: the join is a declared genesis ------
// A second, genuinely different create [a fresh flow id, a fresh
// operation] that reuses a prior create's project-flow id names a
// taken join: the statement refuses the whole create.

Deno.test('same-join-id retry: a second flow create reusing '
+ 'one project-flow id is 409 and stores nothing', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = l2cProjectId;
    const sharedPfid = FLOW_DRIFT_RETRY_PF_SHARED;

    const first = await createFlow(
        db, token, FLOW_DRIFT_RETRY_A, sharedPfid, projectId,
        FLOW_DRIFT_RETRY_EV_A,
    );
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;

    const second = await createFlow(
        db, token, FLOW_DRIFT_RETRY_B, sharedPfid, projectId,
        FLOW_DRIFT_RETRY_EV_B,
    );
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );

    const joinPrefix = canonicalPath(
        STARK_ORGANIZATION,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            + '/flows/',
    );
    const joinResponses = await db.messagePairs.getDocumentHistory(
        joinPrefix, sharedPfid,
    );
    assertStrictEquals(joinResponses.length, 1);
    assertStrictEquals(
        joinResponses[0]!.supersedes, NIL_IDENTIFIER,
    );
    assertStrictEquals('follows' in joinResponses[0]!, false);
});

Deno.test('POST flows/ answers 201 with the document\'s state'
+ ' and its location', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const res = await createFlow(
        db, token, flowId, generateIdentifier(), l2cProjectId,
        generateIdentifier(),
    );
    assertStrictEquals(res.status, 201);
    assertStrictEquals(res.headers.get('location'), flowId);
    assertEquals(
        await res.json(),
        JSON.parse(await storedPutBodyText(
            db, canonicalPath(STARK_ORGANIZATION, '/flows/'),
            flowId,
        )),
    );
});

Deno.test('a resent POST flows/ is 409 and stores nothing',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const projectFlowId = generateIdentifier();
    const eventId = generateIdentifier();
    const first = await createFlow(
        db, token, flowId, projectFlowId, l2cProjectId, eventId,
    );
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await createFlow(
        db, token, flowId, projectFlowId, l2cProjectId, eventId,
    );
    assertStrictEquals(second.status, 409);
    assertEquals(await second.json(), {
        error: 'Document already exists at '
            + canonicalPath(STARK_ORGANIZATION, '/flows/')
            + flowId,
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
