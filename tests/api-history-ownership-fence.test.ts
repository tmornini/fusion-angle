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
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Family-history ownership fence. Own-org history is 200
// with the document-trio genesis; a miss at this address
// is 404. 403 only when this address has a live PUT the
// caller may not have. Full per-family coverage lives in
// api-entity-history-routes.test.ts. Write-authorizer
// pins live in api-write-authorizer. Unknown-route 404
// lives in api.test.ts.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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

async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
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
        'PUT', '/organizations/A/ideas/idea-a', token, {
            title: 'Idea A',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
        },
    ));
    assert.equal(idea.status, 201);
    return { db, token };
}

test('GET /organizations/:id/ideas/:id/versions/ is 200', async () => {
    const { db, token } = await seed();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas/idea-a/versions/', token,
    ));
    assert.equal(res.status, 200);
    const rows = await res.json() as {
        id: string;
        state: string;
    }[];
    assert.ok(
        rows.some(r => r.id === 'idea-a' && r.state === 'active'),
        'own-org versions list the idea collection item',
    );
});

test('GET /organizations/:id/ideas/:id/versions/ foreign miss is 404'
+ ' at this address',
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
        'PUT', '/organizations/B/ideas/idea-b', tokenB, {
            title: 'Idea B',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
        },
    ));
    assert.equal(foreignIdea.status, 201);
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas/idea-b/versions/', token,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(
        await res.json(),
        {
            error: 'Not found: ideas/idea-b',
        },
    );
});
