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
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';

const AT = '2026-06-04T00:00:00.000000Z';

// Below-facade pair formation (the member-fixtures.ts idiom):
// postOrganizationSessionExchange's membership-fence check derives
// from the pair plane once memberships flips, so a raw row here
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

test('exchanges a member token for an org-scoped token',
async () => {
    const db = await memberOf(['A']);
    const token = await devToken('current');
    const ctx = createRequestContext(db, token);
    const scoped = await postOrganizationSessionExchange(
        ctx, token, 'A');
    const principal = principalFromToken(scoped);
    assert.equal(principal.organization, 'A');
    assert.equal(principal.id, 'current');
});

test('a non-member org exchange is rejected', async () => {
    const db = await memberOf(['A']);
    const token = await devToken('current');
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
        resolveActiveOrganization(['1', '2'], '2', null), '2');
});

test('resolveActiveOrganization prefers a reachable identity default',
() => {
    assert.equal(
        resolveActiveOrganization(['1', '2'], null, '2'), '2');
});

test('resolveActiveOrganization falls back to the first reachable',
() => {
    assert.equal(
        resolveActiveOrganization(['1', '2'], null, null), '1');
    assert.equal(
        resolveActiveOrganization(['1', '2'], 'stale', '9'), '1');
});

test('resolveActiveOrganization returns a single membership directly',
() => {
    assert.equal(resolveActiveOrganization(['2'], null, null), '2');
    assert.equal(resolveActiveOrganization(['2'], '1', null), '2');
});
