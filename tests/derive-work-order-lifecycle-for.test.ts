import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../api/types.ts';
import {
    deriveWorkOrderLifecycle,
    workOrderLifecycleStatesFor,
    workOrderClaimHistoryFor,
    workOrderHistoryFor,
} from '../api/derive-states.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { STARK_ORGANIZATION } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateCryptoSafeBase62 } from
    '../shared/crypto-safe-base62.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    appendLegacyTransition,
} from './legacy-transition-fixture.ts';

// The Phase 14 Task 1 core: workOrderLifecycleStatesFor is the
// ENTITY-SCOPED sibling of deriveWorkOrderLifecycle — it reuses
// the SAME pure replay core (replayWorkOrderOperations, private
// to api/derive-states.ts) over INDEXED reads scoped to ONE
// known (organization, workOrderId) pair — uri_id for the
// create/document pairs (they share ONE uriId at the work-orders
// collection address), uri_collection for the claim/transition
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

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
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
    };
}

function createWorkOrderBody(
    id: string,
    flowWorkOrderId: string,
    graph: Record<string, unknown>,
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
        'POST', '/organizations/1/work-orders/', token,
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
    assert.equal(created.status, 201);

    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(scoped.length, 3);
    assert.deepEqual(scoped, await bulkRowsFor(db, workOrderId));
    // Phase Final Task 2: states ROW half stripped — no
    // row-plane oracle.
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
        'POST', '/organizations/1/work-orders/', token,
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
    assert.equal(created.status, 201);

    // Task 8 CUT: legacy fieldValues below the gate
    // (stored-data fold; live wire rejects the key).
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
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
    );

    const transition2At = nowUtc();
    const transition2ReleaseAt = nowUtc();
    const transition2 = await handleRequest(db, req(
        'POST', '/organizations/1/work-orders/' + workOrderId + '/transition',
        token, {
            transitionEventId: workOrderId + '-te2',
            targetState: 'n-finish',
            release: {
                id: workOrderId + '-rel1',
                state: 'claim_released',
                at: transition2ReleaseAt,
            },
            transitionAt: transition2At,
        },
    ));
    assert.equal(transition2.status, 201);

    const entityPut = await handleRequest(db, req(
        'PUT', '/organizations/1/work-orders/' + workOrderId, token, {
            display_id: 'task1-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
    ));
    assert.equal(entityPut.status, 201);

    const claimFreshAt = nowUtc();
    const claimFresh = await handleRequest(db, req(
        'PUT', '/organizations/1/work-orders/' + workOrderId + '/claim',
        token, {
            claimEventId: workOrderId + '-ce1',
            claimAt: claimFreshAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimFreshAt,
        },
    ));
    assert.equal(claimFresh.status, 201);

    const claimRepeatAt = nowUtc();
    const claimRepeat = await handleRequest(db, req(
        'PUT', '/organizations/1/work-orders/' + workOrderId + '/claim',
        token, {
            claimEventId: workOrderId + '-ce2',
            claimAt: claimRepeatAt,
            expireEventId: workOrderId + '-ee2',
            expireAt: claimRepeatAt,
        },
    ));
    assert.equal(claimRepeat.status, 201);

    // birth(3) + transition1(1) + transition2(2) + PUT(0) +
    // fresh claim(1) + idempotent repeat(0) = 7.
    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(scoped.length, 7);
    assert.deepEqual(scoped, await bulkRowsFor(db, workOrderId));
    // Phase Final Task 2: states ROW half stripped — no
    // row-plane oracle.
});

// Named unclaim via POST organizations/:id/work-orders/:id/release — an
// op-pair
// leg of deriveWorkOrderLifecycle's own replay (applyReleasePair),
// so workOrderLifecycleStatesFor INCLUDES the claim_released
// event and matches the bulk subset. Claim history sees the
// same row (it rides the replayed half, not gate 5a's states
// address).
test('workOrderLifecycleStatesFor: a release op\'s'
+ ' claim_released is INCLUDED, matching'
+ ' deriveWorkOrderLifecycle\'s own bulk subset — claim-history'
+ ' sees it too', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task1-unclaim';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/1/work-orders/', token,
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
    assert.equal(created.status, 201);

    const release = await handleRequest(db, req(
        'DELETE',
        '/organizations/1/work-orders/' + workOrderId + '/claim',
        token,
    ));
    assert.equal(release.status, 204);

    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(scoped.length, 4);
    assert.deepEqual(scoped, await bulkRowsFor(db, workOrderId));
    const released = scoped.find(
        (row) => row.state === 'claim_released',
    );
    assert.ok(released !== undefined);
    assert.equal(released!.member_id, 'current');
    const claimHistory = sortByAtId(
        await workOrderClaimHistoryFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(claimHistory.length, 4);
    assert.ok(
        claimHistory.some(
            (row) => row.state === 'claim_released',
        ),
        'claim history must include the release',
    );
});

