import type { DbAdapter } from '../api/db.ts';
import { DEFAULT_ORG } from '../api/types.ts';

// Grant the demo `current` identity the `admin` role directly
// at the storage layer (below the gate), so a test that
// drives the HTTP gate as `current` (devToken) is authorized
// under deny-by-default. Writing the ledger row directly
// mirrors how the bootstrap/mock-data seeds plant the root
// admin before any auth exists.
export async function seedRootAdmin(
    db: DbAdapter,
): Promise<void> {
    await db.roleGrants.put('test-role-current-admin', {
        organization_id: DEFAULT_ORG,
        identity_id: 'current',
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000Z',
    });
}
