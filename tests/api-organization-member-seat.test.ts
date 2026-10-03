import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import { bodyOf } from '../api/derive-documents.ts';
import { membershipOf } from '../api/memberships.ts';
import { ORGANIZATION_TWO } from
    '../api/mock-data/seed-constants.ts';
import { organizationToken, devToken } from
    './token-fixtures.ts';
import {
    seedAdminSchema, seedOrganizationDocument,
} from './test-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    framedRequest,
    presentedFields,
    invitationLatched,
} from './http-fixtures.ts';
import { landMembership } from
    './membership-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Accept lands an accepted membership and no seat.
// Mint bakes {type}:{organization_id} from that
// membership. The last accepted admin cannot be
// removed.

const AT = '2026-01-01T00:00:00.000000Z';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const TONY = 'XXZruirZyAOoRpNxaDnpSA';
const SARAH_ID = 'MQFcPtrZPIGjMCRAXtZUnA';
const LAST_ADMIN =
    'the last accepted admin cannot be removed'
    + ' or demoted';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

function seatsPrefix(organization: string): string {
    return '/organizations/' + organization
        + '/members/';
}

function membershipPath(
    organization: string,
    identity: string,
): string {
    return '/organizations/' + organization
        + '/invitations/'
        + membershipNameOf(organization, identity);
}

Deno.test('accept writes the seat at the invitation'
+ ' organization, copying Operation-ID', async () => {
    const db = await seededMockDb();
    const admin = await organizationToken(
        TONY, ORGANIZATION_TWO);
    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            grantAt: '2026-06-05T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 201);

    const operationId = generateIdentifier();
    const name = membershipNameOf(
        ORGANIZATION_TWO, SARAH_ID,
    );
    const accept = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + SARAH_ID + '/invitations/'
            + name,
        await organizationToken(
            SARAH_ID, ORGANIZATION_TWO),
        {
            state: 'accepted',
            at: '2026-06-05T00:00:01.000000Z',
        },
        operationId,
    )));
    assertStrictEquals(accept.status, 200);

    const head = await db.messagePairs.getHeadPair(
        '/invitations/', name,
    );
    assertStrictEquals(head !== null, true);
    assertEquals(bodyOf(head!.response), {
        id: name,
        organization_id: ORGANIZATION_TWO,
        identity_id: SARAH_ID,
        type: 'member',
        state: 'accepted',
        at: '2026-06-05T00:00:01.000000Z',
    });
    assertStrictEquals(head!.operation_id, operationId);
    const seats = await db.messagePairs.getCollectionPairs(
        seatsPrefix(ORGANIZATION_TWO),
    );
    assertStrictEquals(seats.length, 0);
    assertStrictEquals(
        (await membershipOf(
            db, ORGANIZATION_TWO, SARAH_ID,
        )) !== null,
        true,
    );
});

Deno.test('mint bakes claim roles from a seat, not a'
+ ' memberships/:id row', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, STARK, 'Stark');
    await seedSeat(db, STARK, TONY, 'admin', AT);

    const bearer = await devToken(TONY);
    const tokenRequest = framedRequest(
        'http://localhost/authentication/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: 'Bearer ' + bearer,
            },
            body: JSON.stringify({
                grant_type: 'token-exchange',
                organization: STARK,
            }),
        },
    );
    const minted = await handleRequest(
        db, tokenRequest);
    assertStrictEquals(minted.status, 200);
    const payload = await presentedFields(minted) as {
        access_token: string;
    };
    const claims = decodeAccessToken(
        payload.access_token);
    assertEquals(
        claims.roles,
        ['admin:' + STARK],
    );
    assertEquals(claims.organizations, [STARK]);
});

// Decision 7: the last accepted admin cannot be
// removed. The actor is authorized; the organization's
// state forbids — 409, the domain conflict, never the
// wrong-actor 403.
Deno.test('the last admin seat refuses removal', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const admin = await organizationToken(TONY, STARK);
    const path = membershipPath(STARK, TONY);
    const refused = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT', path, admin,
            {
                state: 'removed',
                at: '2026-06-01T00:00:00.000000Z',
            },
        )),
    );
    assertStrictEquals(refused.status, 409);
    assertEquals(await refused.json(), {
        error: LAST_ADMIN,
    });
    const still = await handleRequest(db, req(
        'GET', path, admin,
    ));
    assertStrictEquals(still.status, 200);
    const body = await still.json() as { state: string };
    assertStrictEquals(body.state, 'accepted');
});

// The second admin's membership is removed. One
// accepted admin is the last.
Deno.test('a removed co-admin membership refuses the'
+ ' last admin seat', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const second = generateIdentifier();
    await seedSeat(db, STARK, second, 'admin', AT);
    await landMembership(
        db, STARK, second, 'removed', 'admin', AT,
    );
    assertStrictEquals(
        await membershipOf(db, STARK, second),
        null,
    );
    const admin = await organizationToken(TONY, STARK);
    const refused = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT', membershipPath(STARK, TONY), admin, {
                state: 'removed',
                at: '2026-06-01T00:00:00.000000Z',
            },
        )),
    );
    assertStrictEquals(refused.status, 409);
    assertEquals(await refused.json(), {
        error: LAST_ADMIN,
    });
});

Deno.test('an admin seat beside another admin is removable,'
+ ' the actor\'s own included',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const second = generateIdentifier();
    await seedSeat(db, STARK, second, 'admin', AT);
    const admin = await organizationToken(TONY, STARK);
    const removed = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT', membershipPath(STARK, TONY), admin, {
                state: 'removed',
                at: '2026-06-01T00:00:00.000000Z',
            },
        )),
    );
    assertStrictEquals(removed.status, 200);
    const gone = await removed.json() as {
        state: string;
        identity_id: string;
    };
    assertStrictEquals(gone.state, 'removed');
    assertStrictEquals(gone.identity_id, TONY);
    const last = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT', membershipPath(STARK, second), admin, {
                state: 'removed',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(last.status, 409);
    assertEquals(await last.json(), { error: LAST_ADMIN });
});
