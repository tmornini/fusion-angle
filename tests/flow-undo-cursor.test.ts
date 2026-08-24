import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    ApiError, HTTP_PRECONDITION_FAILED,
} from '../api/http-errors.ts';
import { handleRequest, RequestError } from '../api/api.ts';
import { postFlowUndoOp } from '../api/routes.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    resolveFlowUndoTarget,
} from '../api/derive-flows.ts';
import type { GuardedDbAdapter } from '../api/db.ts';
import {
    formWriteMessagePair, canonicalUriCollection,
    documentHeadAt,
} from '../api/message-pair.ts';
import {
    organizationToken, DEV_TOKEN,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    createRequestContext,
    sessionContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postFlowCreation,
    putFlow,
    enqueueFlowSave,
} from '../web-app/app/adapters/flow-mutations.ts';
import { getFlowGraph } from
    '../web-app/app/adapters/flow-queries.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from '../web-app/app/presenters/flow-designer.ts';
import { performUndo } from '../web-app/app/flow-operations.ts';
import { wrapInPageAdapter } from
    './in-page-facade.ts';
import { putClientFacade } from
    '../web-app/app/adapters/facade-holder.ts';
import { putSessionToken } from
    '../web-app/app/adapters/session-token.ts';
import type { GraphNode } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

const PROJECT_1 = generateIdentifier();
const FLOWID_A = generateIdentifier();
const FLOWID_B = generateIdentifier();
const FLOWID_U1 = generateIdentifier();
const FLOWID_U2 = generateIdentifier();
const FLOWID_D = generateIdentifier();
const FLOWID_U3 = generateIdentifier();
const FLOWID_LINK = generateIdentifier();
const FLOWID_STALE_EV = generateIdentifier();
const FLOWID_DEL = generateIdentifier();
const FLOWID_NODE_DEL = generateIdentifier();
const FLOWID_UNDO_EV = generateIdentifier();
const FLOWID_RECONCILE = generateIdentifier();

// Phase 14 Task 8 (undo-as-replay): the hard constraint's FIVE
// pinned sequences, plus the SIDECAR-KEEP proof — see the PINNED
// Step 0 block and its hand trace in
// .superpowers/sdd/phase14-task-8-report.md. Route-level
// (handleRequest) for the cursor-algorithm sequences 1-4 and 6,
// since the cursor lives entirely server-side; client-level
// (performUndo) for sequence 5, the ONE piece that is genuinely
// a client behavior (the 412-absorbing retry loop).

// flow-operations.ts -> logger.ts -> preferences.ts reads
// localStorage, absent in Node — stub it before any log.* call
// in an error path (mirrors flow-operations.test.ts).
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

const BASE = 'http://localhost';
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
        headers,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Postgres coordinateWrite 412s an unlatched PUT at a
