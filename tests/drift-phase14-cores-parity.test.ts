import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../api/types.ts';
import { invitationOpStateFor } from '../api/derive-invitations.ts';
import {
    invitationLifecycleStatesFor,
    workOrderLifecycleStatesFor,
    workOrderClaimHistoryFor,
} from '../api/derive-states.ts';
import {
    ORGANIZATION_TWO,
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_PARITY_OPSTATE_ACCEPTED = generateIdentifier();
const NO_SUCH_INVITATION = generateIdentifier();
const INV_PARITY_LIFECYCLE_REVOKED = generateIdentifier();
const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const N_FINISH = generateIdentifier();
const EDGE_2 = generateIdentifier();
const WO_PARITY_CLAIM_HISTORY = generateIdentifier();
const INVITATIONID_GRANT = generateIdentifier();
const ID_MS = generateIdentifier();
const ID_ACCEPT = generateIdentifier();
const ID_REVOKE = generateIdentifier();
const WORKORDERID_FWO = generateIdentifier();
const WORKORDERID_EV1 = generateIdentifier();
const WORKORDERID_EV2 = generateIdentifier();
const WORKORDERID_EV3 = generateIdentifier();

// The Author gate 1 rule (e) pre-tx-vs-in-tx PARITY pins for the
// three Phase 14 Task 1 cores (invitationOpStateFor,
// invitationLifecycleStatesFor, workOrderLifecycleStatesFor) —
// the membershipExistsFor / deriveIdentityTokenEventsForJti
// precedent (tests/drift-memberships-identity.test.ts leg 5,
// tests/drift-identity-tokens.test.ts legs 3/5): each core is
// called BOTH pre-tx (the plain adapter) and in-tx (an open
// db.transaction view sharing its EVENTUAL write-gate caller's
// own table list — invitations-domain.ts's accept/decline/
// revoke transactions and routes.ts's postWorkOrderClaimOp) and
// proven byte-identical. Below, workOrderClaimHistoryFor (Phase
// 14 Task 4's own claim-gate source, the SIBLING that unions
// workOrderLifecycleStatesFor's replayed events with this
// entity's states/:id rows) gets the SAME pin — the write path
// this ONE calls (postWorkOrderClaimOp) is live since Task 4;
// the other two cores' own write paths (invitations-domain.ts)
// land in a later task. documentStateHeadFor pins retired with
// C5 (the helper itself is gone).

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
        operationId: TEST_OPERATION_ID,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email: string,
): Promise<void> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email,
            invitationId,
            grantEventId: INVITATIONID_GRANT,
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 200);
}

// -- invitationOpStateFor --------------------------------------

test('invitationOpStateFor: byte-identical pre-tx (the plain'
+ ' adapter) vs in-tx (an open db.transaction view sharing'
+ ' acceptInvitation\'s own table list) — the membershipExistsFor'
+ ' precedent', async () => {
    const db = await seededDb();
    const id = INV_PARITY_OPSTATE_ACCEPTED;
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    await grant(db, id, 'sarah.chen@company.com');
    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'accepted',
            membershipId: ID_MS,
            eventId: ID_ACCEPT,
            at: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 204);

    // Phase Final Task 2: memberships ROW half stripped from
    // acceptInvitation's tx list.
    const acceptTxTables = MESSAGE_TABLES;
    const preTx = await invitationOpStateFor(db, id);
    const inTx = await db.transaction(
        acceptTxTables,
        (view) => invitationOpStateFor(view, id),
    );
    assert.equal(inTx, preTx);
    assert.equal(preTx, 'accepted');

    // A never-granted id, same parity.
    const preTxMissing = await invitationOpStateFor(
        db, NO_SUCH_INVITATION,
    );
    const inTxMissing = await db.transaction(
        acceptTxTables,
        (view) =>
            invitationOpStateFor(view, NO_SUCH_INVITATION),
    );
    assert.equal(inTxMissing, preTxMissing);
    assert.equal(preTxMissing, undefined);
});

// -- invitationLifecycleStatesFor --------------------------------

test('invitationLifecycleStatesFor: byte-identical pre-tx (the'
+ ' plain adapter) vs in-tx (an open db.transaction view sharing'
+ ' revokeInvitation\'s own table list)', async () => {
    const db = await seededDb();
    const id = INV_PARITY_LIFECYCLE_REVOKED;
    await grant(db, id, 'emily.rodriguez@company.com');
    const revoke = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO),
        {
            state: 'revoked',
            eventId: ID_REVOKE,
            at: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(revoke.status, 204);

    const revokeTxTables = MESSAGE_TABLES;
    const preTx = await invitationLifecycleStatesFor(db, id);
    const inTx = await db.transaction(
        revokeTxTables,
        (view) => invitationLifecycleStatesFor(view, id),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx.length, 2);

    const preTxMissing = await invitationLifecycleStatesFor(
        db, NO_SUCH_INVITATION,
    );
    const inTxMissing = await db.transaction(
        revokeTxTables,
        (view) =>
            invitationLifecycleStatesFor(
                view, NO_SUCH_INVITATION,
            ),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});

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

test('workOrderLifecycleStatesFor: byte-identical pre-tx (the'
+ ' plain adapter) vs in-tx (an open db.transaction view sharing'
+ ' postWorkOrderClaimOp\'s own table list)', async () => {
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
    assert.equal(created.status, 201);

    // Phase Final Task 2: work_orders dropped from claim tx.
    const claimTxTables = MESSAGE_TABLES;
    const preTx = await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const inTx = await db.transaction(
        claimTxTables,
        (view) => workOrderLifecycleStatesFor(
            view, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx.length, 3);

    const preTxMissing = await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
    );
    const inTxMissing = await db.transaction(
        claimTxTables,
        (view) => workOrderLifecycleStatesFor(
            view, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
        ),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});

// -- workOrderClaimHistoryFor -------------------------------------

// The claim gate's OWN source (Phase 14 Task 4) — the SAME
// pin as workOrderLifecycleStatesFor above, over
// postWorkOrderClaimOp's REAL table list (this core's only
// live caller since this task).
test('workOrderClaimHistoryFor: byte-identical pre-tx (the'
+ ' plain adapter) vs in-tx (an open db.transaction view sharing'
+ ' postWorkOrderClaimOp\'s own table list)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = WO_PARITY_CLAIM_HISTORY;
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
    assert.equal(created.status, 201);

    // Phase Final Task 2: work_orders dropped from claim tx.
    const claimTxTables = MESSAGE_TABLES;
    const preTx = await workOrderClaimHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    const inTx = await db.transaction(
        claimTxTables,
        (view) => workOrderClaimHistoryFor(
            view, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx.length, 3);

    const preTxMissing = await workOrderClaimHistoryFor(
        db, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
    );
    const inTxMissing = await db.transaction(
        claimTxTables,
        (view) => workOrderClaimHistoryFor(
            view, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
        ),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});
