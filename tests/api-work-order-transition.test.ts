import { deriveStatesFor } from
    '../api/derive-states.ts';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    POST,
    PUT,
    RequestError,
} from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { nowUtc } from '../api/types.ts';
import { EntityNotFoundError } from '../api/db.ts';
import {
    stateFieldValuesForStateEvent,
} from '../api/derive-state-field-values.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

// POST work-orders/:id/transition writes the transition state
// event and an OPTIONAL claim-release event in ONE transaction.
// Phase Final Task 2: state_field_values ROW half stripped —
// field values ride the op pair body (pair-plane oracle via
// stateFieldValuesForStateEvent). Authorship is the verified
// caller (actor).

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): string {
    return JSON.stringify({
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    });
}

// Seed via REAL PUT so the WO carries a document pair (row
// half stripped; claim/transition gates read the pair plane).
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await PUT(
        db, 'work-orders/wo1', {
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
    return deriveStatesFor(db, '1', 'wo1');
}

test(
    'a transition writes the target state event authored'
    + ' by the actor',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [],
                release: null,
                transitionAt: nowUtc(),
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'n-next');
        assert.equal(events[0]!.member_id, 'current');
    },
);

test(
    'a transition folds field values onto the pair plane'
    + ' alongside the transition event',
    async () => {
        const db = await seededDb();
        // The field row references a record attribute; seed one
        // so the foreign target exists for the read paths.
        // Phase Final Stage B: record_attributes retired.
        await PUT(
            db, 'record-attributes/attr-1', {
                organization_id: '1',
                record_id: 'rec-1',
                name: 'Severity',
                attribute_type: 'text',
                sort_order: 0,
                options: '[]',
                constraints: '[]',
            },
            DEV_TOKEN,
        );
        await POST(
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: 'fv-1',
                        fields: {
                            state_event_id: 'te1',
                            attribute_id: 'attr-1',
                            value: 'high',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'n-next');
        // Phase Final Task 2: SFV row plane empty; pair-plane
        // two-source union carries the fold.
        // Phase Final Stage B: state_field_values retired.
        const fvs = await stateFieldValuesForStateEvent(
            db, STARK_ORGANIZATION, 'te1',
        );
        assert.equal(fvs.length, 1);
        assert.equal(fvs[0]!.id, 'fv-1');
        assert.equal(fvs[0]!.state_event_id, 'te1');
        assert.equal(fvs[0]!.attribute_id, 'attr-1');
        assert.equal(fvs[0]!.value, 'high');
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
        await POST(
            db, 'work-orders/wo1/claim', {
                claimEventId: 'cl-1',
                claimAt,
                expireEventId: 'cl-1-exp',
                expireAt: claimAt,
            },
            DEV_TOKEN,
        );
        // Mint transitionAt before release.at so the
        // at-ordered log matches route post order.
        const transitionAt = nowUtc();
        const releaseAt = nowUtc();
        await POST(
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [],
                release: {
                    id: 'rel-1',
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
        assert.equal(events[1]!.member_id, 'current');
        assert.equal(events[2]!.state, 'claim_released');
        assert.equal(events[2]!.member_id, 'current');
    },
);

test(
    'no claim release fires when release is null',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [],
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

test(
    'a field value missing attribute_id is a 400 and'
    + ' leaves zero events (gate re-homes store validation)',
    async () => {
        const db = await seededDb();
        // Phase Final Task 2: validateStateFieldValueEntity
        // runs at the gate (no SFV put remains). A malformed
        // fold 400s pre-tx — zero events, zero SFV pairs.
        await assert.rejects(
            () => POST(
                db, 'work-orders/wo1/transition', {
                    transitionEventId: 'te1',
                    targetState: 'n-next',
                    fieldValues: [
                        {
                            id: 'fv-1',
                            fields: {
                                state_event_id: 'te1',
                                attribute_id: 'attr-1',
                                value: 'high',
                            },
                        },
                        {
                            id: 'fv-2',
                            fields: {
                                state_event_id: 'te1',
                                value: 'low',
                            },
                        },
                    ],
                    release: null,
                    transitionAt: nowUtc(),
                },
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 400,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 0);
        // Orphan parent event → EntityNotFoundError (404),
        // not an empty array.
        await assert.rejects(
            () => stateFieldValuesForStateEvent(
                db, STARK_ORGANIZATION, 'te1',
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
                db, 'work-orders/wo1/transition', {
                    transitionEventId: 'te1',
                    targetState: 'n-next',
                    fieldValues: [],
                    release: null,
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
// transitionEventId is rejected at the gate (400). The
// shipped UI always sends the transaction's own id; only a
// forged client observes this terminal.
test(
    'a field value with a dangling state_event_id is a 400',
    async () => {
        const db = await seededDb();
        // Phase Final Stage B: record_attributes retired.
        await PUT(
            db, 'record-attributes/attr-1', {
                organization_id: '1',
                record_id: 'rec-1',
                name: 'Severity',
                attribute_type: 'text',
                sort_order: 0,
                options: '[]',
                constraints: '[]',
            },
            DEV_TOKEN,
        );
        await assert.rejects(
            () => POST(
                db, 'work-orders/wo1/transition', {
                    transitionEventId: 'te1',
                    targetState: 'n-next',
                    fieldValues: [
                        {
                            id: 'fv-1',
                            fields: {
                                state_event_id: 'other-event',
                                attribute_id: 'attr-1',
                                value: 'high',
                            },
                        },
                    ],
                    release: null,
                    transitionAt: nowUtc(),
                },
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 400
                && typeof err.message === 'string'
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
            () => POST(
                db, 'work-orders/wo1/transition', {
                    transitionEventId: 'te1',
                    targetState: 'n-next',
                    fieldValues: [
                        {
                            id: 'fv-1',
                            fields: {
                                attribute_id: 'attr-1',
                                value: 'high',
                            },
                        },
                    ],
                    release: null,
                    transitionAt: nowUtc(),
                },
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 400
                && typeof err.message === 'string'
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
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [],
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
        await POST(
            db, 'work-orders/wo1/claim', {
                claimEventId: 'cl-1',
                claimAt,
                expireEventId: 'cl-1-exp',
                expireAt: claimAt,
            },
            DEV_TOKEN,
        );
        // Far-future values to distinguish caller-minted
        // from a server-generated nowUtc().
        const transitionAt = '2099-01-01T00:00:00.000000Z';
        const releaseAt = '2099-01-01T00:00:01.000000Z';
        await POST(
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [],
                release: {
                    id: 'rel-1',
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
