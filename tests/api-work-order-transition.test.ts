import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    POST,
    RequestError,
} from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { nowUtc } from '../api/types.ts';

// POST work-orders/:id/transition writes the transition state
// event, zero or more state_field_values rows, and an OPTIONAL
// claim-release event in ONE re-entrant transaction. The
// transition event and the release event are both authored by
// the verified caller (actor). A mid-op failure rolls back ALL.

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): string {
    return JSON.stringify({
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await db.workOrders.put('wo1', {
        organization_id: '1',
        display_id: 'abcd',
        flow_graph: graphJson(),
        position: 1,
    });
    return db;
}

function eventsFor(
    db: MemoryDbAdapter,
): Promise<{ state: string; member_id: string }[]> {
    return db.states.getAllFor('wo1');
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
    'a transition writes its field-value rows atomically'
    + ' alongside the transition event',
    async () => {
        const db = await seededDb();
        // The field row references a record attribute; seed one
        // so the foreign target exists for the read paths.
        await db.recordAttributes.put('attr-1', {
            organization_id: '1',
            record_id: 'rec-1',
            name: 'Severity',
            attribute_type: 'text',
            sort_order: 0,
            options: '[]',
            constraints: '[]',
        });
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
            },
            DEV_TOKEN,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'n-next');
        const fv = await db.stateFieldValues.getById('fv-1');
        assert.equal(fv.state_event_id, 'te1');
        assert.equal(fv.attribute_id, 'attr-1');
        assert.equal(fv.value, 'high');
    },
);

test(
    'the optional claim release fires when carried, authored'
    + ' by the actor',
    async () => {
        const db = await seededDb();
        // A live claim exists; the web-app decided to release
        // it and carried the release event in the body.
        await db.states.put('cl-1', {
            entity_id: 'wo1',
            state: 'claimed',
            member_id: 'current',
            at: nowUtc(),
        });
        await POST(
            db, 'work-orders/wo1/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [],
                release: {
                    id: 'rel-1',
                    state: 'claim_released',
                },
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
    'a mid-op failure rolls back the whole transition',
    async () => {
        const db = await seededDb();
        // The second field row is malformed (missing attribute_id),
        // so validateStateFieldValueEntity throws AFTER the
        // transition event and the first row were put — the
        // whole transaction must roll back, leaving NO events
        // and NO field-value rows.
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
                },
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError,
        );
        const events = await eventsFor(db);
        assert.equal(events.length, 0);
        const rows = await db.stateFieldValues.getAll();
        assert.equal(rows.length, 0);
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
