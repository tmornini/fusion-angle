import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    FlowEntity,
    FlowWithGraph,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
} from '../api/types.ts';
import { DEFAULT_LOCK_TIMEOUT, storedGraphField } from
    '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { organizationScopedAdapter } from
    '../api/db-organization-scoped.ts';
import { reassembleStoredGraph } from
    '../api/flow-graph-relations.ts';
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

// The E10 drift check (Phase 4 Task 7): message-derived reads
// proven equal to the old-table-derived reads they will replace
// at the route (Task 8). NOTHING reads the pairs in production
// yet — this file alone gates that flip; it stays as a
// regression guard through Phase Final.

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

// Reads through the SAME org-scoped store + reassembly the live
// GET /flows and GET /flows/:id routes read today
// (organizationScopedAdapter binds the fence the route's
// verified-token org resolves to) — never through handleRequest,
// so the comparison survives the Task 8 flip.
async function assembleOldFlow(
    scoped: DbAdapter, flow: FlowEntity,
): Promise<FlowWithGraph> {
    const nodes = await scoped.flowNodes.getAllWhere(
        'flow_id', flow.id,
    );
    const edges = await scoped.flowEdges.getAllWhere(
        'flow_id', flow.id,
    );
    const members: FlowNodeMemberEntity[] = [];
    const attributes: FlowNodeAttributeEntity[] = [];
    for (const node of nodes) {
        members.push(...await scoped.flowNodeMembers
            .getAllWhere('flow_node_id', node.id));
        attributes.push(...await scoped.flowNodeAttributes
            .getAllWhere('flow_node_id', node.id));
    }
    const graph = reassembleStoredGraph(
        nodes, edges, members, attributes,
    );
    return { ...flow, graph: storedGraphField(graph) };
}

async function oldPlaneFlows(
    db: MemoryDbAdapter, organization: string,
): Promise<FlowWithGraph[]> {
    const scoped = organizationScopedAdapter(db, organization);
    const flows = await scoped.flows.getAll();
    const result: FlowWithGraph[] = [];
    for (const flow of flows) {
        result.push(await assembleOldFlow(scoped, flow));
    }
    return result;
}

async function oldPlaneFlow(
    db: MemoryDbAdapter, organization: string, id: string,
): Promise<FlowWithGraph> {
    const scoped = organizationScopedAdapter(db, organization);
    const flow = await scoped.flows.getById(id);
    return assembleOldFlow(scoped, flow);
}

// Design decision 1: node/edge order is normalized to id-lex on
// BOTH sides before comparison — the memory backend's
// getAllWhere is arrival-ordered, so the OLD plane's own row
// order need not match the derived side's (always id-sorted).
// Within-node member/attribute arrays are order-normalized on
// BOTH sides too (a cosmetic order change neither plane could
// re-derive from the other's array order alone).
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

function assertFlowsEqual(
    derived: FlowWithGraph, old: FlowWithGraph,
): void {
    const { graph: derivedGraph, ...derivedRest } = derived;
    const { graph: oldGraph, ...oldRest } = old;
    assert.deepEqual(derivedRest, oldRest);
    assert.deepEqual(
        normalizedGraph(derivedGraph), normalizedGraph(oldGraph),
    );
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

// -- 1. flows: message-derived equals old-table-derived -------

test('flows: message-derived equals old-table-derived',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const old = sortById(
            await oldPlaneFlows(db, organization),
        );
        const derived = sortById(
            await deriveFlows(db, organization),
        );
        assert.equal(derived.length, old.length);
        for (let i = 0; i < derived.length; i++) {
            assertFlowsEqual(derived[i]!, old[i]!);
        }
    }
});

// -- 2. per-flow getById parity, every seeded flow -------------

test('per-flow getById parity across every seeded flow',
async () => {
    const db = await seededDb();
    for (const { id, organization } of SEEDED_FLOWS) {
        const derived = await deriveFlow(db, organization, id);
        const old = await oldPlaneFlow(db, organization, id);
        assertFlowsEqual(derived, old);
    }
});

// -- 3. foreign-org id 404 parity -------------------------------

test('a foreign-org id 404s the same way on both planes',
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
    await assert.rejects(
        () => organizationScopedAdapter(db, otherOrganization)
            .flows.getById(foreign.id),
        EntityNotFoundError,
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
        const old = await db.states.getAllFor(id);
        assert.deepEqual(derived, old);
    }
});

// -- 5. project-flows parity, every seeded project -------------

test('project-flows parity across every seeded project',
async () => {
    const db = await seededDb();
    for (const projectId of SEEDED_PROJECT_FLOW_PROJECT_IDS) {
        const derived = await deriveProjectFlows(
            db, STARK_ORGANIZATION, projectId,
        );
        const old = sortById(
            await organizationScopedAdapter(
                db, STARK_ORGANIZATION,
            ).projectFlows.getAllWhere(
                'project_id', projectId,
            ),
        );
        assert.deepEqual(derived, old);
    }
});