// locked address. Memory omits writeLocks, so the undo
// route's synthesized document message pair never hit that gate
// in ./test — garden did. This wrapper installs the same
// latestPutDelete check so the pin fails here too.
function withWriteGate(
    db: MemoryDbAdapter,
): MemoryDbAdapter {
    const origTx = db.transaction.bind(db);
    const origRead = db.readTransaction.bind(db);
    const wrapView = (
        view: GuardedDbAdapter,
    ): GuardedDbAdapter => ({
        ...view,
        writeLocks: {
            lockDedup: async () => {},
            lockAddress: async () => {},
            lockHead: async () => {},
            latestPutDelete: async (collection, uriId) => {
                const head = await documentHeadAt(
                    view, collection, uriId,
                );
                return head ?? null;
            },
            notify: async () => {},
        },
        transaction: (tables, fn) => view.transaction(
            tables, (inner) => fn(wrapView(inner)),
        ),
        readTransaction: (tables, fn) =>
            view.readTransaction(
                tables, (inner) => fn(wrapView(inner)),
            ),
    });
    db.transaction = (tables, fn) => origTx(
        tables, (view) => fn(wrapView(view)),
    );
    db.readTransaction = (tables, fn) => origRead(
        tables, (view) => fn(wrapView(view)),
    );
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
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

const NODE_ID_BY_NAME = new Map<string, string>();

function graphOf(name: string) {
    let nodeId = NODE_ID_BY_NAME.get(name);
    if (nodeId === undefined) {
        nodeId = generateIdentifier();
        NODE_ID_BY_NAME.set(name, nodeId);
    }
    return {
        nodes: [{
            id: nodeId,
            name,
            positionX: 0, positionY: 0,
            isCreate: false, isArchive: false,
            memberIds: [], attributes: [],
            taskInstructions: '',
        }],
        edges: [],
    };
}

// One document PUT body naming its own graph — each call's
// `name` also seeds its ONE node's id/name, so a test can tell
// which save undo landed on just by reading the restored
// graph's node id.
function documentBody(
    name: string,
    stateEventId: string,
    overrides?: Record<string, unknown>,
) {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: graphOf(name),
        graphDelta: emptyDelta(),
        revivals: [],
        ...(overrides ?? {}),
    };
}

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<void> {
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: flowId,
            flow: flowFields('genesis'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: 'qfhFObbtDfxUZwEGxySBoQ',
                flow_id: flowId, at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(created.status, 201);
}

async function headResponseId(
    db: MemoryDbAdapter, token: string, flowId: string,
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

// A genuine save, echoing the current head — the ONLY way undo-
// as-replay's document-message-pair history grows (matches a real
// putFlow). `name` becomes both this save's own flow name and
// its one node's id (see graphOf), so later assertions can name
// which save undo landed on just by reading the restored graph.
async function save(
    db: MemoryDbAdapter, token: string, flowId: string,
    name: string, eventId: string,
): Promise<void> {
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const etag = got.headers.get('ETag');
    assert.ok(etag
        , 'no ETag on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + flowId);
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody(name, eventId),
        { 'if-match': etag },
    ));
    assert.equal(res.status, 201);
}

async function undo(
    db: MemoryDbAdapter, token: string, flowId: string,
    eventId: string, at: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/undo', token,
        { eventId, at },
    ));
}

async function currentGraphName(
    db: MemoryDbAdapter, token: string, flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const body = await got.json() as { name: string };
    return body.name;
}

// -- 1. undo (single) --------------------------

test(
    'undo cursor: a single undo restores the previous'
    + ' save (one step back)',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        const res = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assert.equal(res.status, 201);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
        );
    },
);

test(
    'undo cursor: after a save, undo succeeds under the'
    + ' postgres write-lock gate',
    async () => {
        const db = withWriteGate(await freshDb());
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        const res = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assert.equal(res.status, 201);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
        );
    },
);

// -- 2. undo-undo (consecutive) ----------------

// The case a naive "N document message pairs back" count gets wrong: a
// SECOND consecutive undo must walk FURTHER back (to genesis),
// never oscillate back to B (the state the FIRST undo just
// left).
test(
    'undo cursor: undo-undo walks further back, never'
    + ' oscillating between the two most recent states',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        const first = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assert.equal(first.status, 201);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
            'first undo lands on A',
        );

        const second = await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(second.status, 201);
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
            'second consecutive undo reaches genesis, not'
            + ' back to B',
        );
    },
);

// -- 3. undo-save-undo (branch abandonment) ----

// The scenario that falsified a flat "exclude undo-correlated
// pairs, keep original order" cursor algorithm during Step 0
// (see the PINNED block's hand trace): undo-undo back to
// genesis, then a NEW save from that genesis baseline, must
// make B and A UNREACHABLE — the next undo reverts the new save
// back to genesis, never resurrecting the abandoned A/B branch.
test(
    'undo cursor: undo-save-undo abandons the'
    + ' undone branch — a save after undo-undo, then'
    + ' undo, reverts to the SAVE\'s own baseline, never'
    + ' the abandoned A/B branch',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        await undo(db, token, flowId, FLOWID_U1, AT);
        await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
            'undo-undo reaches genesis before the new save',
        );

        // A NEW edit, made from the genesis baseline — A and B
        // are now an abandoned branch.
        await save(db, token, flowId, 'D', FLOWID_D);
        assert.equal(
            await currentGraphName(db, token, flowId), 'D',
        );

        const third = await undo(
            db, token, flowId, FLOWID_U3,
            '2026-01-01T00:00:02.000000Z',
        );
        assert.equal(third.status, 201);
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
            'undo after the save reverts to genesis (D\'s own'
            + ' baseline) — never A or B',
        );
    },
);

// -- 4. undo at history exhaustion -------------

