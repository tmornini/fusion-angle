import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    HTTP_PRECONDITION_FAILED,
} from '../shared/http-errors.ts';
import type { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { handleRequest, RequestError } from '../api/api.ts';
import { postFlowUndoOp } from '../api/routes.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    resolveFlowUndoTarget,
} from '../api/derive-flows.ts';
import {
    formWriteMessagePair, canonicalPath, responseRecordOf,
    writeAnswerOf,
} from '../api/message-pair.ts';
import {
    organizationToken, DEV_TOKEN,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import {
    type Latch,
    type RequestContext,
} from '../client/request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { inPageContext } from './in-page-facade.ts';
import { responseMessage } from './fixtures/response-message.ts';
import { sessionContext } from '../web-app/app/client.ts';
import {
    postFlowCreation,
    putFlow,
    enqueueFlowSave,
} from '../client/flow-mutations.ts';
import { getRenderableFlowGraph } from
    '../web-app/app/flow-graph-layout.ts';
import { getFlowVersions } from '../client/flow-queries.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from '../web-app/app/presenters/flow-designer.ts';
import { performUndo } from '../web-app/app/flow-operations.ts';
import { inPageClient } from
    './in-page-facade.ts';
import {
    getClient,
    putClient,
} from '../web-app/app/client.ts';
import type { GraphNode } from '../shared/types.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';

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
// localStorage lazily, only on a log.* call in an error
// path (mirrors flow-operations.test.ts).
const NULL_STORAGE: Partial<Storage> = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

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

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
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
    assertStrictEquals(created.status, 201);
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
    assert(etag
        , 'no ETag on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + flowId);
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
        documentBody(name, eventId),
        { 'if-match': etag },
    ));
    assertStrictEquals(res.status, 200);
}

async function undo(
    db: MemoryDbAdapter, token: string, flowId: string,
    eventId: string, at: string,
): Promise<Response> {
    const head = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token,
    ));
    const etag = head.headers.get('ETag');
    return handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/undo', token,
        { eventId, at },
        etag === null ? undefined : { 'if-match': etag },
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

Deno.test(
    'undo cursor: a single undo restores the previous'
    + ' save (one step back)',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        const res = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assertStrictEquals(res.status, 200);
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'A',
        );
    }),
);

// -- 2. undo-undo (consecutive) ----------------

// The case a naive "N document message pairs back" count gets wrong: a
// SECOND consecutive undo must walk FURTHER back (to genesis),
// never oscillate back to B (the state the FIRST undo just
// left).
Deno.test(
    'undo cursor: undo-undo walks further back, never'
    + ' oscillating between the two most recent states',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        await save(db, token, flowId, 'B', FLOWID_B);

        const first = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assertStrictEquals(first.status, 200);
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'A',
            'first undo lands on A',
        );

        const second = await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assertStrictEquals(second.status, 200);
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'genesis',
            'second consecutive undo reaches genesis, not'
            + ' back to B',
        );
    }),
);

// -- 3. undo-save-undo (branch abandonment) ----

// The scenario that falsified a flat "exclude undo-correlated
// pairs, keep original order" cursor algorithm during Step 0
// (see the PINNED block's hand trace): undo-undo back to
// genesis, then a NEW save from that genesis baseline, must
// make B and A UNREACHABLE — the next undo reverts the new save
// back to genesis, never resurrecting the abandoned A/B branch.
Deno.test(
    'undo cursor: undo-save-undo abandons the'
    + ' undone branch — a save after undo-undo, then'
    + ' undo, reverts to the SAVE\'s own baseline, never'
    + ' the abandoned A/B branch',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
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
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'genesis',
            'undo-undo reaches genesis before the new save',
        );

        // A NEW edit, made from the genesis baseline — A and B
        // are now an abandoned branch.
        await save(db, token, flowId, 'D', FLOWID_D);
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'D',
        );

        const third = await undo(
            db, token, flowId, FLOWID_U3,
            '2026-01-01T00:00:02.000000Z',
        );
        assertStrictEquals(third.status, 200);
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'genesis',
            'undo after the save reverts to genesis (D\'s own'
            + ' baseline) — never A or B',
        );
    }),
);

