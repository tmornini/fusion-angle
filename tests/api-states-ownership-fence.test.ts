import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';

// States-address retirement: every verb on /states/:id is a
// ROUTER 404 — the route entry is deleted, so the old
// 405-because-PUT-survives case is gone. These pins are
// against a VALID token and an OWN-ORG entity id in the body,
// so a passing 404 can only be the router's (the ownership
// fence that once produced look-alike 404s is deleted).
//
// Surviving reads still match. Write-intent coverage re-homed
// in stages 1-3: member archive → PUT members/:id, objective
// archive → PUT objectives/:id, unclaim → POST release.
// Cross-org WRITE forgery is impossible by construction —
// no address accepts a body naming a foreign entity_id; the
// per-family write-ownership fence pins live in
// api-write-ownership-fence.test.ts.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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
            Authorization: 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedRoleGrantPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/role-grants/' + id,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postRoleGrantDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seed(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A',
        identity_id: 'memberA',
        at: AT,
    });
    await seedRoleGrantPair(db, 'rg-a', {
        organization_id: 'A',
        identity_id: 'memberA',
        role: 'member',
        action: 'granted',
        by_member_id: SYSTEM_MEMBER_ID,
        at: AT,
    });
    // Own-org idea document — the entity_id a retired PUT
    // would have named. Lands through the document address
    // so surviving history/field-values reads have a target.
    const token = await organizationToken('memberA', 'A');
    const idea = await handleRequest(db, req(
        'PUT', '/ideas/idea-a', token, {
            title: 'Idea A',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: AT,
            state_event_id: 'idea-a-genesis',
        },
    ));
    assert.equal(idea.status, 200);
    return { db, token };
}

for (const method of ['GET', 'PUT', 'POST', 'DELETE'] as
    const) {
    test(`${method} /states/:id is a router 404`,
    async () => {
        const { db, token } = await seed();
        const res = await handleRequest(db, req(
            method, '/states/idea-a-genesis', token,
            method === 'PUT' || method === 'POST'
                ? {
                    entity_id: 'idea-a',
                    state: 'active',
                    at: AT,
                }
                : undefined,
        ));
        assert.equal(res.status, 404);
    });
}

test('GET /states is 200', async () => {
    const { db, token } = await seed();
    const res = await handleRequest(
        db, req('GET', '/states', token),
    );
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.ok(
        rows.some(r => r.id === 'idea-a-genesis'),
        'own-org genesis surfaces on the collection',
    );
});

test('GET /states/:id/field-values is 200', async () => {
    const { db, token } = await seed();
    const res = await handleRequest(db, req(
        'GET', '/states/idea-a-genesis/field-values', token,
    ));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
});

test('GET /entity-states/:id/history is 200', async () => {
    const { db, token } = await seed();
    const res = await handleRequest(db, req(
        'GET', '/entity-states/idea-a/history', token,
    ));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.ok(
        rows.some(r => r.id === 'idea-a-genesis'),
        'own-org history carries the document-trio genesis',
    );
});

test('surviving GET entity-states/:id/history still fences'
+ ' foreign ownership (404 with Not found body)',
async () => {
    const { db, token } = await seed();
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B',
        identity_id: 'memberB',
        at: AT,
    });
    await seedRoleGrantPair(db, 'rg-b', {
        organization_id: 'B',
        identity_id: 'memberB',
        role: 'member',
        action: 'granted',
        by_member_id: SYSTEM_MEMBER_ID,
        at: AT,
    });
    const tokenB = await organizationToken('memberB', 'B');
    const foreignIdea = await handleRequest(db, req(
        'PUT', '/ideas/idea-b', tokenB, {
            title: 'Idea B',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
            state_at: AT,
            state_event_id: 'idea-b-genesis',
        },
    ));
    assert.equal(foreignIdea.status, 200);
    const res = await handleRequest(db, req(
        'GET', '/entity-states/idea-b/history', token,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        {
            error:
                'Not found: /entity-states/idea-b/history',
        },
    );
});
