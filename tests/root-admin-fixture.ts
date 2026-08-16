import type { DbAdapter } from '../api/db.ts';
import {
    nowUtc, SYSTEM_MEMBER_ID, type Id,
    type OrganizationEntity,
} from '../api/types.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { ORGANIZATION_MEMBER_DETAIL_PATTERN } from
    '../api/family-registry.ts';
import {
    formWritePair,
    appendMessagePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { deriveOrganizations } from '../api/derive-organizations.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

// Below-facade pair formation for the membership write below:
// every row rides the SAME exported api/routes.ts op a live PUT
// would, with a pair formed from the SAME WRITE_RESPONSE_SPECS
// entry. Role grants retired — membership `type` is the
// privilege; tokens bake claim roles at mint.
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
// db.organizations.put, or a membership pair whose
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
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        // Phase Final Task 2: organizations ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}

export async function seatDocumentPair(
    organization: Id,
    identityId: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS[
        ORGANIZATION_MEMBER_DETAIL_PATTERN
    ];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for seat',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: '/organizations/' + organization
            + '/members/' + identityId,
        routePattern: ORGANIZATION_MEMBER_DETAIL_PATTERN,
        routeSegments:
            ORGANIZATION_MEMBER_DETAIL_PATTERN.split('/'),
        pathSegments: [
            'organizations', organization, 'members',
            identityId,
        ],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [organization, identityId], body,
            SYSTEM_MEMBER_ID, organization,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

export async function seedSeat(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
    type: 'admin' | 'member',
    at: string = '2020-01-01T00:00:00.000000Z',
): Promise<void> {
    const requestAt = nowUtc();
    const body = { type, at };
    await postMembershipDocumentOp(
        db, identityId, body, SYSTEM_MEMBER_ID,
        await seatDocumentPair(
            organization, identityId, body, requestAt,
        ),
    );
}

// Seed the demo `current` identity as a root admin directly at
// the storage layer (below the gate): seat with
// type:"admin" in org '1'. Tokens bake claim roles from that
// type at mint (tests/token-fixtures.ts).
export async function seedRootAdmin(
    db: DbAdapter,
): Promise<void> {
    await seedOrganizationDocument(
        db, ROOT_ADMIN_ORGANIZATION, 'Root Admin Org',
    );
    await seedSeat(
        db, ROOT_ADMIN_ORGANIZATION, 'current', 'admin',
    );
}

// Seed an identity as a plain content-tier member of org '1':
// seat with type:"member". The member-tier counterpart of
// seedRootAdmin above.
export async function seedOrganizationMember(
    db: DbAdapter,
    identityId: string,
): Promise<void> {
    await seedOrganizationDocument(
        db, ROOT_ADMIN_ORGANIZATION, 'Root Admin Org',
    );
    await seedSeat(
        db, ROOT_ADMIN_ORGANIZATION, identityId, 'member',
    );
}
