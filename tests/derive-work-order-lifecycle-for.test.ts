import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../shared/types.ts';
import {
    workOrderLifecycleStatesFor,
    workOrderHistoryFor,
} from '../api/derive-states.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { STARK_ORGANIZATION } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    generateIdentifier,
    compareIdentifiers,
} from '../shared/identifier.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import {
    appendLegacyTransition,
} from './legacy-transition-fixture.ts';

const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const ATTR_SEVERITY = generateIdentifier();
const N_FINISH = generateIdentifier();
const ATTR_NOTE = generateIdentifier();
const EDGE_2 = generateIdentifier();
const WORKORDERID_FWO = generateIdentifier();
const WORKORDERID_EV1 = generateIdentifier();
const WORKORDERID_EV2 = generateIdentifier();
const WORKORDERID_EV3 = generateIdentifier();
const WORKORDERID_TE1 = generateIdentifier();
const WORKORDERID_FV1 = generateIdentifier();
const WORKORDERID_TE2 = generateIdentifier();
const WORKORDERID_REL1 = generateIdentifier();
const WORKORDERID_CE1 = generateIdentifier();
const WORKORDERID_EE1 = generateIdentifier();
const WORKORDERID_CE2 = generateIdentifier();
const WORKORDERID_EE2 = generateIdentifier();
const WORKORDERID_FV2 = generateIdentifier();

// workOrderLifecycleStatesFor is the work-order lifecycle
// read: the version chain's own events, oldest first (§5).
// This file proves it against the live routes' own
// handleRequest outcomes.

// A real seeded flow carrying zero work-order joins (drift-work-
// orders.test.ts's own EMPTY_FLOW_ID) — the join itself is
// irrelevant to a states-log replay, but the create route
// validates the flow id, so a genuine seeded id is required.
const EMPTY_FLOW_ID = 'GgfDbXOJUvvaCekCTcvhuw';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined ? { headers } : {}),
    });
}

// An operation on a work order names the head it read.
async function headTag(
    db: MemoryDbAdapter,
    token: string,
    workOrderId: string,
): Promise<Record<string, string>> {
    const read = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId,
        token,
    ));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    return { 'If-Match': read.headers.get('ETag')! };
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
                : compareIdentifiers(a.id, b.id));
}

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Task 1 Fixture Flow',
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

Deno.test('workOrderLifecycleStatesFor: birth-claimed create alone'
+ ' births exactly the three initial events', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, WORKORDERID_FWO, graph,
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);

    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assertStrictEquals(scoped.length, 3);
    // Phase Final Task 2: states ROW half stripped — no
    // row-plane oracle.
});