test(
    'undo cursor: undo at exhaustion (nothing before'
    + ' genesis) is a graceful no-op — 204, no document'
    + ' pair, no graph change',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);

        const before = await db.messagePairs.getAll();
        const res = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assert.equal(res.status, 201);

        const after = await db.messagePairs.getAll();
        assert.equal(
            after.length, before.length + 1,
            'exhaustion appends exactly the operation message'
            + ' pair — no document message pair',
        );
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
        );

        // A SECOND exhausted undo must ALSO no-op (the first
        // exhausted attempt's own operation message pair must not
        // desync a later replay).
        const again = await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(again.status, 201);
        const afterAgain = await db.messagePairs.getAll();
        assert.equal(
            afterAgain.length, after.length + 1,
            'a second exhausted undo ALSO appends only its'
            + ' own operation message pair',
        );
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
        );
    },
);

// -- 5. concurrent-save vs undo (412 + retry) --

// Client-level (not route-level): postFlowUndo's own jittered
// 412-absorb, with NO baseline of its own to rebuild — a 412 on
// attempt 1 means the head moved; attempt 2 (a FRESH eventId/at,
// the E6-split convention) just re-POSTs, and the SERVER
// re-resolves the target fresh against the new head.
test(
    'undo cursor: a 412 on attempt 1 is absorbed —'
    + ' attempt 2 succeeds with no client-side baseline'
    + ' refetch',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const flowId = generateIdentifier();
        const nodeId = generateIdentifier();
        const ctx = createRequestContext(db, DEV_TOKEN);
        await postFlowCreation(ctx, {
            flowId,
            linkId: FLOWID_LINK,
            projectId: PROJECT_1,
            name: 'Retry Flow',
        });
        await putFlow(ctx, flowId, {
            name: 'Retry Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [buildNode(nodeId)],
            edges: [],
        });

        let posts = 0;
        const flaky: RequestContext = {
            ...ctx,
            POST: <T>(
                resource: string,
                body: Record<string, unknown>,
            ): Promise<T> => {
                if (resource === 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + '' + flowId +
                    '/undo') {
                    posts += 1;
                    if (posts === 1) {
                        return Promise.reject(
                            new RequestError(
                                'stale head', 412,
                            ),
                        );
                    }
                }
                return ctx.POST<T>(resource, body);
            },
        };

        const snap = snapOf(flowId, [
            buildNode(nodeId),
        ]);
        const op = await performUndo(
            flaky, snap, buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        assert.equal(posts, 2, 'the retry re-posts once');
    },
);

function buildNode(id: string): GraphNode {
    return {
        id, name: id,
        positionX: 0, positionY: 0,
        isCreate: false, isArchive: false,
        memberIds: [], attributes: [],
        taskInstructions: '',
    };
}

function snapOf(
    flowId: string, nodes: GraphNode[],
): FlowSnapshot {
    return buildInitialFlowSnapshot(
        {
            id: flowId,
            name: 'Retry Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            createdAt: AT,
            nodes,
            edges: [],
        },
        800, 600, [], [], [],
    );
}

// -- 5b. stale resolution basis (fix wave) -----

