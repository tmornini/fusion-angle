import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';

// Family-history ownership fence. Own-org history is 200 with
// the document-trio genesis; foreign ownership is 403 with an
// honest body. Full per-family fence coverage lives in
// api-entity-history-routes.test.ts. Per-family write-
// write authorizer pins live in api-write-authorizer.
// Unknown-route 404 (writes-nothing) lives in api.test.ts.

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

async function seed(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A',
        identity_id: 'memberA',
        type: 'admin',
        at: AT,
    });
    // Own-org idea document — family-history reads target it.
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

test('GET /ideas/:id/history is 200', async () => {
    const { db, token } = await seed();
    const res = await handleRequest(db, req(
        'GET', '/ideas/idea-a/history', token,
    ));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.ok(
        rows.some(r => r.id === 'idea-a-genesis'),
        'own-org history carries the document-trio genesis',
    );
});

test('GET /ideas/:id/history fences foreign ownership'
+ ' (403 with forbidden body)',
async () => {
    const { db, token } = await seed();
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B',
        identity_id: 'memberB',
        type: 'admin',
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
        'GET', '/ideas/idea-b/history', token,
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(
        await res.json(),
        {
            error:
                'forbidden: ideas/idea-b belongs to'
                + ' a different organization',
        },
    );
});
