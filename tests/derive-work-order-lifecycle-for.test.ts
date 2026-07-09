import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { jsonObjectField, nowUtc } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    deriveWorkOrderLifecycle,
    workOrderLifecycleStatesFor,
    workOrderClaimHistoryFor,
} from '../api/derive-states.ts';
import { STARK_ORGANIZATION } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateCryptoSafeBase62 } from
    '../shared/crypto-safe-base62.ts';

// The Phase 14 Task 1 core: workOrderLifecycleStatesFor is the
// ENTITY-SCOPED sibling of deriveWorkOrderLifecycle — it reuses
// the SAME pure replay core (replayWorkOrderOperations, private
// to api/derive-states.ts) over INDEXED reads scoped to ONE
// known (organization, workOrderId) pair — uri_id for the
// create/document pairs (they share ONE uriId at the work-orders
// collection address), uri_prefix for the claim/transition
// sub-resource addresses, and the organization's own states/:id
// prefix (filtered locally to this entity) for gate 5a's rows —
// rather than the whole-org scan deriveWorkOrderLifecycle needs
// to discover EVERY work order's own ids at once. This file
// proves it byte-identical to deriveWorkOrderLifecycle's own
// per-entity subset AND to the row-plane db.states.getAllFor
// oracle. No write path reads this core yet — Task 1 flips
// nothing.

const BASE = 'http://localhost';

// A real seeded flow carrying zero work-order joins (drift-work-
// orders.test.ts's own EMPTY_FLOW_ID) — the join itself is
// irrelevant to a states-log replay, but the create route
// validates the flow id, so a genuine seeded id is required.
const EMPTY_FLOW_ID = 'E2BnBlZyrriqsQYkmS4usb';

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
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

function sortByAtId<T extends { at: string; id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
                : a.id < b.id ? -1
                    : a.id > b.id ? 1
                        : 0);
}

function workOrderFlowGraph(lockTimeoutSeconds: number): string {
    return jsonObjectField({
        name: 'Task 1 Fixture Flow',
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

function createWorkOrderBody(
    id: string,
    flowWorkOrderId: string,
    graph: string,
    events: {
        readonly ids: readonly [string, string, string];
        readonly ats: readonly [string, string, string];
        readonly states: readonly [string, string, string];
    },
    joinAt: string,
): Record<string, unknown> {
    return {
        id,
        workOrder: {
            display_id: 'task1-' + id,
            flow_graph: graph,
            position: 1,
        },
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: EMPTY_FLOW_ID,
            work_order_id: id,
            at: joinAt,
        },
        stateEventIds: events.ids,
        stateEventAts: events.ats,
        states: events.states,
    };
}

async function bulkRowsFor(
    db: MemoryDbAdapter, id: string,
): Promise<unknown[]> {
    return sortByAtId(
        (await deriveWorkOrderLifecycle(db))
            .filter((row) => row.entity_id === id),
    );
}

test('workOrderLifecycleStatesFor: birth-claimed create alone'
+ ' matches the bulk subset AND the row-plane oracle', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task1-birth';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, workOrderId + '-fwo', graph,
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);

    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(scoped.length, 3);
    assert.deepEqual(scoped, await bulkRowsFor(db, workOrderId));
    assert.deepEqual(
        scoped, await db.states.getAllFor(workOrderId),
    );
});

test('workOrderLifecycleStatesFor: a full chain — birth, a'
+ ' transition with field values, a releasing transition, an'
+ ' entity PUT, a fresh re-claim, and an idempotent re-claim —'
+ ' matches the bulk subset AND the row-plane oracle at the end',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task1-chain';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, workOrderId + '-fwo', graph,
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);

    const transition1 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te1',
            targetState: 'n-middle',
            fieldValues: [
                {
                    id: workOrderId + '-fv1',
                    fields: {
                        state_event_id: workOrderId + '-te1',
                        attribute_id: 'attr-severity',
                        value: 'high',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(transition1.status, 204);

    const transition2At = nowUtc();
    const transition2ReleaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te2',
            targetState: 'n-finish',
            fieldValues: [],
            release: {
                id: workOrderId + '-rel1',
                state: 'claim_released',
                at: transition2ReleaseAt,
            },
            transitionAt: transition2At,
        },
    ));
    assert.equal(transition2.status, 204);

    const entityPut = await handleRequest(db, req(
        'PUT', '/work-orders/' + workOrderId, token, {
            display_id: 'task1-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
    ));
    assert.equal(entityPut.status, 200);

    const claimFreshAt = nowUtc();
    const claimFresh = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        token, {
            claimEventId: workOrderId + '-ce1',
            claimAt: claimFreshAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimFreshAt,
        },
    ));
    assert.equal(claimFresh.status, 204);

    const claimRepeatAt = nowUtc();
    const claimRepeat = await handleRequest(db, req(
        'POST', '/work-orders/' + workOrderId + '/claim',
        token, {
            claimEventId: workOrderId + '-ce2',
            claimAt: claimRepeatAt,
            expireEventId: workOrderId + '-ee2',
            expireAt: claimRepeatAt,
        },
    ));
    assert.equal(claimRepeat.status, 204);

    // birth(3) + transition1(1) + transition2(2) + PUT(0) +
    // fresh claim(1) + idempotent repeat(0) = 7.
    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(scoped.length, 7);
    assert.deepEqual(scoped, await bulkRowsFor(db, workOrderId));
    assert.deepEqual(
        scoped, await db.states.getAllFor(workOrderId),
    );
});

