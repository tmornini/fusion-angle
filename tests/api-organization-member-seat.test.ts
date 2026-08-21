import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
import { membershipExistsFor } from
    '../api/derive-memberships.ts';
import { writeAuthorizerFor } from
    '../api/write-authorizer.ts';
import { ORGANIZATION_TWO } from
    '../api/mock-data/seed-constants.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from
    '../api/types.ts';
import { organizationToken, devToken } from
    './token-fixtures.ts';
import {
    seedAdminSchema, seedOrganizationDocument,
} from './test-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Task 52: the seat document is the membership
// relationship. Accept writes the inner PUT;
// mint bakes {type}:{organization_id} from seats;
// write authorizer 403s a foreign path org.

const AT = '2026-01-01T00:00:00.000000Z';
const SARAH_ID = 'LhfaUUf4IumVsCSGB4xjdK';
const SEAT_DETAIL =
    'organizations/:organization-id/members/'
    + ':identity-id';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

function seatsPrefix(organization: string): string {
    return '/organizations/' + organization
        + '/members/';
}

test('accept writes the seat at the invitation'
+ ' organization, copying Operation-ID', async () => {
    const db = await seededMockDb();
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO);
    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'inv-seat-accept',
            grantEventId: 'inv-seat-accept-grant',
            grantAt: '2026-06-05T00:00:00.000000Z',
        },
    ));
    assert.equal(grant.status, 200);

    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + SARAH_ID
            + '/invitations/inv-seat-accept',
        await organizationToken(
            SARAH_ID, ORGANIZATION_TWO),
        {
            state: 'accepted',
            membershipId: 'inv-seat-accept-ms',
            eventId: 'inv-seat-accept-event',
            at: '2026-06-05T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 204);

    const prefix = seatsPrefix(ORGANIZATION_TWO);
    const [requests, responses] = await Promise.all([
        db.pairs.getAllWhere(
            'uri_collection', prefix),
        db.pairs.getAllWhere(
            'uri_collection', prefix),
    ]);
    const seats = documentPairsAt(
        requests, prefix,
    ).filter((pair) => pair.uriId === SARAH_ID
        && pair.method === 'PUT');
    assert.equal(seats.length, 1);
    assert.deepEqual(seats[0]!.body, {
        type: 'member',
        at: '2026-06-05T00:00:01.000000Z',
    });
    const written = requests.find(
        (row) => row.uri_id === SARAH_ID,
    );
    assert.ok(written);
    assert.equal(
        written.operation_id, TEST_OPERATION_ID,
    );
    assert.equal(
        await membershipExistsFor(
            db, ORGANIZATION_TWO, SARAH_ID),
        true,
    );
});

test('mint bakes claim roles from a seat, not a'
+ ' memberships/:id row', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, '1', 'Stark');
    const body = { type: 'admin', at: AT };
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/organizations/1/members/current',
        routePattern: SEAT_DETAIL,
        routeSegments: SEAT_DETAIL.split('/'),
        pathSegments: [
            'organizations', '1', 'members',
            'current',
        ],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: '1',
        responseStatus: 200,
        responseBody: {
            id: 'current',
            organization_id: '1',
            identity_id: 'current',
            ...body,
        },
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, 'current', body, SYSTEM_MEMBER_ID, pair,
    );

    const tokenRequest = new Request(
        'http://localhost/authentication/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'token-exchange',
                subject_token: await devToken(
                    'current'),
                actor_token: await devToken(
                    'current'),
                organization: '1',
            }),
        },
    );
    const minted = await handleRequest(
        db, tokenRequest);
    assert.equal(minted.status, 201);
    const payload = await minted.json() as {
        access_token: string;
    };
    const claims = decodeAccessToken(
        payload.access_token);
    assert.deepEqual(claims.roles, ['admin:1']);
    assert.deepEqual(claims.organizations, ['1']);
});

test('write authorizer 403s a foreign seat path',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, '1', 'Alpha');
    await seedOrganizationDocument(db, 'B', 'Beta');
    const memBody = {
        organization_id: 'B',
        identity_id: 'current',
        type: 'admin',
        at: AT,
    };
    await seedSeat(
        db,
        String(memBody['organization_id'] ?? memBody.organization_id),
        String(memBody['identity_id'] ?? memBody.identity_id),
        (memBody['type'] ?? memBody.type) as 'admin' | 'member',
        String(memBody['at'] ?? memBody.at),
    );
    const tokenB = await organizationToken(
        'current', 'B');
    const foreign = await handleRequest(db, req(
        'PUT',
        '/organizations/1/members/someone',
        tokenB, { type: 'member', at: AT },
    ));
    assert.equal(foreign.status, 403);
    const wire = await foreign.json() as {
        error: string;
    };
    assert.equal(
        wire.error,
        'forbidden: path organization does not'
            + ' match the token organization',
    );
    const authorizer = writeAuthorizerFor(
        SEAT_DETAIL, 'PUT');
    assert.ok(authorizer);
    assert.equal(authorizer.idParamIndex, 1);
});

async function mintedOrganizations(
    db: MemoryDbAdapter,
    identity: string,
): Promise<readonly string[] | undefined> {
    const minted = await handleRequest(
        db, new Request(
            'http://localhost/authentication/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    grant_type: 'token-exchange',
                    subject_token: await devToken(
                        identity),
                    actor_token: await devToken(
                        identity),
                }),
            },
        ),
    );
    assert.equal(minted.status, 201);
    const payload = await minted.json() as {
        access_token: string;
    };
    return decodeAccessToken(
        payload.access_token,
    ).organizations;
}

test('live admin PUT of a seat 201s and GETs back;'
+ ' DELETE then mint omits that organization',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const admin = await organizationToken(
        'current', '1');
    const identity = 'seat-put';
    const path = '/organizations/1/members/'
        + identity;
    const body = { type: 'member', at: AT };
    const created = await handleRequest(db, req(
        'PUT', path, admin, body,
    ));
    assert.equal(created.status, 201);
    const got = await handleRequest(db, req(
        'GET', path, admin,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), {
        id: identity,
        organization_id: '1',
        identity_id: identity,
        ...body,
    });
    assert.deepEqual(
        await mintedOrganizations(db, identity),
        ['1'],
    );
    const removed = await handleRequest(db, req(
        'DELETE', path, admin,
    ));
    assert.equal(removed.status, 204);
    assert.equal(
        await mintedOrganizations(db, identity),
        undefined,
    );
});