test('the two-flows project orders both join rows'
+ ' identically on both planes', async () => {
    const db = await seededDb();
    const derived = await deriveProjectFlows(
        db, STARK_ORGANIZATION, TWO_FLOWS_PROJECT_ID,
    );
    assert.equal(derived.length, 2);
    const old = sortById(
        await organizationScopedAdapter(
            db, STARK_ORGANIZATION,
        ).projectFlows.getAllWhere(
            'project_id', TWO_FLOWS_PROJECT_ID,
        ),
    );
    assert.deepEqual(derived, old);
    assert.deepEqual(
        derived.map((row) => row.flow_id),
        old.map((row) => row.flow_id),
    );
});

// -- 6. live-write chain, re-compared at each step -------------

test('live-write chain: create, save, versioned save, node '
+ 'delete, undo, redo, and a terminal delete — re-compared on '
+ 'both planes at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-chain';
    const projectId = l2cProjectId;

    const n1 = 'chain-n1';
    const n2 = 'chain-n2';
    const e1 = 'chain-e1';
    const genesisAt = '2026-03-01T00:00:00.000000Z';

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
    let derived = await deriveFlow(db, STARK_ORGANIZATION, flowId);
    let old = await oldPlaneFlow(db, STARK_ORGANIZATION, flowId);
    assertFlowsEqual(derived, old);

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
    derived = await deriveFlow(db, STARK_ORGANIZATION, flowId);
    old = await oldPlaneFlow(db, STARK_ORGANIZATION, flowId);
    assertFlowsEqual(derived, old);

    // Versioned save: publish a snapshot of the current graph,
    // then a further save (no structural change yet).
    const versionAt = '2026-03-03T00:00:00.000000Z';
    const published = await handleRequest(db, req(
        'POST', '/flows/' + flowId + '/versions', token, {
            id: flowId + '-v1',
            version: {
                flow_id: flowId,
                name: 'Chain Flow Saved',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
                graph: fullGraph,
                at: versionAt,
            },
            trimIds: [],
        },
    ));
    assert.equal(published.status, 204);
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
    derived = await deriveFlow(db, STARK_ORGANIZATION, flowId);
    old = await oldPlaneFlow(db, STARK_ORGANIZATION, flowId);
    assertFlowsEqual(derived, old);

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
    derived = await deriveFlow(db, STARK_ORGANIZATION, flowId);
    old = await oldPlaneFlow(db, STARK_ORGANIZATION, flowId);
    assertFlowsEqual(derived, old);
    assert.equal(
        (JSON.parse(derived.graph) as { nodes: { id: string }[] })
            .nodes.length,
        1,
    );

    // Undo: reverts to the published version, reviving n2/e1 —
    // visible on BOTH planes.
    const undoAt = '2026-03-05T00:00:00.000000Z';
    const undone = await handleRequest(db, req(
        'POST', '/flows/' + flowId + '/undo', token, {
            flow: flowFields('Chain Flow Versioned'),
            eventId: flowId + '-undo-ev',
            at: undoAt,
            consumedVersionId: flowId + '-v1',
            graph: fullGraph,
            graphDelta: emptyDelta(),
            revivals: [
                {
                    eventId: flowId + '-revive-n2',
                    entityId: n2, at: undoAt,
                },
                {
                    eventId: flowId + '-revive-e1',
                    entityId: e1, at: undoAt,
                },
            ],
        },
    ));
    assert.equal(undone.status, 204);
    headId = await headResponseId(db, token, flowId);
    derived = await deriveFlow(db, STARK_ORGANIZATION, flowId);
    old = await oldPlaneFlow(db, STARK_ORGANIZATION, flowId);
    assertFlowsEqual(derived, old);
    assert.equal(
        (JSON.parse(derived.graph) as { nodes: { id: string }[] })
            .nodes.some((n) => n.id === n2),
        true,
        'the revived node must be visible on the derived side',
    );
    assert.equal(
        (JSON.parse(old.graph) as { nodes: { id: string }[] })
            .nodes.some((n) => n.id === n2),
        true,
        'the revived node must be visible on the old plane too',
    );

    // Redo-as-save: publish a fresh snapshot, then re-apply the
    // node deletion (redoing what undo reverted).
    const redoVersionAt = '2026-03-06T00:00:00.000000Z';
    const redoPublished = await handleRequest(db, req(
        'POST', '/flows/' + flowId + '/versions', token, {
            id: flowId + '-v2',
            version: {
                flow_id: flowId,
                name: 'Chain Flow Versioned',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
                graph: fullGraph,
                at: redoVersionAt,
            },
            trimIds: [],
        },
    ));
    assert.equal(redoPublished.status, 204);
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
    derived = await deriveFlow(db, STARK_ORGANIZATION, flowId);
    old = await oldPlaneFlow(db, STARK_ORGANIZATION, flowId);
    assertFlowsEqual(derived, old);

    // Terminal: a state-'deleted' document PUT — vanishes from
    // both lists, 404s both planes.
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
    await assert.rejects(
        () => organizationScopedAdapter(db, STARK_ORGANIZATION)
            .flows.getById(flowId),
        EntityNotFoundError,
    );
    const derivedList = await deriveFlows(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        derivedList.some((f) => f.id === flowId), false,
    );
    const oldList = await oldPlaneFlows(db, STARK_ORGANIZATION);
    assert.equal(
        oldList.some((f) => f.id === flowId), false,
    );

    const derivedHistory = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    const oldHistory = await db.states.getAllFor(flowId);
    assert.deepEqual(derivedHistory, oldHistory);
});

