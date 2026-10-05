import {
    assertEquals, assertNotStrictEquals, assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    canonicalPath,
} from '../api/message-pair.ts';
import {
    DEV_TOKEN,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import { inPageContext } from './in-page-facade.ts';
import {
    putFlow,
    enqueueFlowSave,
} from '../client/flow-mutations.ts';
import {
    getRenderableFlowGraph,
} from '../web-app/app/flow-graph-layout.ts';
import {
    buildStartAndCompleteNodes,
} from '../client/flow-defaults.ts';
import { getFlowVersions } from '../client/flow-queries.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from
    '../web-app/app/presenters/flow-designer.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { inPageClient } from
    './in-page-facade.ts';
import {
    getClient,
    putClient,
} from '../web-app/app/client.ts';
import { performUndo } from
    '../web-app/app/flow-operations.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const CANVAS_W = 800;
const CANVAS_H = 600;

// flow-operations.ts -> logger.ts -> preferences.ts reads
// localStorage lazily, only on a log.* call in an error
// path (mirrors flow-undo-cursor.test.ts).
const NULL_STORAGE: Partial<Storage> = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

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

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<void> {
    const created = await handleRequest(db, req(
        'POST',
        '/organizations/' + ORGANIZATION
            + '/flows/',
        token,
        {
            id: flowId,
            flow: flowFields('genesis'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id:
                    'qfhFObbtDfxUZwEGxySBoQ',
                flow_id: flowId, at: AT,
            },
            initialState: 'active',
            initialStateEventId:
                generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
    assertStrictEquals(created.status, 201);
}

async function flowDocumentPairCount(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<number> {
    const prefix = canonicalPath(
        undefined,
        '/organizations/' + ORGANIZATION
            + '/flows/',
    );
    const stored = await db.messagePairs
        .getCollectionPairs(prefix);
    return documentMessagePairsAt(
        stored, prefix,
    ).filter(
        (messagePair) =>
            messagePair.name === flowId,
    ).length;
}

Deno.test(
    'opening a flow does not append pairs',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        putClient(inPageClient(db));
        getClient().putSessionToken(DEV_TOKEN);
        const flowId = generateIdentifier();
        await createFlow(db, DEV_TOKEN, flowId);
        const ctx = inPageContext(
            db, DEV_TOKEN,
        );
        const { start, complete } =
            buildStartAndCompleteNodes();
        await putFlow(ctx, flowId, {
            name: 'Alpha Renamed',
            isLocked: false,
            isAutoLayout: true,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [start, complete],
            edges: [],
        });
        const n = await flowDocumentPairCount(
            db, flowId,
        );
        const graph = await getRenderableFlowGraph(
            ctx, flowId,
        );
        const snap = buildInitialFlowSnapshot(
            graph, CANVAS_W, CANVAS_H,
            [], [], [],
        );
        const presenter =
            new FlowDesignerPresenter(
                snap, CANVAS_W, CANVAS_H,
                buildFlowHistorySnapshot(
                    (await getFlowVersions(ctx, flowId))
                        .length > 1,
                ),
            );
        presenter.withCanvasSize(
            CANVAS_W, CANVAS_H,
        );
        const opened =
            presenter.withLayoutReconciled();
        await enqueueFlowSave(
            flowId, async () => undefined,
        );
        assertStrictEquals(
            await flowDocumentPairCount(
                db, flowId,
            ),
            n,
        );
        const op = await performUndo(
            ctx, opened,
            buildFlowHistorySnapshot(true),
            graph.message,
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertNotStrictEquals(
            op.freshSnap.flowName,
            'Alpha Renamed',
        );
    }),
);

Deno.test(
    'a rename with no target appends no pair',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        putClient(inPageClient(db));
        getClient().putSessionToken(DEV_TOKEN);
        const flowId = generateIdentifier();
        await createFlow(db, DEV_TOKEN, flowId);
        const ctx = inPageContext(db, DEV_TOKEN);
        const graph = await getRenderableFlowGraph(ctx, flowId);
        const snap = buildInitialFlowSnapshot(
            graph, CANVAS_W, CANVAS_H, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, CANVAS_W, CANVAS_H,
            buildFlowHistorySnapshot(
                (await getFlowVersions(ctx, flowId)).length > 1,
            ),
        );
        const n = await flowDocumentPairCount(db, flowId);
        presenter.withNodeNamed('missing', 'typed');
        await enqueueFlowSave(flowId, async () => undefined);
        assertStrictEquals(
            await flowDocumentPairCount(db, flowId), n,
        );
    }),
);

// onFlowLoaded's boot, minus the DOM: read the renderable
// graph, build the one per-load presenter, size its canvas,
// and reconcile its layout — the snapshot boot paints.
async function bootDesigner(
    ctx: ReturnType<typeof inPageContext>,
    flowId: string,
): Promise<FlowSnapshot> {
    const graph = await getRenderableFlowGraph(ctx, flowId);
    const presenter = new FlowDesignerPresenter(
        buildInitialFlowSnapshot(
            graph, CANVAS_W, CANVAS_H, [], [], [],
        ),
        CANVAS_W, CANVAS_H,
        buildFlowHistorySnapshot(
            (await getFlowVersions(ctx, flowId)).length > 1,
        ),
    );
    presenter.withCanvasSize(CANVAS_W, CANVAS_H);
    return presenter.withLayoutReconciled();
}

Deno.test(
    'with Auto Layout off, boot paints the positions'
    + ' the designer left (F30)',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        putClient(inPageClient(db));
        getClient().putSessionToken(DEV_TOKEN);
        const flowId = generateIdentifier();
        await createFlow(db, DEV_TOKEN, flowId);
        const ctx = inPageContext(db, DEV_TOKEN);
        const { start, complete } =
            buildStartAndCompleteNodes();
        const panel = {
            ...start,
            id: generateIdentifier(),
            name: 'Panel B',
            isCreate: false,
        };
        await putFlow(ctx, flowId, {
            name: 'Layout Test',
            isLocked: false,
            isAutoLayout: true,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [start, panel, complete],
            edges: [
                {
                    id: generateIdentifier(), name: '',
                    fromNodeId: start.id,
                    toNodeId: panel.id,
                },
                {
                    id: generateIdentifier(), name: 'Done',
                    fromNodeId: panel.id,
                    toNodeId: complete.id,
                },
            ],
        });
        const history = buildFlowHistorySnapshot(true);
        const off = new FlowDesignerPresenter(
            await bootDesigner(ctx, flowId),
            CANVAS_W, CANVAS_H, history,
        ).withAutoLayoutToggled();
        const left = new FlowDesignerPresenter(
            off, CANVAS_W, CANVAS_H, history,
        ).withNodeNamed(panel.id, 'Panel B F30');
        await enqueueFlowSave(flowId, async () => undefined);
        const back = await bootDesigner(ctx, flowId);
        assertStrictEquals(back.isAutoLayout, false);
        assertEquals(
            back.nodes.map(n => [
                n.name, n.positionX, n.positionY,
            ]),
            left.nodes.map(n => [
                n.name, n.positionX, n.positionY,
            ]),
        );
    }),
);
