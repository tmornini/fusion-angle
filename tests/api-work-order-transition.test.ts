import {
    workOrderLifecycleStatesFor,
    workOrderHistoryFor,
} from '../api/derive-states.ts';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    POST,
    PUT,
    RequestError,
} from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    ValidationError,
} from '../api/types.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    postWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const FIELD_VALUE_ID = generateIdentifier();
const CLAIM_EVENT_ID = generateIdentifier();
const EXPIRE_EVENT_ID = generateIdentifier();
const RELEASE_EVENT_ID = generateIdentifier();
const TRANSITION_EVENT_ID = generateIdentifier();

// POST organizations/:id/work-orders/:id/transition writes the transition
// state
// event and an OPTIONAL claim-release event in ONE transaction.
// Task 8 CUT: live gate rejects fieldValues; pure-move
// fixtures use the instance pure-move shape. Legacy
// fieldValues appends/validation pin the below-facade tier
// (stored-data truth; seed dual-tolerant). Spec W2 / plan
// Task 8.

const LOCK_TIMEOUT_SECONDS = 300;
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    };
}

// Seed via REAL PUT so the WO carries a document message pair
// (row half stripped; claim/transition gates read the
// message plane).
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA', {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        DEV_TOKEN,
    );
    return db;
}

function eventsFor(
    db: MemoryDbAdapter,
): Promise<{ state: string; member_id: string; at: string }[]> {
    return workOrderLifecycleStatesFor(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'yNSSnbrpacodQTzUEcdEVA');
}

// Below-facade legacy append (organization === undefined).
// Task 8: live gate rejects fieldValues; SFV/legacy fold
// pins stay on the seed-tier dual-tolerant path.
async function appendLegacyTransition(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<void> {
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', 'yNSSnbrpacodQTzUEcdEVA', 'transition',
    ];
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TRANSITION_PATTERN,
        routeSegments: TRANSITION_PATTERN.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: STARK_ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, 'yNSSnbrpacodQTzUEcdEVA', body, SYSTEM_MEMBER_ID,
        undefined, [], messagePair,
    );
}

test(
    'a transition writes the target state event authored'
    + ' by the actor',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: null,
                transitionAt: nowUtc(),
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'n-next');
        assert.equal(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

// Spec W2 / Task 8: value-bearing legacy fold is stored-
// data truth — append below the gate, not the live wire.
test(
    'a transition folds field values onto the message plane'
    + ' alongside the transition event',
    async () => {
        const db = await seededDb();
        // The field row references a record attribute; seed one
        // so the foreign target exists for the read paths.
        // Phase Final Stage B: record_attributes retired.
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw', {
                name: 'WO Parent', description: '',
                position: 0,
                state: 'active',
            },
            DEV_TOKEN,
        );
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/VPckAwjJsTGCEkKaOOGRGw', {
                name: 'Severity',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
            },
            DEV_TOKEN,
        );
        await appendLegacyTransition(db, {
            transitionEventId: TRANSITION_EVENT_ID,
            targetState: 'n-next',
            fieldValues: [
                {
                    id: FIELD_VALUE_ID,
                    fields: {
                        state_event_id: TRANSITION_EVENT_ID,
                        attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                        value: 'high',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        });
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'n-next');
        // Phase Final Task 2: SFV row plane empty; message-plane
        // transition fold rides work-order history.
        // Phase Final Stage B: state_field_values retired.
        const history = await workOrderHistoryFor(
            db, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA',
        );
        const transition = history.find(
            (row) => row.id === TRANSITION_EVENT_ID,
        );
        assert.ok(transition !== undefined);
        assert.deepEqual(transition!.field_values, [{
            id: FIELD_VALUE_ID,
            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
            value: 'high',
        }]);
    },
);