Deno.test('workOrderLifecycleStatesFor: a full chain — birth, a'
+ ' transition with field values, a releasing transition, an'
+ ' entity PUT, a fresh re-claim, and a renewing re-claim —'
+ ' ends at eight events',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, WORKORDERID_FWO, graph,
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);

    // Task 8 CUT: legacy fieldValues below the gate
    // (stored-data fold; live wire rejects the key).
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
            transitionEventId: WORKORDERID_TE1,
            targetState: N_MIDDLE,
            fieldValues: [
                {
                    id: WORKORDERID_FV1,
                    fields: {
                        state_event_id: WORKORDERID_TE1,
                        attribute_id: ATTR_SEVERITY,
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
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/transition',
        token, {
            transitionEventId: WORKORDERID_TE2,
            targetState: N_FINISH,
            release: {
                id: WORKORDERID_REL1,
                state: 'claim_released',
                at: transition2ReleaseAt,
            },
            transitionAt: transition2At,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(transition2.status, 200);
    await transition2.body?.cancel();

    const entityPut = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId, token, {
            display_id: 'task1-' + workOrderId,
            flow_graph: graph,
            position: 2,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(entityPut.status, 200);

    const claimFreshAt = nowUtc();
    const claimFresh = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/claim',
        token, {
            claimEventId: WORKORDERID_CE1,
            claimAt: claimFreshAt,
            expireEventId: WORKORDERID_EE1,
            expireAt: claimFreshAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claimFresh.status, 200);

    const claimRepeatAt = nowUtc();
    const claimRepeat = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId + '/claim',
        token, {
            claimEventId: WORKORDERID_CE2,
            claimAt: claimRepeatAt,
            expireEventId: WORKORDERID_EE2,
            expireAt: claimRepeatAt,
        },
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(claimRepeat.status, 200);

    // birth(3) + transition1(1) + transition2(2) + PUT(0) +
    // fresh claim(1) + renewing repeat(1) = 8.
    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assertStrictEquals(scoped.length, 8);
    // Phase Final Task 2: states ROW half stripped — no
    // row-plane oracle.
});

// A release lands a version recording claim_released, so
// workOrderLifecycleStatesFor INCLUDES the event.
Deno.test('workOrderLifecycleStatesFor: a release op\'s'
+ ' claim_released is INCLUDED', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, WORKORDERID_FWO, graph,
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);

    const release = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/claim',
        token,
        undefined,
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(release.status, 200);
    await release.body?.cancel();

    const scoped = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assertStrictEquals(scoped.length, 4);
    const released = scoped.find(
        (row) => row.state === 'claim_released',
    );
    assert(released !== undefined);
    assertStrictEquals(released!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('workOrderLifecycleStatesFor: a never-created work-order id'
+ ' derives an empty array, no throw', async () => {
    const db = await seededDb();
    await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
    );
    assertEquals(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
        ),
        [],
    );
});

// workOrderHistoryFor reuses the lifecycle core and folds
// field_values from transition pairs (DESC; index 0 current).
// Transition rows carry {id, attribute_id, value}; claim/
// birth/release rows carry []. Empty → missedReadError.
Deno.test('workOrderHistoryFor: folds field_values onto transition'
+ ' events, [] on claim/birth/release, DESC current-first',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const workOrderId = generateIdentifier();
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
        createWorkOrderBody(
            workOrderId, WORKORDERID_FWO, graph,
            {
                ids: [
                    WORKORDERID_EV1,
                    WORKORDERID_EV2,
                    WORKORDERID_EV3,
                ],
                ats: [nowUtc(), nowUtc(), nowUtc()],
                states: [N_START, N_MIDDLE, 'claimed'],
            },
            nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);

    // Task 8 CUT: legacy fieldValues below the gate.
    const transitionAt = nowUtc();
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, workOrderId, {
            transitionEventId: WORKORDERID_TE1,
            targetState: N_MIDDLE,
            fieldValues: [
                {
                    id: WORKORDERID_FV1,
                    fields: {
                        state_event_id: WORKORDERID_TE1,
                        attribute_id: ATTR_SEVERITY,
                        value: 'high',
                    },
                },
                {
                    id: WORKORDERID_FV2,
                    fields: {
                        state_event_id: WORKORDERID_TE1,
                        attribute_id: ATTR_NOTE,
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
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/claim',
        token,
        undefined,
        await headTag(db, token, workOrderId),
    ));
    assertStrictEquals(release.status, 200);
    await release.body?.cancel();

    const history = await workOrderHistoryFor(
        db, STARK_ORGANIZATION, workOrderId,
    );
    // birth(3) + transition(1) + release(1) = 5, DESC.
    assertStrictEquals(history.length, 5);
    assertStrictEquals(history[0]!.state, 'claim_released');
    assertEquals(history[0]!.field_values, []);

    const transitionRow = history.find(
        (row) => row.id === WORKORDERID_TE1,
    );
    assert(transitionRow !== undefined);
    assertStrictEquals(transitionRow!.state, N_MIDDLE);
    // Field values sorted by id ascending (stateFieldValuesFrom
    // parity).
    assertEquals(transitionRow!.field_values, [
        {
            id: WORKORDERID_FV1,
            attribute_id: ATTR_SEVERITY,
            value: 'high',
        },
        {
            id: WORKORDERID_FV2,
            attribute_id: ATTR_NOTE,
            value: 'checked',
        },
    ].sort((a, b) => compareIdentifiers(a.id, b.id)));

    const claimed = history.find(
        (row) => row.id === WORKORDERID_EV3,
    );
    assert(claimed !== undefined);
    assertStrictEquals(claimed!.state, 'claimed');
    assertEquals(claimed!.field_values, []);

    // ASC lifecycle without fold matches history without
    // field_values, reversed.
    const lifecycle = sortByAtId(
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, workOrderId,
        ),
    );
    assertEquals(
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

Deno.test('workOrderHistoryFor: empty lifecycle throws'
+ ' EntityNotFoundError for an absent id', async () => {
    const db = await seededDb();
    const err = await assertRejects(
        () => workOrderHistoryFor(
            db, STARK_ORGANIZATION, 'oYnbiWXzroVnyolOhmkBIQ',
        ),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(
        err.message,
        'Not found: work_orders/oYnbiWXzroVnyolOhmkBIQ',
    );
});
