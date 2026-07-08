import type { DbAdapter } from '../api/db.ts';
import type {
    IdeaEntity,
    OrganizationEntity,
} from '../api/types.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    formWritePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import { WRITE_RESPONSE_SPECS } from '../api/routes.ts';

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

// Below-facade pair formation for an organization document
// (the identity-fixtures.ts precedent, applied to organizations):
// every reader flipped onto deriveOrganization(s) (Phase 12
// Task 5) sees ONLY the message ledger, so a raw
// db.organizations.put leaves it derivation-invisible. Writes
// the SAME row + pair shape the live PUT organizations/:id
// route forms, without handleRequest's auth/notification
// overhead — organizations/:id's PUT stays hand-written (no
// exported documentOp to call directly), so this mirrors its
// transaction body instead. GLOBAL plane (organizationNested:
// false) — `organization` stays undefined throughout, the
// identity-fixtures.ts GLOBAL_PLANE_PLACEHOLDER precedent.
export async function seedOrganizationDocument(
    db: DbAdapter,
    id: string,
    name: string,
): Promise<void> {
    const body = organizationRow(name);
    const spec = WRITE_RESPONSE_SPECS['organizations/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for organizations/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: `/organizations/${id}`,
        routePattern: 'organizations/:id',
        routeSegments: ['organizations', ':id'],
        pathSegments: ['organizations', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, undefined,
        ),
        headPairId: undefined,
    });
    await db.transaction(
        ['organizations', 'requests', 'responses'],
        async (view) => {
            await view.organizations.put(id, body);
            await appendMessagePair(view, pair);
        },
    );
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
