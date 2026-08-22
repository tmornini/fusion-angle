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
import { formWriteMessagePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

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
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

async function memberOf(organizations: string[]) {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    for (const [i, organization] of organizations.entries()) {
        await seedMembershipPair(
            db, 'm-' + i, organization, 'XXZruirZyAOoRpNxaDnpSA',
        );
    }
    return db;
}

test('putIdentityDefaultOrganization sets the caller default org',
async () => {
    const db = await memberOf(['AjdvjuECVZEgZoFajaIEkg']);
    const ctx = createRequestContext(db, await devToken());
    await putIdentityDefaultOrganization(ctx, 'AjdvjuECVZEgZoFajaIEkg');
    assert.equal(await getIdentityDefaultOrganization(ctx)
        , 'AjdvjuECVZEgZoFajaIEkg');
});

test('getIdentityDefaultOrganization is null when never SET',
async () => {
    const db = await memberOf(['AjdvjuECVZEgZoFajaIEkg']);
    const ctx = createRequestContext(db, await devToken());
    assert.equal(await getIdentityDefaultOrganization(ctx), null);
});

test('putIdentityDefaultOrganization rejects a non-member org',
async () => {
    const db = await memberOf(['AjdvjuECVZEgZoFajaIEkg']);
    const ctx = createRequestContext(db, await devToken());
    await assert.rejects(
        () => putIdentityDefaultOrganization(ctx, 'BBjWJsjYIDkTRKIIPrzWRw'));
});
