import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Foreign-op miss pins: work-order claim/release/transition
// and flow undo. The write authorizer never covers these
// POSTs; a miss at this address is 404.

const ORGANIZATION_A = 'AjdvjuECVZEgZoFajaIEkg';
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
        ...(extraHeaders !== undefined
            ? { headers: extraHeaders } : {}),
        operationId: TEST_OPERATION_ID,
    });
}

async function twoOrganizationDb(): Promise<{
    db: MemoryDbAdapter;
    organizationB: string;
}> {
    const db = memoryDbAdapter();
    const organizationB = generateIdentifier();
    await seedAdminSchema(db);
    await seedOrganizationDocument(db, organizationB, 'Beta');
    const memBody = {
        organization_id: organizationB,
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
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

    return { db, organizationB };
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: 300,
        nodes: [],
        edges: [],
    };
}

Deno.test('foreign-org work-order claim is 404', async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationB,
    );
    const created = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yCFjxREVDLjycQDxFIsqIg', tokenA, {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
    ));
    assertStrictEquals(created.status, 201);

    const claimAt = nowUtc();
    const foreign = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organizationB
            + '/work-orders/yCFjxREVDLjycQDxFIsqIg/claim',
        tokenB, {
            claimEventId: generateIdentifier(),
            claimAt,
            expireEventId: generateIdentifier(),
            expireAt: claimAt,
        },
    ));
    assertStrictEquals(foreign.status, 404);
    assertEquals(await foreign.json(), {
        error:
            'Not found: work_orders/yCFjxREVDLjycQDxFIsqIg',
    });
});

Deno.test('foreign-org work-order release is 404', async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationB,
    );
    const created = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yDEYnDEKhTTMRnyKdusvCw', tokenA, {
            display_id: 'efgh',
            flow_graph: graphJson(),
            position: 2,
        },
    ));
    assertStrictEquals(created.status, 201);

    const foreign = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + organizationB
            + '/work-orders/yDEYnDEKhTTMRnyKdusvCw/claim',
        tokenB,
    ));
    assertStrictEquals(foreign.status, 404);
});

Deno.test('foreign-org work-order transition is 404', async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationB,
    );
    const created = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yHJmosJCPJCTxoRaPwKdQA', tokenA, {
            display_id: 'ijkl',
            flow_graph: graphJson(),
            position: 3,
        },
    ));
    assertStrictEquals(created.status, 201);

    const foreign = await handleRequest(db, req(
        'POST',
        '/organizations/' + organizationB
            + '/work-orders/yHJmosJCPJCTxoRaPwKdQA/transition',
        tokenB,
        {
            transitionEventId: generateIdentifier(),
            targetState: 'n-next',
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assertStrictEquals(foreign.status, 404);
    assertEquals(await foreign.json(), {
        error:
            'Not found: work_orders/yHJmosJCPJCTxoRaPwKdQA',
    });
});

Deno.test('foreign-org flow undo is 404', async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const tokenB = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationB,
    );
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', tokenA, {
            id: 'aRKhwTupsfXtczSCmaJMGQ',
            flow: {
                name: 'Foreign Undo',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 300,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: 'aRKhwTupsfXtczSCmaJMGQ',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: [], edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        },
    ));
    assert(
        created.status === 201 || created.status === 201,
        'flow create status ' + created.status,
    );

    const foreign = await handleRequest(db, req(
        'POST',
        '/organizations/' + organizationB
            + '/flows/aRKhwTupsfXtczSCmaJMGQ/undo',
        tokenB, {
            eventId: generateIdentifier(),
            at: AT,
        },
    ));
    assertStrictEquals(foreign.status, 404);
    assertEquals(await foreign.json(), {
        error: 'Not found: flows/aRKhwTupsfXtczSCmaJMGQ',
    });
});

