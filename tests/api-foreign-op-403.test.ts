import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { nowUtc } from '../api/types.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Foreign-op miss pins: work-order claim/release/transition
// and flow undo. The write authorizer never covers these
// POSTs; a miss at this address is 404.

const BASE = 'http://localhost';
const ORGANIZATION_A = '1';
const ORGANIZATION_B = 'B';
const AT = '2020-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        headers: extraHeaders,
        operationId: TEST_OPERATION_ID,
    });
}

async function twoOrganizationDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedOrganizationDocument(db, ORGANIZATION_B, 'Beta');
    const memBody = {
        organization_id: ORGANIZATION_B,
        identity_id: 'current',
        type: 'admin',
        at: AT,
    };
    await seedSeat(
        db,
        String(memBody['organization_id'] ?? memBody.organization_id),
        String(memBody['identity_id'] ?? memBody.identity_id),
        (memBody['type'] ?? memBody.type) as 'admin' | 'member',
        String(memBody['at'] ?? memBody.at),
    );

    return db;
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: 300,
        nodes: [],
        edges: [],
    };
}

test('foreign-org work-order claim is 404', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'current', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'current', ORGANIZATION_B,
    );
    const created = await handleRequest(db, req(
        'PUT', '/work-orders/wo-foreign-claim', tokenA, {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
    ));
    assert.equal(created.status, 201);

    const claimAt = nowUtc();
    const foreign = await handleRequest(db, req(
        'PUT', '/work-orders/wo-foreign-claim/claim', tokenB, {
            claimEventId: generateCryptoSafeBase62(),
            claimAt,
            expireEventId: generateCryptoSafeBase62(),
            expireAt: claimAt,
        },
    ));
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), {
        error:
            'Not found: work_orders/wo-foreign-claim',
    });
});

test('foreign-org work-order release is 404', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'current', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'current', ORGANIZATION_B,
    );
    const created = await handleRequest(db, req(
        'PUT', '/work-orders/wo-foreign-rel', tokenA, {
            display_id: 'efgh',
            flow_graph: graphJson(),
            position: 2,
        },
    ));
    assert.equal(created.status, 201);

    const foreign = await handleRequest(db, req(
        'DELETE', '/work-orders/wo-foreign-rel/claim', tokenB,
    ));
    assert.equal(foreign.status, 404);
});

test('foreign-org work-order transition is 404', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'current', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'current', ORGANIZATION_B,
    );
    const created = await handleRequest(db, req(
        'PUT', '/work-orders/wo-foreign-tx', tokenA, {
            display_id: 'ijkl',
            flow_graph: graphJson(),
            position: 3,
        },
    ));
    assert.equal(created.status, 201);

    const foreign = await handleRequest(db, req(
        'POST',
        '/work-orders/wo-foreign-tx/transition',
        tokenB,
        {
            transitionEventId: generateCryptoSafeBase62(),
            targetState: 'n-next',
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), {
        error:
            'Not found: work_orders/wo-foreign-tx',
    });
});

test('foreign-org flow undo is 404', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'current', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'current', ORGANIZATION_B,
    );
    const created = await handleRequest(db, req(
        'POST', '/flows', tokenA, {
            id: 'flow-foreign-undo',
            flow: {
                name: 'Foreign Undo',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 300,
            },
            projectFlowId: 'pf-foreign-undo',
            projectFlow: {
                project_id: 'proj-foreign-undo',
                flow_id: 'flow-foreign-undo',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: 'flow-foreign-undo-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [], edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        },
    ));
    assert.ok(
        created.status === 201 || created.status === 201,
        'flow create status ' + created.status,
    );

    const foreign = await handleRequest(db, req(
        'POST', '/flows/flow-foreign-undo/undo', tokenB, {
            eventId: 'flow-foreign-undo-undo-ev',
            at: AT,
        },
    ));
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), {
        error: 'Not found: flows/flow-foreign-undo',
    });
});

