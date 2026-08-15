import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { UniqueConstraintError } from '../api/db.ts';
import { handleRequest, RequestError } from '../api/api.ts';
import { postFlowUndoOp } from '../api/routes.ts';
import {
    documentPairsAt,
} from '../api/derive-documents.ts';
import {
    resolveFlowUndoTarget,
} from '../api/derive-flows.ts';
import {
    formWritePair, canonicalUriPrefix,
} from '../api/message-pair.ts';
import {
    organizationToken, DEV_TOKEN,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postFlowCreation,
    putFlow,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import {
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from '../web-app/app/presenters/flow-designer.ts';
import { performUndo } from '../web-app/app/flow-operations.ts';
import type { GraphNode } from '../api/types.ts';

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

function graphOf(name: string) {
    return {
        nodes: [{
            id: 'n-' + name,
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
        'POST', '/flows', token, {
            id: flowId,
            flow: flowFields('genesis'),
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: 'proj-1',
                flow_id: flowId, at: AT,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(created.status, 204);
}

async function headResponseId(
    db: MemoryDbAdapter, token: string, flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert.ok(id, 'no Response-ID on GET /flows/' + flowId);
    return id!;
}

// A genuine save, echoing the current head — the ONLY way undo-
// as-replay's document-pair history grows (matches a real
// putFlow). `name` becomes both this save's own flow name and
// its one node's id (see graphOf), so later assertions can name
// which save undo landed on just by reading the restored graph.
async function save(
    db: MemoryDbAdapter, token: string, flowId: string,
    name: string, eventId: string,
): Promise<void> {
    const head = await headResponseId(db, token, flowId);
    const res = await handleRequest(db, req(
        'PUT', '/flows/' + flowId, token,
        documentBody(name, eventId),
        { 'if-match': '"' + head + '"' },
    ));
    assert.equal(res.status, 200);
}

async function undo(
    db: MemoryDbAdapter, token: string, flowId: string,
    eventId: string, at: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/flows/' + flowId + '/undo', token,
        { eventId, at },
    ));
}

async function currentGraphName(
    db: MemoryDbAdapter, token: string, flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/flows/' + flowId, token,
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
        const flowId = 'cursor-single';
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', flowId + '-a');
        await save(db, token, flowId, 'B', flowId + '-b');

        const res = await undo(
            db, token, flowId, flowId + '-u1', AT,
        );
        assert.equal(res.status, 204);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
        );
    },
);

// -- 2. undo-undo (consecutive) ----------------

// The case a naive "N document pairs back" count gets wrong: a
// SECOND consecutive undo must walk FURTHER back (to genesis),
// never oscillate back to B (the state the FIRST undo just
// left).
test(
    'undo cursor: undo-undo walks further back, never'
    + ' oscillating between the two most recent states',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = 'cursor-undo-undo';
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', flowId + '-a');
        await save(db, token, flowId, 'B', flowId + '-b');

        const first = await undo(
            db, token, flowId, flowId + '-u1', AT,
        );
        assert.equal(first.status, 204);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
            'first undo lands on A',
        );

        const second = await undo(
            db, token, flowId, flowId + '-u2',
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(second.status, 204);
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
        const flowId = 'cursor-branch';
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', flowId + '-a');
        await save(db, token, flowId, 'B', flowId + '-b');

        await undo(db, token, flowId, flowId + '-u1', AT);
        await undo(
            db, token, flowId, flowId + '-u2',
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
            'undo-undo reaches genesis before the new save',
        );

        // A NEW edit, made from the genesis baseline — A and B
        // are now an abandoned branch.
        await save(db, token, flowId, 'D', flowId + '-d');
        assert.equal(
            await currentGraphName(db, token, flowId), 'D',
        );

        const third = await undo(
            db, token, flowId, flowId + '-u3',
            '2026-01-01T00:00:02.000000Z',
        );
        assert.equal(third.status, 204);
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
        const flowId = 'cursor-exhausted';
        await createFlow(db, token, flowId);

        const before = await db.requests.getAll();
        const res = await undo(
            db, token, flowId, flowId + '-u1', AT,
        );
        assert.equal(res.status, 204);

        const after = await db.requests.getAll();
        assert.equal(
            after.length, before.length + 1,
            'exhaustion appends exactly the operation pair'
            + ' — no document pair',
        );
        assert.equal(
            await currentGraphName(db, token, flowId), 'genesis',
        );

        // A SECOND exhausted undo must ALSO no-op (the first
        // exhausted attempt's own operation pair must not
        // desync a later replay).
        const again = await undo(
            db, token, flowId, flowId + '-u2',
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(again.status, 204);
        const afterAgain = await db.requests.getAll();
        assert.equal(
            afterAgain.length, after.length + 1,
            'a second exhausted undo ALSO appends only its'
            + ' own operation pair',
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
        const flowId = 'cursor-retry';
        const ctx = createRequestContext(db, DEV_TOKEN);
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'project-1',
            name: 'Retry Flow',
        });
        await putFlow(ctx, flowId, {
            name: 'Retry Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [buildNode('a')],
            edges: [],
        });

        let posts = 0;
        const flaky: RequestContext = {
            ...ctx,
            POST: <T>(
                resource: string,
                body: Record<string, unknown>,
            ): Promise<T> => {
                if (resource === 'flows/' + flowId + '/undo') {
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
            buildNode('a'),
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

// Review finding, fix wave: the undo write's `follows` MUST
// derive from the SAME read that produced the diff basis
// (resolveFlowUndoTarget's own `current`), never a second,
// independent headPairIdAt read — otherwise a save landing
// AFTER the snapshot was captured (a genuine cross-tab window
// CLAUDE.md's cross-tab doctrine anticipates) lets the undo
// write succeed anchored to the FRESH head while its own
// delta/revivals still reflect the STALE snapshot, silently
// discarding the concurrent save instead of colliding and
// 412ing. This drives postFlowUndoOp DIRECTLY (the seam the fix
// extracted) with a DELIBERATELY stale resolution, bypassing
// the live route's always-fresh resolveFlowUndoTarget call —
// the only way to construct this exact window deterministically
// rather than racing a timer.
test(
    'undo cursor (fix wave): a write driven by a STALE'
    + ' resolution snapshot 412s — it must never silently'
    + ' overwrite a save that landed after the snapshot'
    + ' was taken',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = 'stale-basis';
        const organization = '1';
        const actor = 'current';
        // Phase Final Task 5: the store decorator is gone;
        // handlers and resolveFlowUndoTarget read the base
        // adapter. Pair-plane tenancy rides uri_prefix.
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', flowId + '-a');

        // Capture the resolution snapshot BEFORE the fresh save
        // below lands — this is EXACTLY what
        // resolveFlowUndoTarget's own pre-tx read sees inside
        // the live route, at the instant a concurrent write
        // could still race it.
        const undoUriPrefix = canonicalUriPrefix(
            organization, '/flows/' + flowId + '/undo/',
        );
        const staleResolution = await resolveFlowUndoTarget(
            db, organization, flowId, undoUriPrefix,
        );
        assert.ok(staleResolution, 'a resolution exists');

        // A FRESH save lands through the LIVE route — moves the
        // real head forward, so staleResolution's own `current`
        // is now stale.
        await save(db, token, flowId, 'B', flowId + '-b');

        // Drive the write with the STALE resolution. Before the
        // fix, `follows` came from formDocumentPairFor's OWN
        // independent headPairIdAt read, which would see B's
        // FRESH head and anchor there — landing successfully
        // (no collision) while delta/revivals still reflected
        // the stale snapshot, silently discarding B. Anchored
        // to staleResolution's own current.id (this test's
        // fix), it instead collides with B's OWN follows claim
        // on the SAME pre-race head and 412s
        // (UniqueConstraintError — api.ts's own mapping for a
        // live request; this test drives the op directly, so it
        // observes the raw error class the gate maps FROM).
        const pair = await formWritePair({
            method: 'POST',
            pathname: '/flows/' + flowId + '/undo',
            routePattern: 'flows/:id/undo',
            routeSegments: ['flows', ':id', 'undo'],
            pathSegments: ['flows', flowId, 'undo'],
            headerFields: [],
            body: { eventId: flowId + '-stale-ev', at: AT },
            requesterIdentityId: actor,
            requestAt: AT,
            organization,
            responseStatus: 204,
            responseBody: undefined,
            headPairId: undefined,
        });
        await assert.rejects(
            () => postFlowUndoOp(
                db, flowId, actor, organization, pair,
                staleResolution!,
                { eventId: flowId + '-stale-ev', at: AT },
            ),
            UniqueConstraintError,
        );

        // B's content survives untouched — the whole stale-basis
        // transaction landed nothing (atomicity).
        assert.equal(
            await currentGraphName(db, token, flowId), 'B',
        );
    },
);

// -- 6. SIDECAR-KEEP ---------------------------

// graphDelta.deletions / revivals ride the flow document-
// pair body (including pairs the UNDO route synthesizes).
// C3 retired deriveFlowGraphStates — pin the pair plane
// directly: a node deleted by a save, then revived by undo,
// must leave both sidecar entries on stored pairs.
test(
    'SIDECAR-KEEP: undo-authored document pairs carry'
    + ' deleted/restored sidecars on graphDelta/revivals',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = 'sidecar-undo';
        const nodeId = 'sidecar-node';

        const created = await handleRequest(db, req(
            'POST', '/flows', token, {
                id: flowId,
                flow: flowFields('Sidecar Flow'),
                projectFlowId: flowId + '-pf',
                projectFlow: {
                    project_id: 'proj-1',
                    flow_id: flowId, at: AT,
                },
                initialState: 'active',
                initialStateEventId: flowId + '-ev',
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
        assert.equal(created.status, 204);

        const head = await headResponseId(db, token, flowId);
        const deleteAt = '2026-01-01T00:00:01.000000Z';
        const deleted = await handleRequest(db, req(
            'PUT', '/flows/' + flowId, token,
            documentBody(
                'Sidecar Trimmed', flowId + '-del', {
                    state_at: deleteAt,
                    graph: { nodes: [], edges: [] },
                    graphDelta: {
                        ...emptyDelta(),
                        deletions: [{
                            eventId: flowId + '-node-del',
                            entityId: nodeId, at: deleteAt,
                        }],
                    },
                },
            ),
            { 'if-match': '"' + head + '"' },
        ));
        assert.equal(deleted.status, 200);

        const undoAt = '2026-01-01T00:00:02.000000Z';
        const undone = await undo(
            db, token, flowId, flowId + '-undo-ev', undoAt,
        );
        assert.equal(undone.status, 204);

        const prefix = canonicalUriPrefix('1', '/flows/');
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_prefix', prefix),
            db.responses.getAllWhere('uri_prefix', prefix),
        ]);
        const pairs = documentPairsAt(
            requests, responses, prefix,
        ).filter((p) => p.uriId === flowId);
        const states: { state: string; at: string }[] = [];
        for (const pair of pairs) {
            const delta = pair.body['graphDelta'];
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
            const revivals = pair.body['revivals'];
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
            + ' visible on the pair plane',
        );
    },
);

// -- 7. fix wave 2 (Task 11 browser regression) ------

// ROOT CAUSE, wire evidence, and the two fixes are narrated in
// full in .superpowers/sdd/phase14-task-8-report.md's
// "Fix wave 2" section. Short version: web-app/flows/detail.ts's
// handleUndo/handleRedo used to follow their OWN commit with
// commitAndFit(pageState.presenter().withLayoutReconciled()) —
// a SAVE-TRIGGERING call, even though op.freshSnap already
// carries server-reconciled positions (performUndo/performRedo
// build it from getFlowGraph, whose withRenderableLayout ALWAYS
// recomputes fresh positions for an auto-layout flow, purely
// client-side). That redundant save landed its own document
// pair immediately after every undo/redo click — and the cursor
// (resolveFlowUndoTarget) correctly, BY DESIGN, treats every
// flows/:id document pair as a full history step (that's the
// whole point of undo-as-replay) — so it "ate" the NEXT undo
// click, which reverted the reconcile noise instead of reaching
// the user's actual prior edit. The fix (removing the two
// commitAndFit(...withLayoutReconciled()) calls,
// web-app/flows/detail.ts) is NOT reachable from this test file:
// it is a page-level DOM change with no automated seam
// (FlowDesignerPresenter#queueSave calls sessionContext()
// internally, which requires a real browser IndexedDB
// connection — "IndexedDB has no Node stub, and we add no fake"
// per web-app/app/adapters/init.ts's own comment;
// tests/flow-designer-presenter.test.ts's own header comment
// independently documents the SAME wall for every
// #queueSave-triggering presenter method). This test instead
// pins the MECHANISM the fix prevents from ever occurring: an
// interleaved, content-invisible reconcile-only save DOES
// consume an undo step, at the server-side cursor level — proof
// that the fix (stopping the client from ever queuing such a
// save after undo/redo) is necessary and correctly targeted.
// The fix's ACTUAL effect (no such save is queued any more) is
// verified in the browser, not here — see the report's browser
// re-sweep.
test(
    'undo cursor (fix wave 2): an interleaved, content-'
    + 'invisible reconcile-only save consumes an undo step —'
    + ' the mechanism the detail.ts fix (dropping'
    + ' handleUndo/handleRedo\'s own extra commitAndFit) now'
    + ' prevents from ever being queued',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = 'cursor-reconcile-noise';
        await createFlow(db, token, flowId);
        await save(db, token, flowId, 'A', flowId + '-a');
        await save(db, token, flowId, 'B', flowId + '-b');

        // Undo #1 (the user's first click): reverts B -> A.
        const first = await undo(
            db, token, flowId, flowId + '-u1', AT,
        );
        assert.equal(first.status, 204);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
        );

        // The OLD, buggy handleUndo/handleRedo pattern: an
        // auto-layout reconcile save with the SAME name (no
        // visible change) immediately after the undo — exactly
        // what commitAndFit(...withLayoutReconciled()) used to
        // queue. A genuine document pair despite changing
        // nothing the user perceives.
        await save(
            db, token, flowId, 'A', flowId + '-reconcile',
        );

        // Undo #2 (the user's second click): with the reconcile
        // noise present, it lands back on 'A' AGAIN — the SAME
        // content undo #1 already reached — never progressing
        // to a NEW, earlier state. This is precisely the Task 11
        // browser report's "Undo flips the toolbar but the
        // canvas never visibly changes."
        const second = await undo(
            db, token, flowId, flowId + '-u2',
            '2026-01-01T00:00:01.000000Z',
        );
        assert.equal(second.status, 204);
        assert.equal(
            await currentGraphName(db, token, flowId), 'A',
            'without the fix, a second undo click cannot make'
            + ' visible progress past the reconcile noise —'
            + ' this is the danger the detail.ts fix closes',
        );
    },
);