// The claim gate's OWN source (Phase 14 Task 4): release rides
// the replayed half, so claim history includes it; a later
// reclaim sees the release and appends a fresh claimed.
test('workOrderClaimHistoryFor: a release op\'s claim_released'
+ ' is included, and a later reclaim sees the release',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task4-unclaim';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/1/work-orders/', token,
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
    assert.equal(created.status, 201);

    const release = await handleRequest(db, req(
        'DELETE',
        '/organizations/1/work-orders/' + workOrderId + '/claim',
        token,
    ));
    assert.equal(release.status, 204);

    const afterRelease = sortByAtId(
        await workOrderClaimHistoryFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.equal(afterRelease.length, 4);
    assert.deepEqual(
        afterRelease.slice(0, 3).map((row) => row.id),
        [
            workOrderId + '-ev1',
            workOrderId + '-ev2',
            workOrderId + '-ev3',
        ],
    );
    assert.equal(afterRelease.at(-1)?.state, 'claim_released');
    assert.equal(afterRelease.at(-1)?.member_id, 'current');

    const claimAt = nowUtc();
    const reclaim = await handleRequest(db, req(
        'PUT', '/organizations/1/work-orders/' + workOrderId + '/claim',
        token, {
            claimEventId: workOrderId + '-ce1',
            claimAt,
            expireEventId: workOrderId + '-ee1',
            expireAt: claimAt,
        },
    ));
    assert.equal(reclaim.status, 201);

    const afterReclaim = sortByAtId(
        await workOrderClaimHistoryFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.deepEqual(
        afterReclaim.map((row) => row.state),
        [
            'n-start', 'n-middle', 'claimed',
            'claim_released', 'claimed',
        ],
    );
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

// workOrderHistoryFor reuses the lifecycle core and folds
// field_values from transition pairs (DESC; index 0 current).
// Transition rows carry {id, attribute_id, value}; claim/
// birth/release rows carry []. Empty → missedReadError.
test('workOrderHistoryFor: folds field_values onto transition'
+ ' events, [] on claim/birth/release, DESC current-first',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = 'wo-task1-history-fold';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/1/work-orders/', token,
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
    assert.equal(created.status, 201);

    // Task 8 CUT: legacy fieldValues below the gate.
    const transitionAt = nowUtc();
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
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
                {
                    id: workOrderId + '-fv2',
                    fields: {
                        state_event_id: workOrderId + '-te1',
                        attribute_id: 'attr-note',
                        value: 'checked',
                    },
                },
            ],
            release: null,
            transitionAt,
        },
    );

    const release = await handleRequest(db, req(
        'DELETE',
        '/organizations/1/work-orders/' + workOrderId + '/claim',
        token,
    ));
    assert.equal(release.status, 204);

    const history = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    // birth(3) + transition(1) + release(1) = 5, DESC.
    assert.equal(history.length, 5);
    assert.equal(history[0]!.state, 'claim_released');
    assert.deepEqual(history[0]!.field_values, []);

    const transitionRow = history.find(
        (row) => row.id === workOrderId + '-te1',
    );
    assert.ok(transitionRow !== undefined);
    assert.equal(transitionRow!.state, 'n-middle');
    // Field values sorted by id ascending (stateFieldValuesFrom
    // parity).
    assert.deepEqual(transitionRow!.field_values, [
        {
            id: workOrderId + '-fv1',
            attribute_id: 'attr-severity',
            value: 'high',
        },
        {
            id: workOrderId + '-fv2',
            attribute_id: 'attr-note',
            value: 'checked',
        },
    ]);

    const claimed = history.find(
        (row) => row.id === workOrderId + '-ev3',
    );
    assert.ok(claimed !== undefined);
    assert.equal(claimed!.state, 'claimed');
    assert.deepEqual(claimed!.field_values, []);

    // ASC lifecycle without fold matches history without
    // field_values, reversed.
    const lifecycle = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assert.deepEqual(
        history.map((row) => ({
            id: row.id,
            entity_id: row.entity_id,
            state: row.state,
            member_id: row.member_id,
            at: row.at,
        })),
        [...lifecycle].toReversed(),
    );
});

test('workOrderHistoryFor: empty lifecycle throws'
+ ' EntityNotFoundError for an absent id', async () => {
    const db = await seededDb();
    await assert.rejects(
        () => workOrderHistoryFor(
            db, STARK_ORGANIZATION, 'no-such-work-order',
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message
                === 'Not found: work_orders/no-such-work-order',
    );
});