// A standalone unclaim (a bare PUT /states/:id, never a claim/
// transition op) rides the states/:id direct address — gate 5a's
// OWN union source (deriveEventPairStates), never
// deriveWorkOrderLifecycle's own op-pair replay (its header:
// statesAddressEvents feeds ONLY applyClaimPair's prior-claim
// decision, never the returned events array itself — the six-
// source union in deriveStates keeps the two apart so the SAME
// event is never double-counted). workOrderLifecycleStatesFor
// mirrors that exact split: it excludes the standalone unclaim
// too, matching deriveWorkOrderLifecycle's own bulk subset
// exactly, even though the ROW-PLANE oracle (which collapses
// every source into one table) carries it.
test('workOrderLifecycleStatesFor: a standalone unclaim (bare'
+ ' PUT /states/:id) is EXCLUDED, matching'
+ ' deriveWorkOrderLifecycle\'s own bulk subset — the row-plane'
+ ' oracle differs here BY DESIGN (it collapses gate 5a\'s'
+ ' separate union source into the same table)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task1-unclaim';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, workOrderId + '-fwo', graph,
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);

    const unclaimEventId = generateCryptoSafeBase62();
    const unclaim = await handleRequest(db, req(
        'PUT', '/states/' + unclaimEventId, token, {
            entity_id: workOrderId,
            state: 'claim_released',
            at: nowUtc(),
        },
    ));
    assert.equal(unclaim.status, 200);

    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(scoped.length, 3);
    assert.deepEqual(scoped, await bulkRowsFor(db, workOrderId));
    assert.equal(
        (await db.states.getAllFor(workOrderId)).length, 4,
    );
});

// The claim gate's OWN source (Phase 14 Task 4): the SAME
// standalone unclaim the test above proves EXCLUDED from
// workOrderLifecycleStatesFor's return is INCLUDED here —
// workOrderClaimHistoryFor unions that function's replayed
// events with this entity's own states/:id address rows, so it
// stays byte-identical to the row-plane oracle
// (db.states.getAllFor) even across a standalone release. This
// is the resolution to the controller-named hazard: the claim
// gate reads THIS function, never workOrderLifecycleStatesFor
// directly.
test('workOrderClaimHistoryFor: the SAME standalone unclaim IS'
+ ' included, unlike workOrderLifecycleStatesFor\'s own return —'
+ ' byte-identical to the row-plane oracle', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task4-unclaim';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createWorkOrderBody(
            workOrderId, workOrderId + '-fwo', graph,
            {
                ids: [
                    workOrderId + '-ev1',
                    workOrderId + '-ev2',
                    workOrderId + '-ev3',
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: ['n-start', 'n-middle', 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);

    const unclaimEventId = generateCryptoSafeBase62();
    const unclaim = await handleRequest(db, req(
        'PUT', '/states/' + unclaimEventId, token, {
            entity_id: workOrderId,
            state: 'claim_released',
            at: nowUtc(),
        },
    ));
    assert.equal(unclaim.status, 200);

    const scoped = sortByAtId(
        await workOrderClaimHistoryFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    const oracle = sortByAtId(
        await db.states.getAllFor(workOrderId),
    );
    assert.equal(scoped.length, 4);
    assert.deepEqual(scoped, oracle);
});

test('workOrderLifecycleStatesFor: a never-created work-order id'
+ ' derives an empty array, no throw', async () => {
    const db = await seededDb();
    await assert.doesNotReject(
        () => workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, 'no-such-work-order',
        ),
    );
    assert.deepEqual(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, 'no-such-work-order',
        ),
        [],
    );
});
