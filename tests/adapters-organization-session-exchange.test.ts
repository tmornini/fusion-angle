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
import { principalFromToken } from '../api/access-token.ts';
import {
    postOrganizationSessionExchange,
    shouldShowOrganizationSwitcher,
    resolveActiveOrganization,
} from '../web-app/app/adapters/organization-session.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

const AT = '2026-06-04T00:00:00.000000Z';

// Below-facade pair formation (the member-fixtures.ts idiom):
// postOrganizationSessionExchange's membership-fence check derives
// from the message plane once memberships flips, so a raw row here
// would go derivation-invisible. Every id/field value stays
// IDENTICAL to the raw put this replaces — only the write
// mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
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

test('exchanges a member token for an org-scoped token',
async () => {
    const db = await memberOf(['A']);
    const token = await devToken('XXZruirZyAOoRpNxaDnpSA');
    const ctx = createRequestContext(db, token);
    const scoped = await postOrganizationSessionExchange(
        ctx, token, 'A');
    const principal = principalFromToken(scoped);
    assert.equal(principal.organization, 'A');
    assert.equal(principal.id, 'XXZruirZyAOoRpNxaDnpSA');
});

test('a non-member org exchange is rejected', async () => {
    const db = await memberOf(['A']);
    const token = await devToken('XXZruirZyAOoRpNxaDnpSA');
    const ctx = createRequestContext(db, token);
    await assert.rejects(
        () => postOrganizationSessionExchange(ctx, token, 'B'));
});

test('shouldShowOrganizationSwitcher only at two or more orgs', () => {
    assert.equal(shouldShowOrganizationSwitcher([]), false);
    assert.equal(
        shouldShowOrganizationSwitcher([{ id: 'A' }]), false);
    assert.equal(
        shouldShowOrganizationSwitcher([{ id: 'A' }, { id: 'B' }]),
        true);
});

test('resolveActiveOrganization prefers a reachable persisted choice',
() => {
    assert.equal(
        resolveActiveOrganization(['AjdvjuECVZEgZoFajaIEkg'
            , 'BBjWJsjYIDkTRKIIPrzWRw'], 'BBjWJsjYIDkTRKIIPrzWRw', null)
            , 'BBjWJsjYIDkTRKIIPrzWRw');
});

test('resolveActiveOrganization prefers a reachable identity default',
() => {
    assert.equal(
        resolveActiveOrganization(['AjdvjuECVZEgZoFajaIEkg'
            , 'BBjWJsjYIDkTRKIIPrzWRw'], null, 'BBjWJsjYIDkTRKIIPrzWRw')
            , 'BBjWJsjYIDkTRKIIPrzWRw');
});

test('resolveActiveOrganization falls back to the first reachable',
() => {
    assert.equal(
        resolveActiveOrganization(['AjdvjuECVZEgZoFajaIEkg'
            , 'BBjWJsjYIDkTRKIIPrzWRw'], null, null)
            , 'AjdvjuECVZEgZoFajaIEkg');
    assert.equal(
        resolveActiveOrganization(['AjdvjuECVZEgZoFajaIEkg'
            , 'BBjWJsjYIDkTRKIIPrzWRw'], 'stale', '9')
            , 'AjdvjuECVZEgZoFajaIEkg');
});

test('resolveActiveOrganization returns a single membership directly',
() => {
    assert.equal(resolveActiveOrganization(['BBjWJsjYIDkTRKIIPrzWRw'], null
        , null), 'BBjWJsjYIDkTRKIIPrzWRw');
    assert.equal(resolveActiveOrganization(['BBjWJsjYIDkTRKIIPrzWRw']
        , 'AjdvjuECVZEgZoFajaIEkg', null), 'BBjWJsjYIDkTRKIIPrzWRw');
});
