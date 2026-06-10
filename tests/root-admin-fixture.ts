import type { DbAdapter } from '../api/db.ts';

// Seed the demo `current` identity as a root admin directly at
// the storage layer (below the gate): the admin role grant AND
// the org membership the gate now resolves the request's org
// from. Both are needed — an admin of an org is a member of it —
// so a test driving the gate as `current` (devToken) resolves
// to an org and passes deny-by-default. Mirrors how the
// bootstrap/mock-data seeds plant the root admin.
export async function seedRootAdmin(
    db: DbAdapter,
): Promise<void> {
    await db.roleGrants.put('test-role-current-admin', {
        organization_id: '1',
        identity_id: 'current',
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await db.memberships.put('test-membership-current', {
        organization_id: '1',
        identity_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
}

// Seed an identity as a plain content-tier member of org '1':
// the member role grant AND the membership the gate resolves
// the org and liveness from. The member-tier counterpart of
// seedRootAdmin above.
export async function seedOrgMember(
    db: DbAdapter,
    identityId: string,
): Promise<void> {
    await db.roleGrants.put(
        'test-role-' + identityId + '-member', {
            organization_id: '1',
            identity_id: identityId,
            role: 'member',
            action: 'granted',
            by_member_id: 'system',
            at: '2020-01-01T00:00:00.000000Z',
        });
    await db.memberships.put(
        'test-membership-' + identityId, {
            organization_id: '1',
            identity_id: identityId,
            at: '2020-01-01T00:00:00.000000Z',
        });
}
