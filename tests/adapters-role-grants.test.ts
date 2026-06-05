import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEFAULT_ORG } from '../api/types.ts';
import {
    validateRoleGrantEntity,
} from '../api/validators.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    postRoleGrant,
    postRoleRevocation,
    getRolesFor,
} from '../web-app/app/adapters/role-grants.ts';

test('validates a role-grant body', () => {
    assert.deepEqual(
        validateRoleGrantEntity({
            organization_id: DEFAULT_ORG,
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2026-06-03T00:00:00.000Z',
        }),
        {
            organization_id: DEFAULT_ORG,
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2026-06-03T00:00:00.000Z',
        },
    );
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            organization_id: DEFAULT_ORG,
            identity_id: 'c', role: 'admin',
            action: 'granted', by_member_id: 's',
            at: 'x', extra: 1,
        }));
});

test('rejects an unknown action', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            organization_id: DEFAULT_ORG,
            identity_id: 'c', role: 'admin',
            action: 'elevated', by_member_id: 's',
            at: '2026-06-03T00:00:00.000Z',
        }));
});

test('rejects an unparseable timestamp', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            organization_id: DEFAULT_ORG,
            identity_id: 'c', role: 'admin',
            action: 'granted', by_member_id: 's',
            at: 'not-a-date',
        }));
});

test('role_grants store retains appended events', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.roleGrants.put('g1', {
        organization_id: DEFAULT_ORG,
        identity_id: 'current', role: 'admin',
        action: 'granted', by_member_id: 'system',
        at: '2026-01-01T00:00:00.000Z',
    });
    await db.roleGrants.put('g2', {
        organization_id: DEFAULT_ORG,
        identity_id: 'current', role: 'admin',
        action: 'revoked', by_member_id: 'system',
        at: '2026-02-01T00:00:00.000Z',
    });
    const rows = await db.roleGrants.getAll();
    assert.equal(rows.length, 2);   // append-only retained
});

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);   // current may write grants
    return { db, ctx: createRequestContext(db, await devToken()) };
}

test('grant then read reflects the role', async () => {
    const { ctx } = await adminCtx();
    await postRoleGrant(ctx, 'p2', 'viewer');
    assert.deepEqual(
        await getRolesFor(ctx, 'p2'), ['viewer']);
});

test('revoke removes the role; ledger retains all', async () => {
    const { db, ctx } = await adminCtx();
    await postRoleGrant(ctx, 'p2', 'viewer');
    await postRoleRevocation(ctx, 'p2', 'viewer');
    const events = await db.roleGrants.getAll();
    // seed-admin + grant + revoke = 3 retained
    assert.equal(events.length, 3);
    assert.deepEqual(await getRolesFor(ctx, 'p2'), []);
});

test('the actor is recorded as by_member_id', async () => {
    const { db, ctx } = await adminCtx();
    await postRoleGrant(ctx, 'p2', 'viewer');
    const rows = await db.roleGrants.getAll();
    const granted = rows.find(r => r.identity_id === 'p2');
    assert.equal(granted?.by_member_id, 'current');
});