// Review finding, fix wave: the undo write's in-tx latch MUST
// be the SAME read that produced the diff basis
// (resolveFlowUndoTarget's own `current`), never a second
// independent head-read — otherwise a save landing AFTER the
// snapshot was captured lets the undo write succeed against
// the FRESH head while its own delta/revivals still reflect
// the STALE snapshot, silently discarding the concurrent
// save instead of 412ing. This drives postFlowUndoOp DIRECTLY
// with a DELIBERATELY stale resolution, bypassing the live
// route's always-fresh resolveFlowUndoTarget call.
test(
    'undo cursor (fix wave): a write driven by a STALE'
    + ' resolution snapshot 412s — it must never silently'
    + ' overwrite a save that landed after the snapshot'
    + ' was taken',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        const organization = 'AjdvjuECVZEgZoFajaIEkg';
        const actor = 'XXZruirZyAOoRpNxaDnpSA';
        // Phase Final Task 5: the store decorator is gone;
        // handlers and resolveFlowUndoTarget read the base
        // adapter. Message-plane tenancy rides uri_collection.
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);

        // Capture the resolution snapshot BEFORE the fresh save
        // below lands — this is EXACTLY what
        // resolveFlowUndoTarget's own pre-tx read sees inside
        // the live route, at the instant a concurrent write
        // could still race it.
        const undoUriPrefix = canonicalUriCollection(
            organization, '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/undo/',
        );
        const staleResolution = await resolveFlowUndoTarget(
            db, organization, flowId, undoUriPrefix,
        );
        assert.ok(staleResolution, 'a resolution exists');

        // A FRESH save lands through the LIVE route — moves the
        // real head forward, so staleResolution's own `current`
        // is now stale.
        await save(db, token, flowId, 'B', FLOWID_B);

        // Drive the write with the STALE resolution. The
        // in-tx head re-read sees B as the live lock head
        // and 412s — it must never silently discard B.
        const messagePair = await formWriteMessagePair({
            method: 'POST',
            pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/undo',
            routePattern: 'organizations/:id/flows/:id/undo',
            routeSegments: ['flows', ':id', 'undo'],
            pathSegments: ['flows', flowId, 'undo'],
            headerFields: [],
            body: { eventId: FLOWID_STALE_EV, at: AT },
            requesterIdentityId: actor,
            requestAt: AT,
            organization,
            responseStatus: 204,
            responseBody: undefined,
            operationId: TEST_OPERATION_ID,
        });
        await assert.rejects(
            () => postFlowUndoOp(
                db, flowId, actor, organization, messagePair,
                staleResolution!,
                { eventId: FLOWID_STALE_EV, at: AT },
            ),
            (err: unknown) =>
                err instanceof ApiError
                && err.status === HTTP_PRECONDITION_FAILED,
        );

        // B's content survives untouched — the whole stale-basis
        // transaction landed nothing (atomicity).
        assert.equal(
            await currentGraphName(db, token, flowId), 'B',
        );
    },
);

// -- 6. SIDECAR-KEEP ---------------------------

// graphDelta.deletions / revivals ride the flow
// document-message-pair body (including pairs the UNDO
// route synthesizes).
// C3 retired deriveFlowGraphStates — pin the message
// plane directly: a node deleted by a save, then revived
// by undo, must leave both sidecar entries on stored
// pairs.
test(
    'SIDECAR-KEEP: undo-authored document message pairs carry'
    + ' deleted/restored sidecars on graphDelta/revivals',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        const nodeId = generateIdentifier();

        const created = await handleRequest(db, req(
            'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
                id: flowId,
                flow: flowFields('Sidecar Flow'),
                projectFlowId: generateIdentifier(),
                projectFlow: {
                    project_id: 'qfhFObbtDfxUZwEGxySBoQ',
                    flow_id: flowId, at: AT,
                },
                initialState: 'active',
                initialStateEventId: generateIdentifier(),
                initialStateAt: AT,
                graphDelta: {
                    nodes: [{
                        id: nodeId, flow_id: flowId,
                        name: 'N', position_x: 0,
                        position_y: 0, is_create: false,
                        is_archive: false,
                        task_instructions: '', at: AT,
                    }],
                    edges: [], deletions: [],
                    memberEvents: [], attributeEvents: [],
                },
            },
        ));
        assert.equal(created.status, 201);

        const got = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
                , token,
        ));
        const etag = got.headers.get('ETag');
        assert.ok(etag
            , 'no ETag on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId);
        const deleteAt = '2026-01-01T00:00:01.000000Z';
        const deleted = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
                , token,
            documentBody(
                'Sidecar Trimmed', FLOWID_DEL, {
                    state_at: deleteAt,
                    graph: { nodes: [], edges: [] },
                    graphDelta: {
                        ...emptyDelta(),
                        deletions: [{
                            eventId: FLOWID_NODE_DEL,
                            entityId: nodeId, at: deleteAt,
                        }],
                    },
                },
            ),
            { 'if-match': etag },
        ));
        assert.equal(deleted.status, 201);

        const undoAt = '2026-01-01T00:00:02.000000Z';
        const undone = await undo(
            db, token, flowId, FLOWID_UNDO_EV, undoAt,
        );
        assert.equal(undone.status, 201);

        const prefix = canonicalUriCollection('AjdvjuECVZEgZoFajaIEkg'
            , '/flows/');
        const stored = await db.messagePairs.getAllWhere(
            'uri_collection', prefix,
        );
        const messagePairs = documentMessagePairsAt(
            stored, prefix,
        )
            .filter((p) => p.uriId === flowId);
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
        assert.deepEqual(
            states.map((s) => s.state),
            ['deleted', 'restored'],
            'the undo-authored pair\'s own revival is'
            + ' visible on the message plane',
        );
    },
);

