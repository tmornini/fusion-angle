import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { jsonObjectField, nowUtc } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
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

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email: string,
): Promise<void> {
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email,
            invitationId,
            grantEventId: invitationId + '-grant',
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
    const id = 'inv-parity-opstate-accepted';
    const inviteeId = 'LhfaUUf4IumVsCSGB4xjdK'; // Sarah Chen
    await grant(db, id, 'sarah.chen@company.com');
    const accept = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            membershipId: id + '-ms',
            acceptEventId: id + '-accept',
            acceptAt: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 204);

    // Phase Final Task 2: memberships ROW half stripped from
    // acceptInvitation's tx list.
    const acceptTxTables = [
        'requests', 'responses',
    ];
    const preTx = await invitationOpStateFor(db, id);
    const inTx = await db.transaction(
        acceptTxTables,
        (view) => invitationOpStateFor(view, id),
    );
    assert.equal(inTx, preTx);
    assert.equal(preTx, 'accepted');

    // A never-granted id, same parity.
    const preTxMissing = await invitationOpStateFor(
        db, 'no-such-invitation',
    );
    const inTxMissing = await db.transaction(
        acceptTxTables,
        (view) =>
            invitationOpStateFor(view, 'no-such-invitation'),
    );
    assert.equal(inTxMissing, preTxMissing);
    assert.equal(preTxMissing, undefined);
});

// -- invitationLifecycleStatesFor --------------------------------

test('invitationLifecycleStatesFor: byte-identical pre-tx (the'
+ ' plain adapter) vs in-tx (an open db.transaction view sharing'
+ ' revokeInvitation\'s own table list)', async () => {
    const db = await seededDb();
    const id = 'inv-parity-lifecycle-revoked';
    await grant(db, id, 'emily.rodriguez@company.com');
    const revoke = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await organizationToken('current', ORGANIZATION_TWO),
        {
            revokeEventId: id + '-revoke',
            revokeAt: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(revoke.status, 204);

    const revokeTxTables = ['requests', 'responses'];
    const preTx = await invitationLifecycleStatesFor(db, id);
    const inTx = await db.transaction(
        revokeTxTables,
        (view) => invitationLifecycleStatesFor(view, id),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx.length, 2);

    const preTxMissing = await invitationLifecycleStatesFor(
        db, 'no-such-invitation',
    );
    const inTxMissing = await db.transaction(
        revokeTxTables,
        (view) =>
            invitationLifecycleStatesFor(
                view, 'no-such-invitation',
            ),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});

// -- workOrderLifecycleStatesFor ---------------------------------

function workOrderFlowGraph(lockTimeoutSeconds: number): string {
    return jsonObjectField({
        name: 'Parity Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [
            {
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-middle', name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-finish', name: 'Finish',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'e1', name: '',
                fromNodeId: 'n-start', toNodeId: 'n-middle',
            },
            {
                id: 'e2', name: '',
                fromNodeId: 'n-middle', toNodeId: 'n-finish',
            },
        ],
    });
}

const EMPTY_FLOW_ID = 'E2BnBlZyrriqsQYkmS4usb';

test('workOrderLifecycleStatesFor: byte-identical pre-tx (the'
+ ' plain adapter) vs in-tx (an open db.transaction view sharing'
+ ' postWorkOrderClaimOp\'s own table list)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-parity-chain';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'parity-' + workOrderId,
                flow_graph: graph, position: 1,
            },
            flowWorkOrderId: workOrderId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId, at: nowUtc(),
            },
            stateEventIds: [
                workOrderId + '-ev1',
                workOrderId + '-ev2',
                workOrderId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-middle', 'claimed'],
        },
    ));
    assert.equal(created.status, 204);

    // Phase Final Task 2: work_orders dropped from claim tx.
    const claimTxTables = [
        'requests', 'responses',
    ];
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
        db, STARK_ORGANIZATION, 'no-such-work-order',
    );
    const inTxMissing = await db.transaction(
        claimTxTables,
        (view) => workOrderLifecycleStatesFor(
            view, STARK_ORGANIZATION, 'no-such-work-order',
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
    const workOrderId = 'wo-parity-claim-history';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: workOrderId,
            workOrder: {
                display_id: 'parity-' + workOrderId,
                flow_graph: graph, position: 1,
            },
            flowWorkOrderId: workOrderId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: workOrderId, at: nowUtc(),
            },
            stateEventIds: [
                workOrderId + '-ev1',
                workOrderId + '-ev2',
                workOrderId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-middle', 'claimed'],
        },
    ));
    assert.equal(created.status, 204);

    // Phase Final Task 2: work_orders dropped from claim tx.
    const claimTxTables = [
        'requests', 'responses',
    ];
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
        db, STARK_ORGANIZATION, 'no-such-work-order',
    );
    const inTxMissing = await db.transaction(
        claimTxTables,
        (view) => workOrderClaimHistoryFor(
            view, STARK_ORGANIZATION, 'no-such-work-order',
        ),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});
