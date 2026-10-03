import {
    assert, assertEquals, assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { routes, matchRoute } from
    '../api/routes.ts';
import { pathSegmentsOf } from
    '../api/path-segments.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { landMembership } from
    './membership-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    apiRequest,
    framedRequest,
    invitationLatched,
} from './http-fixtures.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { responseRecordOf } from '../api/message-pair.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';
const LATER = '2026-06-05T00:00:00.000000Z';
const MEMBER = 'XXZruirZyAOoRpNxaDnpSA';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const OTHER = 'BBjWJsjYIDkTRKIIPrzWRw';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// PUT identities/:id/default-organization requires an
// accepted membership, and seedSeat mirrors one.
async function seedMembership(
    db: MemoryDbAdapter,
    identityId: string,
    organization: string,
) {
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(
        db, organization, organization,
    );
    await seedSeat(
        db, organization, identityId, 'member', AT,
    );
}

function putDefaultOrganization(
    token: string,
    identityId: string,
    organization: string,
) {
    return framedRequest(
        `${BASE}/identities/${identityId}`
            + '/default-organization', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                'operation-id': generateIdentifier(),
            },
            body: JSON.stringify({
                organization_id: organization,
            }),
        });
}

function getDefaultOrganization(token: string, identityId: string) {
    return framedRequest(
        `${BASE}/identities/${identityId}`
            + '/default-organization', {
            headers: { 'Authorization': 'Bearer ' + token },
        });
}

Deno.test('PUT default-organization sets it and GET returns it',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg'));
    assertStrictEquals(put.status, 201);
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'));
    assertStrictEquals(got.status, 200);
    const body = await got.json() as
        { organization_id: string };
    assertStrictEquals(body.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
});

Deno.test(
    'PUT an organization without an accepted membership'
        + ' is 400',
    async () => {
        const db = await freshDb();
        await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg');
        const token = await devToken();
        const res = await handleRequest(
            db, putDefaultOrganization(
                token, 'XXZruirZyAOoRpNxaDnpSA',
                'BBjWJsjYIDkTRKIIPrzWRw',
            ));
        assertStrictEquals(res.status, 400);
    },
);

const REFUSED = {
    error: 'organization_id is not an accepted membership',
};

async function putAfterSeatedHead(
    state: 'pending' | 'declined' | 'revoked' | 'removed',
) {
    const db = await freshDb();
    await seedMembership(db, MEMBER, STARK);
    await landMembership(
        db, STARK, MEMBER, state, 'member', LATER,
    );
    return handleRequest(db, putDefaultOrganization(
        await devToken(), MEMBER, STARK,
    ));
}

Deno.test('PUT a pending membership is 400', async () => {
    const res = await putAfterSeatedHead('pending');
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), REFUSED);
});

Deno.test('PUT a declined membership is 400', async () => {
    const res = await putAfterSeatedHead('declined');
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), REFUSED);
});

Deno.test('PUT a revoked membership is 400', async () => {
    const res = await putAfterSeatedHead('revoked');
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), REFUSED);
});

// seedSeat mirrored accepted. The removed head is an
// accepted version under a removed head, and the seat
// remains.
Deno.test('PUT a removed membership is 400', async () => {
    const res = await putAfterSeatedHead('removed');
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), REFUSED);
});

Deno.test(
    'PUT an accepted membership with no seat is admitted',
    async () => {
        const db = await freshDb();
        await landMembership(
            db, STARK, MEMBER, 'accepted', 'member', AT,
        );
        const res = await handleRequest(
            db, putDefaultOrganization(
                await devToken(), MEMBER, STARK,
            ),
        );
        assertStrictEquals(res.status, 201);
    },
);

Deno.test('PUT to another identity tree is forbidden', async () => {
    const db = await freshDb();
    const other = generateIdentifier();
    await seedMembership(db, other, 'AjdvjuECVZEgZoFajaIEkg');
    const token = await devToken();   // sub = current
    const res = await handleRequest(
        db, putDefaultOrganization(token, other, 'AjdvjuECVZEgZoFajaIEkg'));
    assertStrictEquals(res.status, 403);
});