// -- 7. flags are guards, not undo content -----------

// Graph and name are undo content. Locked / Auto Layout /
// Auto Fit are guards: a pair that only changes those
// flags is carried, not restored, not counted. The earlier
// "content-invisible save consumes a step" covenant was
// the old cursor rule; this is the retarget, not a weaken.
// putClientFacade(wrapInPageAdapter(db)) plus
// putSessionToken(DEV_TOKEN) makes sessionContext() live
// under node:test — the seam earlier comments called
// unreachable.
test(
    'undo cursor: a flag-only pair is not a step',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        const got = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const etag = got.headers.get('ETag');
        assert.ok(etag, 'no ETag on GET before flag PUT');
        const head = await got.json() as {
            name: string;
            graph: unknown;
            is_locked: boolean;
        };
        const flagged = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
            {
                ...flowFields(head.name),
                is_locked: !head.is_locked,
                state: 'updated',
                state_at: AT,
                state_event_id: FLOWID_RECONCILE,
                graph: head.graph,
                graphDelta: emptyDelta(),
                revivals: [],
            },
            { 'if-match': etag },
        ));
        assert.equal(flagged.status, 201);

        const first = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assert.equal(first.status, 201);
        const afterFirst = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const firstBody = await afterFirst.json() as {
            name: string;
            is_locked: boolean;
        };
        assert.equal(firstBody.name, 'A');
        assert.equal(
            firstBody.is_locked, !head.is_locked,
            'is_locked stays the current head\'s value',
        );

        const second = await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(second.status, 201);
        const afterSecond = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const secondBody = await afterSecond.json() as {
            name: string;
            is_locked: boolean;
        };
        assert.equal(secondBody.name, 'genesis');
        assert.equal(
            secondBody.is_locked, !head.is_locked,
            'flag-only pairs are carried, not restored',
        );
    },
);

test(
    'undo after lock toggles reverts name not lock',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        putClientFacade(wrapInPageAdapter(db));
        putSessionToken(DEV_TOKEN);

        const livePresenter = async (
            migrateToCenter = false,
        ): Promise<FlowDesignerPresenter> => {
            const graph = await getFlowGraph(
                sessionContext(), flowId,
            );
            const snap = buildInitialFlowSnapshot(
                graph, 800, 600, [], [], [],
            );
            return new FlowDesignerPresenter(
                snap, 800, 600,
                buildFlowHistorySnapshot(
                    graph.hasUndoHistory,
                ),
                migrateToCenter,
            );
        };

        (await livePresenter()).withFlowName('Renamed');
        await enqueueFlowSave(
            flowId, async () => undefined,
        );
        (await livePresenter()).withLockToggled();
        await enqueueFlowSave(
            flowId, async () => undefined,
        );
        (await livePresenter()).withLockToggled();
        await enqueueFlowSave(
            flowId, async () => undefined,
        );

        const opened = await livePresenter(true);
        opened.withCanvasSize(800, 600);
        opened.withLayoutReconciled();
        await enqueueFlowSave(
            flowId, async () => undefined,
        );

        const graph = await getFlowGraph(
            sessionContext(), flowId,
        );
        const op = await performUndo(
            sessionContext(),
            buildInitialFlowSnapshot(
                graph, 800, 600, [], [], [],
            ),
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.freshSnap.flowName, 'genesis');
        assert.equal(op.freshSnap.isLocked, false);
    },
);

test(
    'undo cursor: eleven saves walk eleven undos —'
    + ' N10 back to genesis, no cap',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        for (let i = 1; i <= 11; i++) {
            await save(
                db, token, flowId, 'N' + i,
                generateIdentifier(),
            );
        }
        for (let i = 10; i >= 1; i--) {
            const res = await undo(
                db, token, flowId,
                generateIdentifier(), AT,
            );
            assert.equal(res.status, 201);
            assert.equal(
                await currentGraphName(
                    db, token, flowId,
                ),
                'N' + i,
            );
        }
        const last = await undo(
            db, token, flowId,
            generateIdentifier(), AT,
        );
        assert.equal(last.status, 201);
        assert.equal(
            await currentGraphName(
                db, token, flowId,
            ),
            'genesis',
        );
    },
);