// -- 4. undo at history exhaustion -------------

// Interpretation Y: with nothing to undo, the flow's
// current state is the sibling, so the statement matches
// its head and stores nothing.
Deno.test(
    'an undo at exhaustion stores nothing and answers the'
    + ' head',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        const head = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const etag = head.headers.get('ETag');
        await head.body?.cancel();
        assert(etag, 'no ETag on the flow GET');

        const before = await db.messagePairs.getAll();
        const res = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assertStrictEquals(res.status, 200);
        assertStrictEquals(res.headers.get('etag'), etag);
        const body = await res.json() as { name: string };
        assertStrictEquals(body.name, 'genesis');
        const after = await db.messagePairs.getAll();
        assertStrictEquals(after.length, before.length);

        const again = await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assertStrictEquals(again.status, 200);
        assertStrictEquals(again.headers.get('etag'), etag);
        await again.body?.cancel();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before.length,
        );
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'genesis',
        );
    }),
);

// -- 5. concurrent-save vs undo (412 + retry) --

// Client-level (not route-level): postFlowUndo's own jittered
// 412-absorb, with NO baseline of its own to rebuild — a 412 on
// attempt 1 means the head moved; attempt 2 (a FRESH eventId/at,
// the E6-split convention) just re-POSTs, and the SERVER
// re-resolves the target fresh against the new head.
Deno.test(
    'undo cursor: a 412 on attempt 1 is absorbed —'
    + ' attempt 2 succeeds with no client-side baseline'
    + ' refetch',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const flowId = generateIdentifier();
        const nodeId = generateIdentifier();
        const ctx = inPageContext(db, DEV_TOKEN);
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
                latch?: Latch,
            ): Promise<HttpMessage<T>> => {
                if (resource === 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + '' + flowId +
                    '/undo') {
                    posts += 1;
                    if (posts === 1) {
                        return Promise.reject(
                            new RequestError(
                                'stale head', 412,
                                responseMessage(
                                    { error: 'stale head' },
                                    {},
                                    412,
                                ),
                            ),
                        );
                    }
                }
                return ctx.POST<T>(resource, body, latch);
            },
        };

        const snap = snapOf(flowId, [
            buildNode(nodeId),
        ]);
        const op = await performUndo(
            flaky, snap, buildFlowHistorySnapshot(true),
        );
        assertStrictEquals(op.kind, 'ok');
        assertStrictEquals(posts, 2, 'the retry re-posts once');
    }),
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
            nodes,
            edges: [],
        },
        800, 600, [], [], [],
    );
}

// -- 5b. stale resolution basis (fix wave) -----

