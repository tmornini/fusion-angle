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
    documentStateHeadFor,
} from '../api/derive-states.ts';
import { ATTRIBUTE_RESTRICT_TABLES } from
    '../api/record-attribute-refs.ts';
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
// land in a later task.

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

// -- documentStateHeadFor (Phase 14 Task 5) -----------------------

// The member_id-echo head helper's OWN write-gate table lists —
// one pin per one of its four call sites (api/routes.ts:
// postIdeaDocumentOp, postProjectDocumentOp,
// postRecordDocumentOp, postRecordWriteOp's edit arm), each
// against a genuinely-found head AND a never-created id, the SAME
// pre-tx-vs-in-tx shape every pin above follows.

test('documentStateHeadFor: byte-identical pre-tx (the plain'
+ ' adapter) vs in-tx (an open db.transaction view sharing'
+ ' postIdeaDocumentOp\'s own table list)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'idea-parity-head';
    const put = await handleRequest(db, req(
        'PUT', '/ideas/' + id, token, {
            title: 'T', position: 1,
            problem_statement: 'p', target_users: 't',
            proposed_solution: 's', expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active', state_at: nowUtc(),
            state_event_id: id + '-ev1',
        },
    ));
    assert.equal(put.status, 200);

    // Phase Final Task 2: ideas row half stripped from
    // postIdeaDocumentOp; tx list matches the live op.
    const ideaTxTables =
        ['requests', 'responses'];
    const preTx = await documentStateHeadFor(db, id);
    const inTx = await db.transaction(
        ideaTxTables,
        (view) => documentStateHeadFor(view, id),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx?.state, 'active');

    const preTxMissing = await documentStateHeadFor(
        db, 'no-such-idea',
    );
    const inTxMissing = await db.transaction(
        ideaTxTables,
        (view) => documentStateHeadFor(view, 'no-such-idea'),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.equal(preTxMissing, null);
});

test('documentStateHeadFor: byte-identical pre-tx (the plain'
+ ' adapter) vs in-tx (an open db.transaction view sharing'
+ ' postProjectDocumentOp\'s own table list)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'project-parity-head';
    const put = await handleRequest(db, req(
        'PUT', '/projects/' + id, token, {
            title: 'T', description: 'd', progress: 5,
            start_date: '2026-01-01',
            target_end_date: '2026-02-01',
            estimated_cost: 100, actual_cost: 50, position: 1,
            state: 'submitted', state_at: nowUtc(),
            state_event_id: id + '-ev1',
        },
    ));
    assert.equal(put.status, 200);

    // Phase Final Task 2: projects row half stripped from
    // postProjectDocumentOp; tx list matches the live op.
    const projectTxTables =
        ['requests', 'responses'];
    const preTx = await documentStateHeadFor(db, id);
    const inTx = await db.transaction(
        projectTxTables,
        (view) => documentStateHeadFor(view, id),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx?.state, 'submitted');

    const preTxMissing = await documentStateHeadFor(
        db, 'no-such-project',
    );
    const inTxMissing = await db.transaction(
        projectTxTables,
        (view) => documentStateHeadFor(view, 'no-such-project'),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.equal(preTxMissing, null);
});

test('documentStateHeadFor: byte-identical pre-tx (the plain'
+ ' adapter) vs in-tx (an open db.transaction view sharing'
+ ' postRecordDocumentOp\'s own table list)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'record-parity-head';
    const put = await handleRequest(db, req(
        'PUT', '/records/' + id, token, {
            name: 'N', description: 'd', position: 1,
            state: 'active', state_at: nowUtc(),
            state_event_id: id + '-ev1',
        },
    ));
    assert.equal(put.status, 200);

    // Phase Final Task 2: records ROW half stripped.
    const recordTxTables =
        ['requests', 'responses'];
    const preTx = await documentStateHeadFor(db, id);
    const inTx = await db.transaction(
        recordTxTables,
        (view) => documentStateHeadFor(view, id),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx?.state, 'active');

    const preTxMissing = await documentStateHeadFor(
        db, 'no-such-record',
    );
    const inTxMissing = await db.transaction(
        recordTxTables,
        (view) => documentStateHeadFor(view, 'no-such-record'),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.equal(preTxMissing, null);
});

test('documentStateHeadFor: byte-identical pre-tx (the plain'
+ ' adapter) vs in-tx (an open db.transaction view sharing'
+ ' postRecordWriteOp\'s own — larger — table list)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'record-write-parity-head';
    const created = await handleRequest(db, req(
        'POST', '/records', token, {
            kind: 'create',
            id,
            record: {
                organization_id: STARK_ORGANIZATION,
                name: 'N', description: 'd', position: 1,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: id + '-ev1',
            initialStateAt: nowUtc(),
        },
    ));
    assert.equal(created.status, 204);

    // Phase Final Task 2: records + record_attributes ROW
    // halves stripped from postRecordWriteOp's tx list.
    const composedTxTables = [...new Set([
        ...ATTRIBUTE_RESTRICT_TABLES,
        'requests', 'responses',
    ])];
    const preTx = await documentStateHeadFor(db, id);
    const inTx = await db.transaction(
        composedTxTables,
        (view) => documentStateHeadFor(view, id),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx?.state, 'active');

    const preTxMissing = await documentStateHeadFor(
        db, 'no-such-record-write',
    );
    const inTxMissing = await db.transaction(
        composedTxTables,
        (view) =>
            documentStateHeadFor(view, 'no-such-record-write'),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.equal(preTxMissing, null);
});
