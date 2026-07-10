import type { DbAdapter } from '../api/db.ts';
import {
    nowUtc, SYSTEM_MEMBER_ID, type Id,
    type OrganizationEntity,
} from '../api/types.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { deriveOrganizations } from '../api/derive-organizations.ts';

// Below-facade pair formation for the two seeded writes below
// (Phase 13 Task 1's blocking prerequisite): every row rides the
// SAME exported api/routes.ts op a live PUT would, with a pair
// formed from the SAME WRITE_RESPONSE_SPECS entry — the
// tests/member-fixtures.ts idiom (membershipDocumentPair),
// mirrored here rather than imported (that helper stays private
// to its own file; this fixture's id shapes differ). Every id and
// field value stays IDENTICAL to the raw puts these replace —
// only the write MECHANISM changes, so a role_grants/memberships
// read that flips onto the pair plane still finds the root admin.
const ROOT_ADMIN_ORGANIZATION: Id = '1';

// A complete organization row (minus id) for tests needing a
// tenant root. `name` varies; the rest are fixed demo values.
// Relocated from tests/test-fixtures.ts (Phase 13 Task 3's
// fixture prerequisite) so seedRootAdmin below can call
// seedOrganizationDocument without a test-fixtures.ts <->
// root-admin-fixture.ts import cycle (test-fixtures.ts already
// imports seedRootAdmin from here); test-fixtures.ts re-exports
// both names so its existing importers see no path change.
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

// Below-facade pair formation for an organization document (the
// identity-fixtures.ts precedent, applied to organizations):
// every reader of deriveOrganization(s) — and
// deriveMembershipsForIdentity (which enumerates via
// deriveOrganizations before probing each org's own membership
// prefix) — sees ONLY the message ledger, so a raw
// db.organizations.put, or a membership/role-grant pair whose
// organization was never itself given a document, leaves the
// identity's membership derivation-invisible. Phase Final Task
// 2: organizations ROW half stripped — pure pair-plane write,
// mirroring the live PUT organizations/:id route body. GLOBAL
// plane (organizationNested: false) — `organization` stays
// undefined throughout. IDEMPOTENT on the PAIR PLANE
// (deriveOrganizations): seedRootAdmin/seedOrganizationMember
// still avoid a duplicate pair when both run against the same
// db.
export async function seedOrganizationDocument(
    db: DbAdapter,
    id: Id,
    name: string,
): Promise<void> {
    const live = await deriveOrganizations(db);
    if (live.some((organization) => organization.id === id)) {
        return;
    }
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
        // Phase Final Task 2: organizations ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}

async function membershipDocumentPair(
    membershipId: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/memberships/${membershipId}`,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', membershipId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: ROOT_ADMIN_ORGANIZATION,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [membershipId], body, SYSTEM_MEMBER_ID,
            ROOT_ADMIN_ORGANIZATION,
        ),
        headPairId: undefined,
    });
}

// The role-grants twin of membershipDocumentPair above — does
// not exist anywhere yet (Phase 13 Task 1's own NEW helper). The
// role-grants/:id response spec's successBody re-derives
// organization_id from the gate-16 fence stamp (its own comment,
// api/routes.ts), so this fixture must supply the SAME
// organization ('1', never undefined) both to formWritePair's own
// `organization` field and as the successBody argument, exactly
// as a live PUT role-grants/:id would through the gate.
async function roleGrantDocumentPair(
    roleGrantId: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/role-grants/${roleGrantId}`,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', roleGrantId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: ROOT_ADMIN_ORGANIZATION,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [roleGrantId], body, SYSTEM_MEMBER_ID,
            ROOT_ADMIN_ORGANIZATION,
        ),
        headPairId: undefined,
    });
}

// Seed the demo `current` identity as a root admin directly at
// the storage layer (below the gate): the admin role grant AND
// the org membership the gate now resolves the request's org
// from. Both are needed — an admin of an org is a member of it —
// so a test driving the gate as `current` (devToken) resolves
// to an org and passes deny-by-default. Mirrors how the
// bootstrap/mock-data seeds plant the root admin. Both rows now
// form their message pair via the SAME exported ops the live PUT
// routes use, so a role_grants/memberships read that derives from
// the pair plane (this phase's blocking prerequisite) still finds
// the root admin — every id/field value stays IDENTICAL to the
// raw puts this replaces.
export async function seedRootAdmin(
    db: DbAdapter,
): Promise<void> {
    await seedOrganizationDocument(
        db, ROOT_ADMIN_ORGANIZATION, 'Root Admin Org',
    );
    const requestAt = nowUtc();
    const roleGrantId = 'test-role-current-admin';
    const roleGrantBody = {
        organization_id: '1',
        identity_id: 'current',
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postRoleGrantDocumentOp(
        db, roleGrantId, roleGrantBody, SYSTEM_MEMBER_ID,
        await roleGrantDocumentPair(
            roleGrantId, roleGrantBody, requestAt,
        ),
    );
    const membershipId = 'test-membership-current';
    const membershipBody = {
        organization_id: '1',
        identity_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postMembershipDocumentOp(
        db, membershipId, membershipBody, SYSTEM_MEMBER_ID,
        await membershipDocumentPair(
            membershipId, membershipBody, requestAt,
        ),
    );
}

// Seed an identity as a plain content-tier member of org '1':
// the member role grant AND the membership the gate resolves
// the org and liveness from. The member-tier counterpart of
// seedRootAdmin above — the SAME pair-forming mechanism, every
// id/field value IDENTICAL to the raw puts this replaces.
export async function seedOrganizationMember(
    db: DbAdapter,
    identityId: string,
): Promise<void> {
    await seedOrganizationDocument(
        db, ROOT_ADMIN_ORGANIZATION, 'Root Admin Org',
    );
    const requestAt = nowUtc();
    const roleGrantId = 'test-role-' + identityId + '-member';
    const roleGrantBody = {
        organization_id: '1',
        identity_id: identityId,
        role: 'member',
        action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postRoleGrantDocumentOp(
        db, roleGrantId, roleGrantBody, SYSTEM_MEMBER_ID,
        await roleGrantDocumentPair(
            roleGrantId, roleGrantBody, requestAt,
        ),
    );
    const membershipId = 'test-membership-' + identityId;
    const membershipBody = {
        organization_id: '1',
        identity_id: identityId,
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postMembershipDocumentOp(
        db, membershipId, membershipBody, SYSTEM_MEMBER_ID,
        await membershipDocumentPair(
            membershipId, membershipBody, requestAt,
        ),
    );
}
