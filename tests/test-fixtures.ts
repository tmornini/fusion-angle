import type { DbAdapter } from '../api/db.ts';
import type {
    IdeaEntity,
    OrganizationEntity,
} from '../api/types.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

// postSchemaCreation + seedRootAdmin — the setup nearly every adapter
// test repeats before driving the gate. Composes the existing
// seedRootAdmin fixture; the seed*Member fixtures stay separate.
export async function seedAdminSchema(
    db: DbAdapter,
): Promise<void> {
    await db.postSchemaCreation();
    await seedRootAdmin(db);
}

// A complete organization row (minus id) for tests needing a
// tenant root. `name` varies; the rest are fixed demo values.
export function organizationRow(
    name: string,
): Omit<OrganizationEntity, 'id'> {
    return {
        name,
        domain: 'x.com',
        next_billing: '2026-01-01T00:00:00.000000Z',
        seats: 10,
        projects_limit: 10,
        ideas_limit: 10,
    };
}

// A minimal idea body (minus id) for the org-scope fence
// tests: empty content, position 0, written raw below the
// gate. The validated-path and id-bearing idea builders differ
// in their defaults and stay local to their own suites.
export function ideaBody(
    organization: string,
    title: string,
): Omit<IdeaEntity, 'id'> {
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
