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
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Pre-write authorizer: probe this address. Same id at two
// collections is two documents. Foreign-id PUT geneses here;
// foreign-id DELETE never-written here is 404; genesis
// (owner-null) is unaffected.

const BASE = 'http://localhost';
const ORGANIZATION_A = '1';
const ORGANIZATION_B = 'B';

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
    stateEventId: string,
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
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: stateEventId,
    };
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
        operationId: TEST_OPERATION_ID,
    });
}

// Org A = seedRootAdmin's '1'; Org B is a second tenant that
// `current` also administers — foreign-id probes always use the
// B token against an A-owned document. Privilege is membership
// type:"admin" (claim roles bake at mint).
async function twoOrganizationDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedOrganizationDocument(db, ORGANIZATION_B, 'Beta');
    const memBody = {
        organization_id: ORGANIZATION_B,
        identity_id: 'current',
        type: 'admin',
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postMembershipDocumentOp(
        db, 'm-current-b', memBody, SYSTEM_MEMBER_ID,
        await membershipPair('m-current-b', memBody, ORGANIZATION_B),
    );
    return db;
}

test('foreign-id PUT ideas/:id geneses at this address',
async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const created = await handleRequest(db, req(
        'PUT', '/ideas/idea-a', tokenA,
        ideaDocument('A-owned', 'ev-idea-a'),
    ));
    assert.equal(created.status, 201);

    const foreign = await handleRequest(db, req(
        'PUT', '/ideas/idea-a', tokenB,
        ideaDocument('stolen', 'ev-steal'),
    ));
    assert.equal(foreign.status, 201);
    const gotB = await handleRequest(db, req(
        'GET', '/ideas/idea-a', tokenB,
    ));
    assert.equal(gotB.status, 200);
    const wireB = await gotB.json() as {
        title: string;
        organization_id: string;
    };
    assert.equal(wireB.title, 'stolen');
    assert.equal(wireB.organization_id, ORGANIZATION_B);
    const gotA = await handleRequest(db, req(
        'GET', '/ideas/idea-a', tokenA,
    ));
    assert.equal(gotA.status, 200);
    const wireA = await gotA.json() as {
        title: string;
        organization_id: string;
    };
    assert.equal(wireA.title, 'A-owned');
    assert.equal(wireA.organization_id, ORGANIZATION_A);
});

test('genesis PUT ideas/:id in the caller org is unaffected',
async () => {
    const db = await twoOrganizationDb();
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const res = await handleRequest(db, req(
        'PUT', '/ideas/idea-b-genesis', tokenB,
        ideaDocument('B-new', 'ev-idea-b'),
    ));
    assert.equal(res.status, 201);
    // Phase Final Task 2: ideas row half stripped — org stamp
    // rides WRITE_RESPONSE_SPECS / derive GET, not the row.
    const getRes = await handleRequest(db, req(
        'GET', '/ideas/idea-b-genesis', tokenB,
    ));
    assert.equal(getRes.status, 200);
    const wire = await getRes.json() as {
        organization_id: string;
    };
    assert.equal(wire.organization_id, ORGANIZATION_B);
});

test('foreign-id DELETE nested record-types is 204',
async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const created = await handleRequest(db, req(
        'POST',
        '/organizations/' + ORGANIZATION_A
            + '/record-types',
        tokenA, {
            id: 'rec-a',
            kind: 'create',
            record: {
                organization_id: ORGANIZATION_A,
                name: 'A record',
                description: 'd',
                position: 1,
            },
            attributes: [],
            initialStateEventId: 'ev-rec-a',
            initialState: 'active',
            initialStateAt: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(created.status, 201);

    const foreign = await handleRequest(db, req(
        'DELETE',
        '/organizations/' + ORGANIZATION_B
            + '/record-types/rec-a',
        tokenB,
    ));
    // Never written at B's record-types address: 404,
    // nothing stored. A's document is untouched.
    assert.equal(foreign.status, 404);
    const still = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_A
            + '/record-types/rec-a',
        tokenA,
    ));
    assert.equal(still.status, 200);
    const row = await still.json() as { name: string };
    assert.equal(row.name, 'A record');
});

test('foreign-id DELETE memberships/:id is 204', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    // A second membership row in A (not current's own).
    const created = await handleRequest(db, req(
        'PUT', '/memberships/m-other-a', tokenA, {
            organization_id: ORGANIZATION_A,
            identity_id: 'someone-else',
        type: 'member',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(created.status, 201);

    const foreign = await handleRequest(db, req(
        'DELETE', '/memberships/m-other-a', tokenB,
    ));
    assert.equal(foreign.status, 404);
    // Phase Final Task 2: memberships ROW half stripped —
    // surviving document is on the pair plane under org A.
    const stillThere = await handleRequest(db, req(
        'GET', '/memberships/m-other-a', tokenA,
    ));
    assert.equal(stillThere.status, 200);
    const row = await stillThere.json() as {
        organization_id: string;
    };
    assert.equal(row.organization_id, ORGANIZATION_A);
    // Phase Final Stage B: roster tables retired.
});

test('foreign-id PUT projects/:id geneses at this address',
async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
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
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: 'ev-proj-a',
    };
    const created = await handleRequest(db, req(
        'PUT', '/projects/proj-a', tokenA, projectBody,
    ));
    assert.equal(created.status, 201);

    const foreign = await handleRequest(db, req(
        'PUT', '/projects/proj-a', tokenB, {
            ...projectBody,
            title: 'stolen',
            state_event_id: 'ev-steal-proj',
        },
    ));
    assert.equal(foreign.status, 201);
    const gotB = await handleRequest(db, req(
        'GET', '/projects/proj-a', tokenB,
    ));
    assert.equal(gotB.status, 200);
    const wireB = await gotB.json() as {
        title: string;
        organization_id: string;
    };
    assert.equal(wireB.title, 'stolen');
    assert.equal(wireB.organization_id, ORGANIZATION_B);
    const gotA = await handleRequest(db, req(
        'GET', '/projects/proj-a', tokenA,
    ));
    assert.equal(gotA.status, 200);
    const wireA = await gotA.json() as {
        title: string;
        organization_id: string;
    };
    assert.equal(wireA.title, 'A project');
    assert.equal(wireA.organization_id, ORGANIZATION_A);
});
