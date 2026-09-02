import { assertStrictEquals } from '@std/assert';
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
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Pre-write authorizer: probe this address. Same id at two
// collections is two documents. Foreign-id PUT geneses here;
// foreign-id DELETE never-written here is 404; genesis
// (owner-null) is unaffected.

const ORGANIZATION_A = 'AjdvjuECVZEgZoFajaIEkg';

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

function ideaDocument(
    title: string,
    _stateEventId: string,
) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
}

// Org A = seedRootAdmin's 'AjdvjuECVZEgZoFajaIEkg'; Org B is a second tenant
// that
// `current` also administers — foreign-id probes always use the
// B token against an A-owned document. Privilege is membership
// type:"admin" (claim roles bake at mint).
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
        at: '2020-01-01T00:00:00.000000Z',
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

Deno.test('foreign-id PUT organizations/:id/ideas/:id geneses at this'
+ ' address', async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , ORGANIZATION_A);
    const tokenB = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , organizationB);
    const created = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gfwcurTzrfssEsWJyNeUyQ', tokenA,
        ideaDocument('A-owned', 'ev-idea-a'),
    ));
    assertStrictEquals(created.status, 201);

    const foreign = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organizationB + '/ideas/gfwcurTzrfssEsWJyNeUyQ',
        tokenB,
        ideaDocument('stolen', 'ev-steal'),
    ));
    assertStrictEquals(foreign.status, 201);
    const gotB = await handleRequest(db, req(
        'GET',
        '/organizations/' + organizationB + '/ideas/gfwcurTzrfssEsWJyNeUyQ',
        tokenB,
    ));
    assertStrictEquals(gotB.status, 200);
    const wireB = await gotB.json() as {
        title: string;
        organization_id: string;
    };
    assertStrictEquals(wireB.title, 'stolen');
    assertStrictEquals(wireB.organization_id, organizationB);
    const gotA = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gfwcurTzrfssEsWJyNeUyQ', tokenA,
    ));
    assertStrictEquals(gotA.status, 200);
    const wireA = await gotA.json() as {
        title: string;
        organization_id: string;
    };
    assertStrictEquals(wireA.title, 'A-owned');
    assertStrictEquals(wireA.organization_id, ORGANIZATION_A);
});

Deno.test('genesis PUT organizations/:id/ideas/:id in the'
    + ' caller org is unaffected',
async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenB = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , organizationB);
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organizationB
            + '/ideas/gmdHxjEYmxOsDKfNPlGSig',
        tokenB,
        ideaDocument('B-new', 'ev-idea-b'),
    ));
    assertStrictEquals(res.status, 201);
    // Phase Final Task 2: ideas row half stripped — org stamp
    // rides WRITE_RESPONSE_SPECS / derive GET, not the row.
    const getRes = await handleRequest(db, req(
        'GET',
        '/organizations/' + organizationB
            + '/ideas/gmdHxjEYmxOsDKfNPlGSig',
        tokenB,
    ));
    assertStrictEquals(getRes.status, 200);
    const wire = await getRes.json() as {
        organization_id: string;
    };
    assertStrictEquals(wire.organization_id, organizationB);
});

Deno.test('foreign-id DELETE nested record-types is 204',
async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , ORGANIZATION_A);
    const tokenB = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , organizationB);
    const created = await handleRequest(db, req(
        'POST',
        '/organizations/' + ORGANIZATION_A
            + '/record-types/',
        tokenA, {
            id: 'rlzgSSwpqXVHTYfBzjWFWQ',
            kind: 'create',
            record: {
                organization_id: ORGANIZATION_A,
                name: 'A record',
                description: 'd',
                position: 1,
            },
            attributes: [],
            initialStateEventId: generateIdentifier(),
            initialState: 'active',
            initialStateAt: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(created.status, 201);

    const foreign = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + organizationB
            + '/record-types/rlzgSSwpqXVHTYfBzjWFWQ',
        tokenB,
    ));
    // Never written at B's record-types address: 404,
    // nothing stored. A's document is untouched.
    assertStrictEquals(foreign.status, 404);
    const still = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_A
            + '/record-types/rlzgSSwpqXVHTYfBzjWFWQ',
        tokenA,
    ));
    assertStrictEquals(still.status, 200);
    const row = await still.json() as { name: string };
    assertStrictEquals(row.name, 'A record');
});

Deno.test('foreign-id DELETE seat is a miss in the caller org',
async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , ORGANIZATION_A);
    const tokenB = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , organizationB);
    const created = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_A
            + '/members/uTGrEpVpODbNhDhDVdWeqQ',
        tokenA,
        {
            type: 'member',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(created.status, 201);

    const foreign = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + organizationB
            + '/members/uTGrEpVpODbNhDhDVdWeqQ',
        tokenB,
    ));
    assertStrictEquals(foreign.status, 404);
    const stillThere = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_A
            + '/members/uTGrEpVpODbNhDhDVdWeqQ',
        tokenA,
    ));
    assertStrictEquals(stillThere.status, 200);
    const row = await stillThere.json() as {
        organization_id: string;
    };
    assertStrictEquals(row.organization_id, ORGANIZATION_A);
});

Deno.test('foreign-id PUT organizations/:id/projects/:id geneses at'
+ ' this address', async () => {
    const { db, organizationB } = await twoOrganizationDb();
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , ORGANIZATION_A);
    const tokenB = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , organizationB);
    const projectBody = {
        title: 'A project',
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
        state: 'submitted',
    };
    const created = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'qizdVmLlnGCvMsomvBDqmw', tokenA, projectBody,
    ));
    assertStrictEquals(created.status, 201);

    const foreign = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organizationB
            + '/projects/qizdVmLlnGCvMsomvBDqmw',
        tokenB, {
            ...projectBody,
            title: 'stolen',
        },
    ));
    assertStrictEquals(foreign.status, 201);
    const gotB = await handleRequest(db, req(
        'GET',
        '/organizations/' + organizationB
            + '/projects/qizdVmLlnGCvMsomvBDqmw',
        tokenB,
    ));
    assertStrictEquals(gotB.status, 200);
    const wireB = await gotB.json() as {
        title: string;
        organization_id: string;
    };
    assertStrictEquals(wireB.title, 'stolen');
    assertStrictEquals(wireB.organization_id, organizationB);
    const gotA = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'qizdVmLlnGCvMsomvBDqmw', tokenA,
    ));
    assertStrictEquals(gotA.status, 200);
    const wireA = await gotA.json() as {
        title: string;
        organization_id: string;
    };
    assertStrictEquals(wireA.title, 'A project');
    assertStrictEquals(wireA.organization_id, ORGANIZATION_A);
});