Deno.test('PUT the same organization twice is one document',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const token = await devToken();
    await handleRequest(
        db, putDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg'));
    await handleRequest(
        db, putDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg'));
    const { deriveDefaultOrganization } = await import(
        '../api/derive-default-organization.ts'
    );
    const rows = await deriveDefaultOrganization(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
});

Deno.test('GET 404s when never SET', async () => {
    const db = await freshDb();
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'));
    assertStrictEquals(got.status, 404);
});

Deno.test('GET 404s for an organization-less identity', async () => {
    const db = await freshDb();
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'));
    assertStrictEquals(got.status, 404);
});

Deno.test('PUT without organization_id returns 400', async () => {
    const db = await freshDb();
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const token = await devToken();
    const res = await handleRequest(
        db, framedRequest(
            `${BASE}/identities/XXZruirZyAOoRpNxaDnpSA/default-organization`
                , {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'operation-id': generateIdentifier(),
                },
                body: JSON.stringify({}),
            },
        ),
    );
    assertStrictEquals(res.status, 400);
});

Deno.test('revoke leaves the SET default-organization document',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const token = await devToken();
    const put = await handleRequest(
        db, framedRequest(
            `${BASE}/identities/XXZruirZyAOoRpNxaDnpSA/default-organization`
                , {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'operation-id': generateIdentifier(),
                },
                body: JSON.stringify({
                    organization_id: 'BBjWJsjYIDkTRKIIPrzWRw',
                }),
            },
        ),
    );
    assertStrictEquals(put.status, 201);
    const removed = await handleRequest(
        db, await invitationLatched(db, apiRequest({
            method: 'PUT',
            path: '/organizations/' + OTHER
                + '/invitations/'
                + membershipNameOf(OTHER, MEMBER),
            token: await organizationToken(
                MEMBER, OTHER,
            ),
            body: {
                state: 'removed',
                at: LATER,
            },
        })),
    );
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();
    const got = await handleRequest(
        db, framedRequest(
            `${BASE}/identities/XXZruirZyAOoRpNxaDnpSA/default-organization`
                , {
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
            },
        ),
    );
    assertStrictEquals(got.status, 200);
    const body = await got.json() as {
        organization_id: string;
    };
    assertStrictEquals(body.organization_id, 'BBjWJsjYIDkTRKIIPrzWRw');
});

Deno.test('GET identities/:id/default-organization'
    + ' matches the table', () => {
    const match = matchRoute(
        routes,
        pathSegmentsOf(
            '/identities/' + generateIdentifier()
                + '/default-organization',
        ),
    );
    assert(match);
    assertStrictEquals(typeof match.route.select, 'function');
    assertStrictEquals(typeof match.route.put, 'function');
});

Deno.test(
    'a default organization naming another one lands',
    async () => {
        const db = await freshDb();
        await seedMembership(db, MEMBER, STARK);
        await seedMembership(db, MEMBER, OTHER);
        const token = await devToken();
        const first = await handleRequest(
            db, putDefaultOrganization(token, MEMBER, STARK),
        );
        assertStrictEquals(first.status, 201);
        const second = await handleRequest(
            db, putDefaultOrganization(token, MEMBER, OTHER),
        );
        assertStrictEquals(second.status, 200);
        assert(
            second.headers.get('etag')
                !== first.headers.get('etag'),
        );
        const got = await handleRequest(
            db, getDefaultOrganization(token, MEMBER),
        );
        assertEquals(
            await got.json(),
            { id: MEMBER, organization_id: OTHER },
        );
    },
);

Deno.test(
    'the default organization stores its state',
    async () => {
        const db = await freshDb();
        await seedMembership(db, MEMBER, STARK);
        const token = await devToken();
        const put = await handleRequest(
            db, putDefaultOrganization(token, MEMBER, STARK),
        );
        await put.body?.cancel();
        const head = await db.messagePairs.getHeadPair(
            '/identities/' + MEMBER
                + '/default-organization/',
            '',
        );
        assert(head !== null);
        assertEquals(
            responseRecordOf(head.response),
            { id: MEMBER, organization_id: STARK },
        );
    },
);

Deno.test(
    'a default organization body with another key is 400',
    async () => {
        const db = await freshDb();
        await seedMembership(db, MEMBER, STARK);
        const token = await devToken();
        const before = (await db.messagePairs.getAll())
            .length;
        const res = await handleRequest(db, framedRequest(
            BASE + '/identities/' + MEMBER
                + '/default-organization',
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'operation-id': generateIdentifier(),
                },
                body: JSON.stringify({
                    organization_id: STARK, extra: 1,
                }),
            },
        ));
        assertStrictEquals(res.status, 400);
        await res.body?.cancel();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);
