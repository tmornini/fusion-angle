import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';
import { formWritePair, appendMessagePair } from '../api/message-pair.ts';

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    return db;
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
        await db.memberships.put('m1', {
            organization_id: '1', identity_id: 'me', at: T1,
        });
        await db.memberships.put('m2', {
            organization_id: '2', identity_id: 'me', at: T2,
        });
        await seedDefaultOrganizationEvent(db, 'd1', 'me', '2', T2);
        assert.equal(await identityDefaultOrganization(db, 'me'), '2');
    },
);

test(
    'identityDefaultOrganization falls back to earliest membership',
    async () => {
        const db = await freshDb();
        await db.memberships.put('m1', {
            organization_id: '2', identity_id: 'me', at: T2,
        });
        await db.memberships.put('m2', {
            organization_id: '3', identity_id: 'me', at: T1,
        });
        assert.equal(await identityDefaultOrganization(db, 'me'), '3');
    },
);

test(
    'identityDefaultOrganization tie-breaks equal-at by lowest org id',
    async () => {
        const db = await freshDb();
        await db.memberships.put('m1', {
            organization_id: '3', identity_id: 'me', at: T1,
        });
        await db.memberships.put('m2', {
            organization_id: '2', identity_id: 'me', at: T1,
        });
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
