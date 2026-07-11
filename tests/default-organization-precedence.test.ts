import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';
import { formWritePair, appendMessagePair } from '../api/message-pair.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';

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
        db, organizationId, organizationId);
    const body = {
        organization_id: organizationId,
        identity_id: identityId,
        at,
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
        requestAt: at,
        organization: organizationId,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organizationId,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

// Task 8 (Phase 11): identityDefaultOrganization now derives its
// row source from the /identities/:id/default-org/ message-pair
// ledger (api/derive-default-organization.ts), never the
// identity_default_organizations table directly — so a seed for
// this read must form the SAME pair the live PUT route would
// (api/organization-requests.ts), not a raw table put. PLUMBING
// ONLY: the assertions this helper feeds stay byte-identical.
async function seedDefaultOrganizationEvent(
    db: MemoryDbAdapter,
    eventId: string,
    identityId: string,
    organizationId: string,
    at: string,
) {
    const pathSegments = [
        'identities', identityId, 'default-org', eventId,
    ];
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: 'identities/:id/default-org',
        routeSegments: [
            'identities', ':id', 'default-org', ':eventId',
        ],
        pathSegments,
        headerFields: [],
        body: {
            organization_id: organizationId, eventId, at,
        },
        requesterIdentityId: identityId,
        requestAt: at,
        organization: undefined,
        responseStatus: 204,
        responseBody: undefined,
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
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
        await seedDefaultOrganizationEvent(db, 'd1', 'me', '2', T2);
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
