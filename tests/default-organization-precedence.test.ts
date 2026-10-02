import {
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';
import { membershipOf } from '../api/memberships.ts';
import {
    runWrite,
    attemptFor,
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { SYSTEM_MEMBER_ID } from '../shared/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { landMembership } from
    './membership-fixtures.ts';
import { deriveOrganizationMemberSeat } from
    '../api/derive-memberships.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';
const IDENTITY_ID = generateIdentifier();
const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const ORGANIZATION_TWO = 'BBjWJsjYIDkTRKIIPrzWRw';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// seedSeat mirrors an accepted membership, which is
// what this file reads. seedSeat's mirror still wants
// the organization document.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    organizationId: string,
    identityId: string,
    at: string,
): Promise<void> {
    await seedOrganizationDocument(
        db, organizationId, organizationId,
    );
    await seedSeat(
        db, organizationId, identityId, 'member', at,
    );
}

// A SET default-organization document at the live document.
async function seedDefaultOrganizationEvent(
    db: MemoryDbAdapter,
    identityId: string,
    organizationId: string,
    at: string,
) {
    const pathSegments = [
        'identities', identityId, 'default-organization',
    ];
    const messagePair = await formWriteMessagePair({
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
        responseBody: {
            id: identityId,
            organization_id: organizationId,
        },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    );
}

Deno.test(
    'identityDefaultOrganization returns the set default when present',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(
            db, generateIdentifier(),
            STARK_ORGANIZATION, IDENTITY_ID, T1,
        );
        await seedMembershipPair(
            db, generateIdentifier(),
            ORGANIZATION_TWO, IDENTITY_ID, T2,
        );
        await seedDefaultOrganizationEvent(
            db, IDENTITY_ID, ORGANIZATION_TWO, T2,
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            ORGANIZATION_TWO,
        );
    },
);

Deno.test(
    'identityDefaultOrganization falls back to earliest membership',
    async () => {
        const db = await freshDb();
        const earliestOrganization = generateIdentifier();
        await seedMembershipPair(
            db, generateIdentifier(),
            ORGANIZATION_TWO, IDENTITY_ID, T2,
        );
        await seedMembershipPair(
            db, generateIdentifier(),
            earliestOrganization, IDENTITY_ID, T1,
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            earliestOrganization,
        );
    },
);

Deno.test(
    'identityDefaultOrganization tie-breaks equal-at by lowest org id',
    async () => {
        const db = await freshDb();
        // Identifier order is not code-point order: 'B'
        // precedes '0', so a string sort inverts these.
        const earlier = 'BAAAAAAAAAAAAAAAAAAAAA';
        const later = '0AAAAAAAAAAAAAAAAAAAAA';
        assertStrictEquals(
            compareIdentifiers(earlier, later) < 0, true,
        );
        assertStrictEquals(earlier < later, false);
        await seedMembershipPair(
            db, generateIdentifier(),
            later, IDENTITY_ID, T1,
        );
        await seedMembershipPair(
            db, generateIdentifier(),
            earlier, IDENTITY_ID, T1,
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            earlier,
        );
    },
);

Deno.test(
    'identityDefaultOrganization is null with no default and no member',
    async () => {
        const db = await freshDb();
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            null,
        );
    },
);