test(
    'the optional claim release fires when carried, authored'
    + ' by the actor',
    async () => {
        const db = await seededDb();
        // A live claim exists; the web-app decided to release
        // it and carried the release event in the body.
        // Claim rides the named op (states/:id retired).
        const claimAt = nowUtc();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId: CLAIM_EVENT_ID,
                claimAt,
                expireEventId: EXPIRE_EVENT_ID,
                expireAt: claimAt,
            },
            DEV_TOKEN,
        );
        // Mint transitionAt before release.at so the
        // at-ordered log matches route post order.
        const transitionAt = nowUtc();
        const releaseAt = nowUtc();
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: {
                    id: RELEASE_EVENT_ID,
                    state: 'claim_released',
                    at: releaseAt,
                },
                transitionAt,
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.deepEqual(
            events.map(ev => ev.state),
            ['claimed', 'n-next', 'claim_released'],
        );
        assert.equal(events[1]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
        assert.equal(events[2]!.state, 'claim_released');
        assert.equal(events[2]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

test(
    'no claim release fires when release is null',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: null,
                transitionAt: nowUtc(),
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(
            events.some(ev => ev.state === 'claim_released'),
            false,
        );
    },
);

// Task 8: legacy fold validation remains on the below-
// facade tier (gate rejects the fieldValues key first).
test(
    'a field value missing attribute_id is a 400 and'
    + ' leaves zero events (gate re-homes store validation)',
    async () => {
        const db = await seededDb();
        // Phase Final Task 2: validateStateFieldValueEntity
        // runs in the dual-tolerant validator (no SFV put).
        // A malformed fold 400s pre-tx — zero events.
        await assert.rejects(
            () => appendLegacyTransition(db, {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: FIELD_VALUE_ID,
                        fields: {
                            state_event_id: 'te1',
                            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                            value: 'high',
                        },
                    },
                    {
                        id: generateIdentifier(),
                        fields: {
                            state_event_id: 'te1',
                            value: 'low',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            }),
            (err: unknown) =>
                err instanceof ValidationError,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 0);
        // Failed gate left no lifecycle → history 404s
        // (empty lifecycle), not an empty field_values array
        // under a ghost event id.
        await assert.rejects(
            () => workOrderHistoryFor(
                db, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA',
            ),
            EntityNotFoundError,
        );
    },
);

test(
    'a transition body with an unexpected key is a 400',
    async () => {
        const db = await seededDb();
        await assert.rejects(
            () => POST(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                    transitionEventId: 'te1',
                    targetState: 'n-next',
                    release: null,
                    transitionAt: nowUtc(),
                    surprise: true,
                },
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 400,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 0);
    },
);

// Wire delta (4) — Phase 15 Task 3: a field value whose
// state_event_id is not THIS transition's own
// transitionEventId is rejected. Task 8: pin stays on the
// below-facade dual-tolerant validator (live gate retires
// the key first).
test(
    'a field value with a dangling state_event_id is a 400',
    async () => {
        const db = await seededDb();
        // Phase Final Stage B: record_attributes retired.
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw', {
                name: 'WO Parent', description: '',
                position: 0,
                state: 'active',
            },
            DEV_TOKEN,
        );
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/VPckAwjJsTGCEkKaOOGRGw', {
                name: 'Severity',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
            },
            DEV_TOKEN,
        );
        await assert.rejects(
            () => appendLegacyTransition(db, {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: FIELD_VALUE_ID,
                        fields: {
                            state_event_id: 'other-event',
                            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                            value: 'high',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            }),
            (err: unknown) =>
                err instanceof ValidationError
                && err.message.includes(
                    'state_event_id must equal'
                    + ' transitionEventId',
                ),
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 0);
        // Phase Final Stage B: state_field_values retired.
    },
);

test(
    'a field value with an absent state_event_id is a 400',
    async () => {
        const db = await seededDb();
        await assert.rejects(
            () => appendLegacyTransition(db, {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: FIELD_VALUE_ID,
                        fields: {
                            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                            value: 'high',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            }),
            (err: unknown) =>
                err instanceof ValidationError
                && err.message.includes(
                    'state_event_id must equal'
                    + ' transitionEventId',
                ),
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 0);
    },
);

test(
    'transitionAt is recorded as the transition event at',
    async () => {
        const db = await seededDb();
        // Far-future value to distinguish caller-minted
        // from a server-generated nowUtc().
        const callerAt = '2099-01-01T00:00:00.000000Z';
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: null,
                transitionAt: callerAt,
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'n-next');
        assert.equal(events[0]!.at, callerAt);
    },
);

test(
    'release.at is recorded as the release event at',
    async () => {
        const db = await seededDb();
        // Claim rides the named op (states/:id retired).
        const claimAt = nowUtc();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId: CLAIM_EVENT_ID,
                claimAt,
                expireEventId: EXPIRE_EVENT_ID,
                expireAt: claimAt,
            },
            DEV_TOKEN,
        );
        // Far-future values to distinguish caller-minted
        // from a server-generated nowUtc().
        const transitionAt = '2099-01-01T00:00:00.000000Z';
        const releaseAt = '2099-01-01T00:00:01.000000Z';
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: {
                    id: RELEASE_EVENT_ID,
                    state: 'claim_released',
                    at: releaseAt,
                },
                transitionAt,
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        // events: claimed, n-next, claim_released
        assert.equal(events[1]!.state, 'n-next');
        assert.equal(events[1]!.at, transitionAt);
        assert.equal(events[2]!.state, 'claim_released');
        assert.equal(events[2]!.at, releaseAt);
    },
);
