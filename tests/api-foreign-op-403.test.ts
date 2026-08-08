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
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { SYSTEM_MEMBER_ID, nowUtc } from '../api/types.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';

// New foreign-op 403 pins (HTTP status covenant): work-order
// claim/release and flow undo were untested for foreign-org
// callers. The write authorizer never covers these POSTs; the miss
// path probe is the only guard.

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
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...extraHeaders,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function membershipPair(
    membershipId: string,
    body: Record<string, unknown>,
    organization: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error('missing memberships/:id spec');
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/memberships/${membershipId}`,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', membershipId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [membershipId], body, SYSTEM_MEMBER_ID,
            organization,
        ),
        headPairId: undefined,
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
    await postMembershipDocumentOp(
        db, 'm-current-b', memBody, SYSTEM_MEMBER_ID,
        await membershipPair(
            'm-current-b', memBody, ORGANIZATION_B,
        ),
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

test('foreign-org work-order claim is 403', async () => {
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
    assert.equal(created.status, 200);

    const claimAt = nowUtc();
    const foreign = await handleRequest(db, req(
        'POST', '/work-orders/wo-foreign-claim/claim', tokenB, {
            claimEventId: generateCryptoSafeBase62(),
            claimAt,
            expireEventId: generateCryptoSafeBase62(),
            expireAt: claimAt,
        },
    ));
    assert.equal(foreign.status, 403);
    assert.deepEqual(await foreign.json(), {
        error:
            'forbidden: work_orders/wo-foreign-claim belongs'
            + ' to a different organization',
    });
});

test('foreign-org work-order release is 403', async () => {
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
    assert.equal(created.status, 200);

    const foreign = await handleRequest(db, req(
        'POST', '/work-orders/wo-foreign-rel/release', tokenB, {
            releaseEventId: generateCryptoSafeBase62(),
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(foreign.status, 403);
    assert.deepEqual(await foreign.json(), {
        error:
            'forbidden: work_orders/wo-foreign-rel belongs'
            + ' to a different organization',
    });
});

test('foreign-org work-order transition is 403', async () => {
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
    assert.equal(created.status, 200);

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
    assert.equal(foreign.status, 403);
    assert.deepEqual(await foreign.json(), {
        error:
            'forbidden: work_orders/wo-foreign-tx belongs'
            + ' to a different organization',
    });
});

test('foreign-org flow undo is 403', async () => {
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
        created.status === 204 || created.status === 200,
        'flow create status ' + created.status,
    );

    const foreign = await handleRequest(db, req(
        'POST', '/flows/flow-foreign-undo/undo', tokenB, {
            eventId: 'flow-foreign-undo-undo-ev',
            at: AT,
        },
    ));
    assert.equal(foreign.status, 403);
    assert.deepEqual(await foreign.json(), {
        error:
            'forbidden: flows/flow-foreign-undo belongs to a'
            + ' different organization',
    });
});