Deno.test(
    'a seat removed below the mirror leaves the'
    + ' accepted membership, so the SET holds',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(
            db, generateIdentifier(),
            STARK_ORGANIZATION, IDENTITY_ID, T1,
        );
        await seedMembershipPair(
            db, generateIdentifier(),
            ORGANIZATION_TWO, IDENTITY_ID, T2,
        );
        await seedDefaultOrganizationEvent(
            db, IDENTITY_ID, ORGANIZATION_TWO, T2,
        );
        const tombstone = await formWriteMessagePair({
            method: 'DELETE',
            pathname: '/organizations/'
                + ORGANIZATION_TWO
                + '/members/' + IDENTITY_ID,
            routePattern:
                'organizations/:organization-id/members'
                + '/:identity-id',
            routeSegments: [
                'organizations', ':organization-id',
                'members', ':identity-id',
            ],
            pathSegments: [
                'organizations', ORGANIZATION_TWO,
                'members', IDENTITY_ID,
            ],
            headerFields: [],
            body: {},
            requesterIdentityId: SYSTEM_MEMBER_ID,
            requestAt: T2,
            organization: ORGANIZATION_TWO,
            responseBody: undefined,
            operationId: generateIdentifier(),
            requestId: generateIdentifier(),
        });
        const answer = await runWrite(
            db,
            attemptFor([tombstone]),
            [tombstone],
        );
        assertStrictEquals(answer.outcome, 'land');
        await assertRejects(
            () => deriveOrganizationMemberSeat(
                db, ORGANIZATION_TWO, IDENTITY_ID,
            ),
            EntityNotFoundError,
        );
        assertNotStrictEquals(
            await membershipOf(
                db, ORGANIZATION_TWO, IDENTITY_ID,
            ),
            null,
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            ORGANIZATION_TWO,
        );
    },
);

Deno.test(
    'identityDefaultOrganization falls to the primary'
    + ' when the SET membership is removed',
    async () => {
        const db = await freshDb();
        await seedMembershipPair(
            db, generateIdentifier(),
            STARK_ORGANIZATION, IDENTITY_ID, T1,
        );
        await seedMembershipPair(
            db, generateIdentifier(),
            ORGANIZATION_TWO, IDENTITY_ID, T2,
        );
        await seedDefaultOrganizationEvent(
            db, IDENTITY_ID, ORGANIZATION_TWO, T2,
        );
        await landMembership(
            db, ORGANIZATION_TWO, IDENTITY_ID, 'removed',
            'member', '2026-03-01T00:00:00.000000Z',
        );
        const seat = await deriveOrganizationMemberSeat(
            db, ORGANIZATION_TWO, IDENTITY_ID,
        );
        assertStrictEquals(seat.type, 'member');
        assertStrictEquals(
            seat.organization_id, ORGANIZATION_TWO,
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            STARK_ORGANIZATION,
        );
    },
);

Deno.test(
    'identityDefaultOrganization takes a membership'
    + ' with no seat as the primary',
    async () => {
        const db = await freshDb();
        const organization = generateIdentifier();
        await landMembership(
            db, organization, IDENTITY_ID, 'accepted',
            'member', T1,
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            organization,
        );
    },
);

Deno.test(
    'pending, declined, revoked, and a removed head'
    + ' hold nothing as the default',
    async () => {
        const db = await freshDb();
        const organization = 'IAAAAAAAAAAAAAAAAAAAAA';
        await seedDefaultOrganizationEvent(
            db, IDENTITY_ID, organization,
            '2026-04-01T00:00:00.000000Z',
        );
        const nonAccepted = [
            ['pending', '2026-04-02T00:00:00.000000Z'],
            ['declined', '2026-04-03T00:00:00.000000Z'],
            ['revoked', '2026-04-04T00:00:00.000000Z'],
        ] as const;
        for (const [state, at] of nonAccepted) {
            await landMembership(
                db, organization, IDENTITY_ID, state,
                'member', at,
            );
            assertStrictEquals(
                await identityDefaultOrganization(
                    db, IDENTITY_ID,
                ),
                null,
                state,
            );
        }
        await landMembership(
            db, organization, IDENTITY_ID, 'accepted',
            'member', '2026-04-05T00:00:00.000000Z',
        );
        await landMembership(
            db, organization, IDENTITY_ID, 'removed',
            'member', '2026-04-06T00:00:00.000000Z',
        );
        assertStrictEquals(
            await identityDefaultOrganization(
                db, IDENTITY_ID,
            ),
            null,
        );
    },
);
