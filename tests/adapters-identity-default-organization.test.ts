import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    putIdentityDefaultOrganization,
    getIdentityDefaultOrganization,
} from '../web-app/app/adapters/identity-default-organization.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';

const AT = '2026-06-04T00:00:00.000000Z';

// Below-facade pair formation (the member-fixtures.ts idiom,
// tests/api-organization-isolation.test.ts's own
// seedMembershipPair precedent): identityDefaultOrganization's
// primary-membership fallback derives from the memberships pair
// plane once role_grants/memberships flip, so a raw row here
// would go derivation-invisible. Every id/field value stays
// IDENTICAL to the raw put this replaces — only the write
// mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    organization: string,
    identityId: string,
): Promise<void> {
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(db, organization, organization);
    const body = {
        organization_id: organization,
        identity_id: identityId,
        type: 'member',
        at: AT,
    };
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function memberOf(organizations: string[]) {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    for (const [i, organization] of organizations.entries()) {
        await seedMembershipPair(
            db, 'm-' + i, organization, 'current',
        );
    }
    return db;
}

test('putIdentityDefaultOrganization sets the caller default org',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    await putIdentityDefaultOrganization(ctx, '1');
    assert.equal(await getIdentityDefaultOrganization(ctx), '1');
});

test('getIdentityDefaultOrganization resolves the primary membership',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    assert.equal(await getIdentityDefaultOrganization(ctx), '1');
});

test('putIdentityDefaultOrganization rejects a non-member org',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    await assert.rejects(
        () => putIdentityDefaultOrganization(ctx, '2'));
});
