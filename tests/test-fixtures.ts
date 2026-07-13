import type { DbAdapter } from '../api/db.ts';
import type { IdeaEntity } from '../api/types.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
// organizationRow/seedOrganizationDocument now LIVE in
// root-admin-fixture.ts (Phase 13 Task 3's fixture prerequisite
// — seedRootAdmin itself needs to call the latter, and this
// module already imports FROM root-admin-fixture.ts, so keeping
// the definitions here would cycle). Re-exported so this file's
// existing importers (adapters-invitations.test.ts,
// adapters-shared-recovery.test.ts) see no path change.
export {
    organizationRow,
    seedOrganizationDocument,
} from './root-admin-fixture.ts';

// postSchemaCreation + seedRootAdmin — the setup nearly every adapter
// test repeats before driving the gate. Composes the existing
// seedRootAdmin fixture; the seed*Member fixtures stay separate.
export async function seedAdminSchema(
    db: DbAdapter,
): Promise<void> {
    await db.postSchemaCreation();
    await seedRootAdmin(db);
}

// A minimal idea body (minus id) for the org-scope fence
// tests: empty content, position 0, written raw below the
// gate. The validated-path and id-bearing idea builders differ
// in their defaults and stay local to their own suites.
export function ideaBody(
    organization: string,
    title: string,
): Omit<
    IdeaEntity,
    'id' | 'state' | 'state_at' | 'state_event_id'
> {
    return {
        organization_id: organization,
        title,
        position: 0,
        problem_statement: '',
        target_users: '',
        proposed_solution: '',
        expected_outcome: '',
        success_metrics: '',
    };
}