// -- 7. live join-row chain: PUT appears, DELETE vanishes ------

test('live join-row chain: PUT appears on both planes, '
+ 'DELETE removes it from both', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const projectId = l2cProjectId;
    const pfid = 'pf-drift-join-1';

    const putRes = await handleRequest(db, req(
        'PUT', '/projects/' + projectId + '/flows/' + pfid,
        token,
        { project_id: projectId, flow_id: 'flow-drift-join', at: AT },
    ));
    assert.equal(putRes.status, 200);

    const derivedAfterPut = await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    );
    const oldAfterPut = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).projectFlows.getAllWhere('project_id', projectId);
    assert.ok(derivedAfterPut.some((row) => row.id === pfid));
    assert.ok(oldAfterPut.some((row) => row.id === pfid));
    assert.deepEqual(
        sortById(derivedAfterPut), sortById(oldAfterPut),
    );

    const delRes = await handleRequest(db, req(
        'DELETE',
        '/projects/' + projectId + '/flows/' + pfid, token,
    ));
    assert.equal(delRes.status, 204);

    const derivedAfterDelete = await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    );
    const oldAfterDelete = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).projectFlows.getAllWhere('project_id', projectId);
    assert.equal(
        derivedAfterDelete.some((row) => row.id === pfid), false,
    );
    assert.equal(
        oldAfterDelete.some((row) => row.id === pfid), false,
    );
});

// -- 8. duplicate-create (the R2 multiset case) ----------------

test('duplicate-create: two creates, same flow id, distinct '
+ 'lifecycle events, and a fresh join row on both planes',
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

    // ONE flows row on both planes — the derived head is the
    // (at, id) winner, the second create's own document pair.
    const derivedFlow = await deriveFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const oldFlow = await oldPlaneFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    assertFlowsEqual(derivedFlow, oldFlow);

    // TWO lifecycle events on both planes.
    const derivedHistory = await deriveFlowStateHistory(
        db, STARK_ORGANIZATION, flowId,
    );
    const oldHistory = await db.states.getAllFor(flowId);
    assert.deepEqual(derivedHistory, oldHistory);
    assert.equal(derivedHistory.length, 2);

    // TWO join rows surfacing identically in deriveProjectFlows
    // AND the old-plane getAllWhere.
    const derivedJoins = (await deriveProjectFlows(
        db, STARK_ORGANIZATION, projectId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    const oldJoins = (await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).projectFlows.getAllWhere(
        'project_id', projectId,
    )).filter((row) => row.id === pfidA || row.id === pfidB);
    assert.equal(oldJoins.length, 2);
    assert.deepEqual(sortById(derivedJoins), sortById(oldJoins));
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
    const old = await oldPlaneFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    assertFlowsEqual(derived, old);
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
    // a legal below-gate write.
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

    // The old plane, by contrast, reassembles from the relation
    // tables the sidecar actually wrote — a DIFFERENT node id —
    // proving the two planes genuinely DISAGREE here: the
    // derivation tracks `graph` alone, never the sidecar.
    const old = await oldPlaneFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    const oldNodes = (JSON.parse(old.graph) as {
        nodes: { id: string }[];
    }).nodes;
    assert.deepEqual(
        oldNodes.map((n) => n.id), ['sidecar-delta-node'],
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
+ 'content-identically on both planes (order-independent)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const flowId = 'flow-drift-multi-node';
    const nodeId = 'multi-node-1';

    // Deliberately reverse-alphabetical in `graph` and the
    // OPPOSITE order in the storage-shaped delta events — a
    // regression that dropped either side's normalization would
    // be CAUGHT here, unlike the seed's own multi-member node,
    // whose single ordering happens to coincide on both planes.
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
    const old = await oldPlaneFlow(
        db, STARK_ORGANIZATION, flowId,
    );
    assertFlowsEqual(derived, old);
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
