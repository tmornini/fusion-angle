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

// POST work-orders/:id/claim decides and appends in ONE
// transaction: a live foreign claim is a 409, a live own
// claim an idempotent no-op, an expired claim is superseded
// by 'claim_expired' + 'claimed' atomically.

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

function claimEventsFor(
    db: MemoryDbAdapter,
): Promise<{ state: string; member_id: string }[]> {
    return db.states.getAllFor('wo1');
}

test('a fresh claim appends one claimed event', async () => {
    const db = await seededDb();
    await POST(
        db, 'work-orders/wo1/claim', {}, DEV_TOKEN,
    );
    const events = await claimEventsFor(db);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'claimed');
    assert.equal(events[0]!.member_id, 'current');
});

test(
    'a repeat claim by the holder is an idempotent no-op',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'work-orders/wo1/claim', {}, DEV_TOKEN,
        );
        await POST(
            db, 'work-orders/wo1/claim', {}, DEV_TOKEN,
        );
        const events = await claimEventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'claimed');
    },
);

test(
    'a live claim by another member is a 409',
    async () => {
        const db = await seededDb();
        await db.states.put('cl-other', {
            entity_id: 'wo1',
            state: 'claimed',
            member_id: 'other',
            at: nowUtc(),
        });
        await assert.rejects(
            () => POST(
                db, 'work-orders/wo1/claim', {},
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409,
        );
        const events = await claimEventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.member_id, 'other');
    },
);

test(
    'an expired claim is superseded atomically',
    async () => {
        const db = await seededDb();
        await db.states.put('cl-stale', {
            entity_id: 'wo1',
            state: 'claimed',
            member_id: 'other',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await POST(
            db, 'work-orders/wo1/claim', {}, DEV_TOKEN,
        );
        const events = await claimEventsFor(db);
        assert.deepEqual(
            events.map(ev => ev.state),
            ['claimed', 'claim_expired', 'claimed'],
        );
        // claim_expired names the PRIOR claimant; the new
        // claimed names the caller.
        assert.equal(events[1]!.member_id, 'other');
        assert.equal(events[2]!.member_id, 'current');
    },
);

test(
    'a released claim allows a fresh claim',
    async () => {
        const db = await seededDb();
        await db.states.put('cl-1', {
            entity_id: 'wo1',
            state: 'claimed',
            member_id: 'other',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await db.states.put('cl-2', {
            entity_id: 'wo1',
            state: 'claim_released',
            member_id: 'other',
            at: '2026-01-01T00:00:01.000000Z',
        });
        await POST(
            db, 'work-orders/wo1/claim', {}, DEV_TOKEN,
        );
        const events = await claimEventsFor(db);
        const last = events[events.length - 1]!;
        assert.equal(last.state, 'claimed');
        assert.equal(last.member_id, 'current');
    },
);
