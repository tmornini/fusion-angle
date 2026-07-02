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

test('role_grants store retains appended events', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.roleGrants.put('g1', {
        organization_id: '1',
        identity_id: 'current', role: 'admin',
        action: 'granted', by_member_id: 'system',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await db.roleGrants.put('g2', {
        organization_id: '1',
        identity_id: 'current', role: 'admin',
        action: 'revoked', by_member_id: 'system',
        at: '2026-02-01T00:00:00.000000Z',
    });
    const rows = await db.roleGrants.getAll();
    assert.equal(rows.length, 2);   // append-only retained
});

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);   // current may write grants
    return { db, ctx: createRequestContext(db, await organizationToken()) };
}


test('revocation appends and stamps the actor', async () => {
    const { db, ctx } = await adminCtx();
    await db.roleGrants.put('rg-test', {
        organization_id: '1',
        identity_id: 'p2',
        role: 'viewer',
        action: 'granted',
        by_member_id: 'current',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await postRoleRevocation(ctx, 'p2', 'viewer');
    const events = (await db.roleGrants.getAll())
        .filter(r => r.identity_id === 'p2');
    assert.equal(events.length, 2);   // grant retained
    const revoked = events.find(
        r => r.action === 'revoked',
    );
    assert.equal(revoked?.by_member_id, 'current');
});