// Review finding, fix wave: a save landing AFTER the
// snapshot was captured must never be silently discarded
// by an undo whose delta/revivals reflect the STALE
// snapshot. The client's tag names the head it read, and
// the statement judges it. This drives postFlowUndoOp
// DIRECTLY with a DELIBERATELY stale resolution, bypassing
// the live route's always-fresh resolveFlowUndoTarget call.
Deno.test(
    'undo cursor (fix wave): a write driven by a STALE'
    + ' resolution snapshot 412s — it must never silently'
    + ' overwrite a save that landed after the snapshot'
    + ' was taken',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        const organization = 'AjdvjuECVZEgZoFajaIEkg';
        const actor = 'XXZruirZyAOoRpNxaDnpSA';
        // Phase Final Task 5: the store decorator is gone;
        // handlers and resolveFlowUndoTarget read the base
        // adapter. Message-plane tenancy rides path.
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);

        // Capture the resolution snapshot BEFORE the fresh save
        // below lands — this is EXACTLY what
        // resolveFlowUndoTarget's own pre-tx read sees inside
        // the live route, at the instant a concurrent write
        // could still race it.
        const undoUriPrefix = canonicalPath(
            organization, '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/undo/',
        );
        const staleResolution = await resolveFlowUndoTarget(
            db, organization, flowId, undoUriPrefix,
        );
        assert(staleResolution, 'a resolution exists');

        // A FRESH save lands through the LIVE route — moves the
        // real head forward, so staleResolution's own `current`
        // is now stale.
        await save(db, token, flowId, 'B', FLOWID_B);

        // Drive the write with the STALE resolution and the
        // tag the client read. The statement finds B at the
        // head and refuses — it must never silently discard B.
        const messagePair = await formWriteMessagePair({
            method: 'POST',
            pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/undo',
            routePattern: 'organizations/:id/flows/:id/undo',
            routeSegments: ['flows', ':id', 'undo'],
            pathSegments: ['flows', flowId, 'undo'],
            headerFields: [{
                name: 'if-match',
                value: '"' + staleResolution!.current.id + '"',
            }],
            body: { eventId: FLOWID_STALE_EV, at: AT },
            requesterIdentityId: actor,
            requestAt: AT,
            organization,
            responseBody: undefined,
            operationId: generateIdentifier(),
            requestId: generateIdentifier(),
        });
        await postFlowUndoOp(
            db, flowId, organization, messagePair,
            staleResolution!,
            { eventId: FLOWID_STALE_EV, at: AT },
        );
        assertStrictEquals(
            writeAnswerOf(messagePair)!.response.status,
            HTTP_PRECONDITION_FAILED,
        );

        // B's content survives untouched — the whole stale-basis
        // transaction landed nothing (atomicity).
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'B',
        );
    }),
);

// -- 6. SIDECAR-KEEP ---------------------------

// graphDelta.deletions / revivals ride the flow
// document-message-pair body (including pairs the UNDO
// route synthesizes).
// C3 retired deriveFlowGraphStates — pin the message
// plane directly: a node deleted by a save, then revived
// by undo, must leave both sidecar entries on stored
// pairs.
Deno.test(
    'SIDECAR-KEEP: undo-authored document message pairs carry'
    + ' deleted/restored sidecars on graphDelta/revivals',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
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
        assertStrictEquals(created.status, 201);

        const got = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
                , token,
        ));
        const etag = got.headers.get('ETag');
        assert(etag
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
        assertStrictEquals(deleted.status, 200);

        const undoAt = '2026-01-01T00:00:02.000000Z';
        const undone = await undo(
            db, token, flowId, FLOWID_UNDO_EV, undoAt,
        );
        assertStrictEquals(undone.status, 200);

        const prefix = canonicalPath('AjdvjuECVZEgZoFajaIEkg'
            , '/flows/');
        const stored = await db.messagePairs.getCollectionPairs(prefix,
        );
        const messagePairs = documentMessagePairsAt(
            stored, prefix,
        )
            .filter((p) => p.name === flowId);
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
        assertEquals(
            states.map((s) => s.state),
            ['deleted', 'restored'],
            'the undo-authored pair\'s own revival is'
            + ' visible on the message plane',
        );
    }),
);

// -- 7. flags are guards, not undo content -----------

// Graph and name are undo content. Locked / Auto Layout /
// Auto Fit are guards: a pair that only changes those
// flags is carried, not restored, not counted. The earlier
// "content-invisible save consumes a step" covenant was
// the old cursor rule; this is the retarget, not a weaken.
// putClient(inPageClient(db)) plus
// getClient().putSessionToken(DEV_TOKEN) makes sessionContext() live
// under Deno.test — the seam earlier comments called
// unreachable.
Deno.test(
    'undo cursor: a flag-only pair is not a step',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
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
        assert(etag, 'no ETag on GET before flag PUT');
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
        assertStrictEquals(flagged.status, 200);

        const first = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assertStrictEquals(first.status, 200);
        const afterFirst = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const firstBody = await afterFirst.json() as {
            name: string;
            is_locked: boolean;
        };
        assertStrictEquals(firstBody.name, 'A');
        assertStrictEquals(
            firstBody.is_locked, !head.is_locked,
            'is_locked stays the current head\'s value',
        );

        const second = await undo(
            db, token, flowId, FLOWID_U2,
            '2026-01-01T00:00:01.000000Z',
        );
        assertStrictEquals(second.status, 200);
        const afterSecond = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const secondBody = await afterSecond.json() as {
            name: string;
            is_locked: boolean;
        };
        assertStrictEquals(secondBody.name, 'genesis');
        assertStrictEquals(
            secondBody.is_locked, !head.is_locked,
            'flag-only pairs are carried, not restored',
        );
    }),
);

