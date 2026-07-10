import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { SYSTEM_MEMBER_ID, nowUtc } from '../api/types.ts';

// Phase Final Task 1(e): pass-first pins for the pre-write
// ownership gate. Foreign-id PUT 404 per family class;
// foreign-id DELETE 404 (records/:id, memberships/:id);
// genesis (owner-null) unaffected. Wire body is the same
// EntityNotFoundError shape OrganizationScopedEntityStore
// #assertMine already throws today.

const BASE = 'http://localhost';
const ORGANIZATION_A = '1';
const ORGANIZATION_B = 'B';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
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
        headPairId: undefined,
    });
}

async function roleGrantPair(
    roleGrantId: string,
    body: Record<string, unknown>,
    organization: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error('missing role-grants/:id spec');
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/role-grants/${roleGrantId}`,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', roleGrantId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [roleGrantId], body, SYSTEM_MEMBER_ID,
            organization,
        ),
        headPairId: undefined,
    });
}

// Org A = seedRootAdmin's '1'; Org B is a second tenant that
// `current` also administers — foreign-id probes always use the
// B token against an A-owned document.
async function twoOrganizationDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedOrganizationDocument(db, ORGANIZATION_B, 'Beta');
    const roleBody = {
        organization_id: ORGANIZATION_B,
        identity_id: 'current',
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postRoleGrantDocumentOp(
        db, 'role-current-admin-b', roleBody, SYSTEM_MEMBER_ID,
        await roleGrantPair(
            'role-current-admin-b', roleBody, ORGANIZATION_B,
        ),
    );
    const memBody = {
        organization_id: ORGANIZATION_B,
        identity_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postMembershipDocumentOp(
        db, 'm-current-b', memBody, SYSTEM_MEMBER_ID,
        await membershipPair('m-current-b', memBody, ORGANIZATION_B),
    );
    return db;
}

test('foreign-id PUT ideas/:id 404s with Not found body',
async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const created = await handleRequest(db, req(
        'PUT', '/ideas/idea-a', tokenA,
        ideaDocument('A-owned', 'ev-idea-a'),
    ));
    assert.equal(created.status, 200);

    const foreign = await handleRequest(db, req(
        'PUT', '/ideas/idea-a', tokenB,
        ideaDocument('stolen', 'ev-steal'),
    ));
    assert.equal(foreign.status, 404);
    const body = await foreign.json() as { error: string };
    assert.equal(body.error, 'Not found: ideas/idea-a');
});

test('genesis PUT ideas/:id in the caller org is unaffected',
async () => {
    const db = await twoOrganizationDb();
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const res = await handleRequest(db, req(
        'PUT', '/ideas/idea-b-genesis', tokenB,
        ideaDocument('B-new', 'ev-idea-b'),
    ));
    assert.equal(res.status, 200);
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

test('foreign-id DELETE records/:id 404s', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const created = await handleRequest(db, req(
        'POST', '/records', tokenA, {
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
    assert.equal(created.status, 204);

    const foreign = await handleRequest(db, req(
        'DELETE', '/records/rec-a', tokenB,
    ));
    assert.equal(foreign.status, 404);
    const body = await foreign.json() as { error: string };
    assert.equal(body.error, 'Not found: records/rec-a');
    // Phase Final Task 2: pair-plane document still present —
    // nothing tombstoned; A can still GET.
    const still = await handleRequest(db, req(
        'GET', '/records/rec-a', tokenA,
    ));
    assert.equal(still.status, 200);
    const row = await still.json() as { name: string };
    assert.equal(row.name, 'A record');
    // Phase Final Stage B: records table retired.
});

test('foreign-id DELETE memberships/:id 404s', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    // A second membership row in A (not current's own).
    const created = await handleRequest(db, req(
        'PUT', '/memberships/m-other-a', tokenA, {
            organization_id: ORGANIZATION_A,
            identity_id: 'someone-else',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(created.status, 200);

    const foreign = await handleRequest(db, req(
        'DELETE', '/memberships/m-other-a', tokenB,
    ));
    assert.equal(foreign.status, 404);
    const body = await foreign.json() as { error: string };
    assert.equal(
        body.error, 'Not found: memberships/m-other-a',
    );
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

test('foreign-id PUT role-grants/:id 404s', async () => {
    const db = await twoOrganizationDb();
    const tokenA = await organizationToken('current', ORGANIZATION_A);
    const tokenB = await organizationToken('current', ORGANIZATION_B);
    const created = await handleRequest(db, req(
        'PUT', '/role-grants/rg-a', tokenA, {
            identity_id: 'someone-else',
            role: 'member',
            action: 'granted',
            by_member_id: 'current',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(created.status, 200);

    const foreign = await handleRequest(db, req(
        'PUT', '/role-grants/rg-a', tokenB, {
            identity_id: 'someone-else',
            role: 'admin',
            action: 'granted',
            by_member_id: 'current',
            at: '2026-01-02T00:00:00.000000Z',
        },
    ));
    assert.equal(foreign.status, 404);
    const body = await foreign.json() as { error: string };
    assert.equal(body.error, 'Not found: role_grants/rg-a');
});

test('foreign-id PUT projects/:id 404s (second family class)',
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
    assert.equal(created.status, 200);

    const foreign = await handleRequest(db, req(
        'PUT', '/projects/proj-a', tokenB, {
            ...projectBody,
            title: 'stolen',
            state_event_id: 'ev-steal-proj',
        },
    ));
    assert.equal(foreign.status, 404);
    const body = await foreign.json() as { error: string };
    assert.equal(body.error, 'Not found: projects/proj-a');
});
