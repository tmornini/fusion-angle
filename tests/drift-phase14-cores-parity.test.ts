import { assertEquals, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../shared/types.ts';
import {
    workOrderLifecycleStatesFor,
} from '../api/derive-states.ts';
import {
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const N_FINISH = generateIdentifier();
const EDGE_2 = generateIdentifier();
const WORKORDERID_FWO = generateIdentifier();
const WORKORDERID_EV1 = generateIdentifier();
const WORKORDERID_EV2 = generateIdentifier();
const WORKORDERID_EV3 = generateIdentifier();

// The Author gate 1 rule (e) pre-tx-vs-in-tx PARITY pin for
// the Phase 14 Task 1 core workOrderLifecycleStatesFor — the
// membershipExistsFor precedent
// (tests/drift-memberships-identity.test.ts leg 5): the core is
// called BOTH pre-tx (the plain adapter) and in-tx (an open
// read-transaction view) and proven byte-identical.
// postWorkOrderClaimOp reads heads before its statement and
// opens no transaction, so the pin proves the core reads the
// same inside and outside one. The invitation cores' pins
// retired with the cores: the invitation routes read the
// document head. workOrderClaimHistoryFor's pin
// retired with the replayer: the claim reads the work
// order's head. documentStateHeadFor pins retired with C5
// (the helper itself is gone).

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// -- workOrderLifecycleStatesFor ---------------------------------

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Parity Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [
            {
                id: N_START, name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_MIDDLE, name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_FINISH, name: 'Finish',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg', name: '',
                fromNodeId: N_START, toNodeId: N_MIDDLE,
            },
            {
                id: EDGE_2, name: '',
                fromNodeId: N_MIDDLE, toNodeId: N_FINISH,
            },
        ],
    };
}

const EMPTY_FLOW_ID = 'GgfDbXOJUvvaCekCTcvhuw';

Deno.test('workOrderLifecycleStatesFor: byte-identical pre-tx (the'
+ ' plain adapter) vs in-tx (an open read-transaction view)',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'parity-' + workOrderId,
                flow_graph: graph, position: 1,
            },
            flowWorkOrderId: WORKORDERID_FWO,
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId, at: nowUtc(),
            },
            stateEventIds: [
                WORKORDERID_EV1,
                WORKORDERID_EV2,
                WORKORDERID_EV3,
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: [N_START, N_MIDDLE, 'claimed'],
        },
    ));
    assertStrictEquals(created.status, 201);

    // Phase Final Task 2: work_orders dropped from claim tx.
    const preTx = await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const inTx = await db.readTransaction(
        (view) => workOrderLifecycleStatesFor(
            view, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assertEquals(inTx, preTx);
    assertStrictEquals(preTx.length, 3);

    const preTxMissing = await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
    );
    const inTxMissing = await db.readTransaction(
        (view) => workOrderLifecycleStatesFor(
            view, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
        ),
    );
    assertEquals(inTxMissing, preTxMissing);
    assertEquals(preTxMissing, []);
});

