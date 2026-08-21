import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';
import { formWritePair, appendMessagePair } from '../api/message-pair.ts';
import { SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// Below-facade pair formation (the seedDefaultOrganizationEvent
// precedent just above, applied to memberships): the primary-
// membership fallback this file's own tests exercise derives
// from the pair plane once memberships flips, so a raw row here
// would go derivation-invisible. PLUMBING ONLY: the assertions
// this helper feeds stay byte-identical.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    organizationId: string,
    identityId: string,
    at: string,
): Promise<void> {
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(
        db, organizationId, organizationId,
    );
    await seedSeat(
        db, organizationId, identityId, 'member', at,
    );
}

// A SET default-organization document at the live address.
async function seedDefaultOrganizationEvent(
    db: MemoryDbAdapter,
    identityId: string,
    organizationId: string,
    at: string,
) {
    const pathSegments = [
        'identities', identityId, 'default-organization',
    ];
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: 'identities/:id/default-organization',
        routeSegments: [
            'identities', ':id', 'default-organization',
        ],
        pathSegments,
        headerFields: [],
        body: { organization_id: organizationId },
        requesterIdentityId: identityId,
        requestAt: at,
        organization: undefined,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}

test(
    'identityDefaultOrganization returns the set default when present',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(db, 'm1', '1', 'me', T1);
        await seedMembershipPair(db, 'm2', '2', 'me', T2);
        await seedDefaultOrganizationEvent(db, 'me', '2', T2);
        assert.equal(await identityDefaultOrganization(db, 'me'), '2');
    },
);

test(
    'identityDefaultOrganization falls back to earliest membership',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(db, 'm1', '2', 'me', T2);
        await seedMembershipPair(db, 'm2', '3', 'me', T1);
        assert.equal(await identityDefaultOrganization(db, 'me'), '3');
    },
);

test(
    'identityDefaultOrganization tie-breaks equal-at by lowest org id',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(db, 'm1', '3', 'me', T1);
        await seedMembershipPair(db, 'm2', '2', 'me', T1);
        assert.equal(await identityDefaultOrganization(db, 'me'), '2');
    },
);

test(
    'identityDefaultOrganization is null with no default and no member',
    async () => {
        const db = await freshDb();
        assert.equal(await identityDefaultOrganization(db, 'me'), null);
    },
);

test(
    'identityDefaultOrganization skips a SET that is not a'
    + ' live seat',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(db, 'm1', '1', 'me', T1);
        await seedMembershipPair(db, 'm2', '2', 'me', T2);
        await seedDefaultOrganizationEvent(
            db, 'me', '2', T2,
        );
        const tombstone = await formWritePair({
            method: 'DELETE',
            pathname: '/organizations/2/members/me',
            routePattern:
                'organizations/:organization-id/members'
                + '/:identity-id',
            routeSegments: [
                'organizations', ':organization-id',
                'members', ':identity-id',
            ],
            pathSegments: [
                'organizations', '2', 'members', 'me',
            ],
            headerFields: [],
            body: {},
            requesterIdentityId: SYSTEM_MEMBER_ID,
            requestAt: T2,
            organization: '2',
            responseStatus: 204,
            responseBody: undefined,
            operationId: TEST_OPERATION_ID,
        });
        await db.transaction(
            MESSAGE_TABLES,
            async (view) => {
                await appendMessagePair(view, tombstone);
            },
        );
        assert.equal(
            await identityDefaultOrganization(db, 'me'),
            '1',
        );
    },
);