Deno.test(
    'undo after lock toggles reverts name not lock',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        putClient(inPageClient(db));
        getClient().putSessionToken(DEV_TOKEN);

        const livePresenter = async (
            migrateToCenter = false,
        ): Promise<FlowDesignerPresenter> => {
            const graph = await getRenderableFlowGraph(
                sessionContext(), flowId,
            );
            const snap = buildInitialFlowSnapshot(
                graph, 800, 600, [], [], [],
            );
            return new FlowDesignerPresenter(
                snap, 800, 600,
                buildFlowHistorySnapshot(
                    (await getFlowVersions(
                        sessionContext(), flowId,
                    )).length > 1,
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

        const graph = await getRenderableFlowGraph(
            sessionContext(), flowId,
        );
        const op = await performUndo(
            sessionContext(),
            buildInitialFlowSnapshot(
                graph, 800, 600, [], [], [],
            ),
            buildFlowHistorySnapshot(true),
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.freshSnap.flowName, 'genesis');
        assertStrictEquals(op.freshSnap.isLocked, false);
    }),
);

Deno.test(
    'undo cursor: eleven saves walk eleven undos —'
    + ' N10 back to genesis, no cap',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
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
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
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
        assertStrictEquals(last.status, 200);
        assertStrictEquals(
            await currentGraphName(
                db, token, flowId,
            ),
            'genesis',
        );
    }),
);

Deno.test(
    'an undo answers the flow\'s state at 200',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);

        const res = await undo(
            db, token, flowId, FLOWID_U1, AT,
        );
        assertStrictEquals(res.status, 200);
        const head = await db.messagePairs.getHeadPair(
            canonicalPath('AjdvjuECVZEgZoFajaIEkg', '/flows/'),
            flowId,
        );
        assert(head, 'the undo leaves a flow head');
        assertStrictEquals(
            res.headers.get('etag'), '"' + head.id + '"',
        );
        const body = await res.json() as Record<string, unknown>;
        assertEquals(body, responseRecordOf(head.response));
        assertStrictEquals(body['name'], 'genesis');
        assertStrictEquals(body['state_event_id'], FLOWID_U1);
        assert('graphDelta' in body, 'the state has graphDelta');
        assert('revivals' in body, 'the state has revivals');
    }),
);

Deno.test(
    'a stale undo tag is 412 from the statement',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        const backend = db.backend as MemoryStorageBackend;
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', FLOWID_A);
        const read = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId, token,
        ));
        const stale = read.headers.get('ETag');
        await read.body?.cancel();
        assert(stale, 'no ETag on the flow GET');
        await save(db, token, flowId, 'B', FLOWID_B);

        const before = (await db.messagePairs.getAll()).length;
        const statements = backend.statementExecutions();
        const res = await handleRequest(db, req(
            'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/undo', token,
            { eventId: FLOWID_U1, at: AT },
            { 'if-match': stale },
        ));
        assertStrictEquals(res.status, 412);
        const refusal = await res.json() as { error: string };
        assertMatch(refusal.error, /^If-Match does not match/);
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
        assertStrictEquals(
            backend.statementExecutions(), statements + 1,
        );
        assertStrictEquals(
            await currentGraphName(db, token, flowId), 'B',
        );
    }),
);
