import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { organizationRow } from './test-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getOrganization,
    getOrganizations,
    putOrganization,
} from '../web-app/app/adapters/organizations.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

test('putOrganization then getOrganization round-trips',
async () => {
    const { ctx } = await adminContext();
    await putOrganization(ctx, '1', organizationRow('Acme'));
    const organization = await getOrganization(ctx, '1');
    assert.equal(organization.name, 'Acme');
    assert.equal(organization.id, '1');
});

// Below-facade pair formation (the member-fixtures.ts idiom):
// getOrganizations' own membership filter derives from the pair
// plane once memberships flips, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw put this replaces — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    organization: string,
    identityId: string,
    at: string,
): Promise<void> {
    await seedSeat(
        db,
        organization,
        identityId,
        identityId === 'current' ? 'admin' : 'member',
        at,
    );
}

test('getOrganizations returns only the caller member orgs',
async () => {
    const { db, ctx } = await adminContext();
    await putOrganization(ctx, '1', organizationRow('Acme'));
    await putOrganization(ctx, '7', organizationRow('Beta'));
    await seedMembershipPair(
        db, 'm', '1', 'current',
        '2026-06-04T00:00:00.000000Z',
    );
    const organizations = await getOrganizations(ctx);
    assert.deepEqual(organizations.map(o => o.id), ['1']);
});
