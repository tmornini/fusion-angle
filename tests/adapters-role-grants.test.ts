import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    validateRoleGrantEntity,
} from '../api/validators.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    postRoleRevocation,
} from '../web-app/app/adapters/role-grants.ts';
import { deriveRoleGrants } from
    '../api/derive-identity-spine.ts';
import {
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { SYSTEM_MEMBER_ID } from '../api/types.ts';

test('validates a role-grant body', () => {
    assert.deepEqual(
        validateRoleGrantEntity({
            organization_id: '1',
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2026-06-03T00:00:00.000000Z',
        }),
        {
            organization_id: '1',
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2026-06-03T00:00:00.000000Z',
        },
    );
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            organization_id: '1',
            identity_id: 'c', role: 'admin',
            action: 'granted', by_member_id: 's',
            at: 'x', extra: 1,
        }));
});

test('rejects an unknown action', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            organization_id: '1',
            identity_id: 'c', role: 'admin',
            action: 'elevated', by_member_id: 's',
            at: '2026-06-03T00:00:00.000000Z',
        }));
});

test('rejects an unparseable timestamp', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            organization_id: '1',
            identity_id: 'c', role: 'admin',
            action: 'granted', by_member_id: 's',
            at: 'not-a-date',
        }));
});

// Phase Final Stage B: role_grants table retired — store
// append pins live on pair-plane document tests.

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);   // current may write grants
    return { db, ctx: createRequestContext(db, await organizationToken()) };
}

// Phase Final Task 2: role_grants ROW half stripped — seed
// and count live on the pair plane.

async function seedGrant(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
    organization: string,
): Promise<void> {
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error('no role-grants/:id WRS');
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
        requestAt: '2026-01-01T00:00:00.000000Z',
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

test('revocation appends and stamps the actor', async () => {
    const { db, ctx } = await adminCtx();
    await seedGrant(db, 'rg-test', {
        identity_id: 'p2',
        role: 'viewer',
        action: 'granted',
        by_member_id: 'current',
        at: '2026-01-01T00:00:00.000000Z',
    }, '1');
    await postRoleRevocation(ctx, 'p2', 'viewer');
    const events = (await deriveRoleGrants(db))
        .filter(r => r.identity_id === 'p2');
    assert.equal(events.length, 2);   // grant retained
    const revoked = events.find(
        r => r.action === 'revoked',
    );
    assert.equal(revoked?.by_member_id, 'current');
    // Phase Final Stage B: identity spine tables retired.
});
