import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    PUT,
    handleRequest,
} from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { nowUtc } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { workOrderClaimHistoryFor } from
    '../api/derive-states.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

const BASE = 'http://localhost';
const WO_ID = 'wo1';

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

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    };
}

// wo1 is seeded via a REAL PUT (never a raw db.workOrders.put)
// so it carries a genuine organizations/:id/work-orders/:id document pair —
// same fixture posture as api-work-order-claim.test.ts.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await PUT(
        db, 'organizations/1/work-orders/' + WO_ID, {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        DEV_TOKEN,
    );
    return db;
}

function claimEventsFor(
    db: MemoryDbAdapter,
): Promise<{
    id: string;
    state: string;
    member_id: string;
    at: string;
}[]> {
    return workOrderClaimHistoryFor(
        db, STARK_ORGANIZATION, WO_ID,
    );
}

function freshClaimBody() {
    const expireAt = nowUtc();
    const claimAt = nowUtc();
    return {
        claimEventId: generateCryptoSafeBase62(),
        claimAt,
        expireEventId: generateCryptoSafeBase62(),
        expireAt,
    };
}

// DELETE organizations/:id/work-orders/:id/claim releases. DELETE head =
// unclaimed. Never-written and unknown addresses 404.
// A second DELETE is 204 (already-gone).

test(
    'release of a live claim is 204 and the claim history'
    + ' shows claim_released',
    async () => {
        const db = await seededDb();
        await PUT(
            db, 'organizations/1/work-orders/' + WO_ID + '/claim',
            freshClaimBody(), DEV_TOKEN,
        );
        const res = await handleRequest(db, req(
            'DELETE',
            '/organizations/1/work-orders/' + WO_ID + '/claim',
            DEV_TOKEN,
        ));
        assert.equal(res.status, 204);
        const events = await claimEventsFor(db);
        const released = events.find(
            (ev) => ev.state === 'claim_released',
        );
        assert.ok(released !== undefined);
        assert.equal(released!.member_id, 'current');
    },
);

test(
    'DELETE claim with no row is 404; a second DELETE'
    + ' after release is 204',
    async () => {
        const db = await seededDb();
        const missing = await handleRequest(db, req(
            'DELETE',
            '/organizations/1/work-orders/' + WO_ID + '/claim',
            DEV_TOKEN,
        ));
        assert.equal(missing.status, 404);
        await PUT(
            db, 'organizations/1/work-orders/' + WO_ID + '/claim',
            freshClaimBody(), DEV_TOKEN,
        );
        const first = await handleRequest(db, req(
            'DELETE',
            '/organizations/1/work-orders/' + WO_ID + '/claim',
            DEV_TOKEN,
        ));
        assert.equal(first.status, 204);
        const second = await handleRequest(db, req(
            'DELETE',
            '/organizations/1/work-orders/' + WO_ID + '/claim',
            DEV_TOKEN,
        ));
        assert.equal(second.status, 204);
        const events = await claimEventsFor(db);
        assert.equal(
            events.filter(
                (ev) => ev.state === 'claim_released',
            ).length,
            1,
        );
    },
);

test(
    'release of another member\'s live claim succeeds'
    + ' (member-tier, today\'s open-release posture)',
    async () => {
        const db = await seededDb();
        await seedOrganizationMember(db, 'other');
        await PUT(
            db, 'organizations/1/work-orders/' + WO_ID + '/claim',
            freshClaimBody(), await devToken('other'),
        );
        const res = await handleRequest(db, req(
            'DELETE',
            '/organizations/1/work-orders/' + WO_ID + '/claim',
            DEV_TOKEN,
        ));
        assert.equal(res.status, 204);
        // claim_released authored by the releasing actor
        // (current), not the prior claimant (other).
        const events = await claimEventsFor(db);
        const released = events.find(
            (ev) => ev.state === 'claim_released',
        );
        assert.ok(released !== undefined);
        assert.equal(released!.member_id, 'current');
    },
);

test(
    'DELETE claim of an unknown work order is 404',
    async () => {
        const db = await seededDb();
        const res = await handleRequest(db, req(
            'DELETE',
            '/organizations/1/work-orders/no-such-wo/claim',
            DEV_TOKEN,
        ));
        assert.equal(res.status, 404);
    },
);
