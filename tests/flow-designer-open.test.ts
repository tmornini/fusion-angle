import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    canonicalUriCollection,
} from '../api/message-pair.ts';
import {
    DEV_TOKEN,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    putFlow,
    enqueueFlowSave,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    getFlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';
import {
    buildStartAndCompleteNodes,
} from '../web-app/app/adapters/flow-defaults.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
} from
    '../web-app/app/presenters/flow-designer.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { wrapInPageAdapter } from
    './in-page-facade.ts';
import { putClientFacade } from
    '../web-app/app/adapters/facade-holder.ts';
import { putSessionToken } from
    '../web-app/app/adapters/session-token.ts';

// flow-operations.ts -> logger.ts -> preferences.ts reads
// localStorage, absent in Node — stub it before any log.*
// call in an error path (mirrors flow-undo-cursor.test.ts).
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

import { performUndo } from
    '../web-app/app/flow-operations.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const CANVAS_W = 800;
const CANVAS_H = 600;

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
    assert.equal(created.status, 201);
}

async function flowDocumentPairCount(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<number> {
    const prefix = canonicalUriCollection(
        undefined,
        '/organizations/' + ORGANIZATION
            + '/flows/',
    );
    const stored = await db.messagePairs
        .getAllWhere('uri_collection', prefix);
    return documentMessagePairsAt(
        stored, prefix,
    ).filter(
        (messagePair) =>
            messagePair.uriId === flowId,
    ).length;
}

test(
    'opening a flow does not append pairs',
    async () => {
        const db = await freshDb();
        putClientFacade(wrapInPageAdapter(db));
        putSessionToken(DEV_TOKEN);
        const flowId = generateIdentifier();
        await createFlow(db, DEV_TOKEN, flowId);
        const ctx = createRequestContext(
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
        const graph = await getFlowGraph(
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
                    graph.hasUndoHistory,
                ),
                true,
            );
        presenter.withCanvasSize(
            CANVAS_W, CANVAS_H,
        );
        const opened =
            presenter.withLayoutReconciled();
        await enqueueFlowSave(
            flowId, async () => undefined,
        );
        assert.equal(
            await flowDocumentPairCount(
                db, flowId,
            ),
            n,
        );
        const op = await performUndo(
            ctx, opened,
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.notEqual(
            op.freshSnap.flowName,
            'Alpha Renamed',
        );
    },
);
