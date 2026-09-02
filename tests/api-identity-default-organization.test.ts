import { assert, assertStrictEquals } from '@std/assert';
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
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// PUT identities/:id/default-organization requires a live
// seat, so a raw row here would go derivation-invisible.
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
    return new Request(
        `${BASE}/identities/${identityId}`
            + '/default-organization', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify({
                organization_id: organization,
            }),
        });
}

function getDefaultOrganization(token: string, identityId: string) {
    return new Request(
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

Deno.test('PUT a non-seat organization is 400', async () => {
    const db = await freshDb();
    await seedMembership(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const token = await devToken();
    const res = await handleRequest(
        db, putDefaultOrganization(token, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'));
    assertStrictEquals(res.status, 400);
});

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
        db, new Request(
            `${BASE}/identities/XXZruirZyAOoRpNxaDnpSA/default-organization`
                , {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'operation-id': TEST_OPERATION_ID,
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
        db, new Request(
            `${BASE}/identities/XXZruirZyAOoRpNxaDnpSA/default-organization`
                , {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'operation-id': TEST_OPERATION_ID,
                },
                body: JSON.stringify({
                    organization_id: 'BBjWJsjYIDkTRKIIPrzWRw',
                }),
            },
        ),
    );
    assertStrictEquals(put.status, 201);
    const revoked = await handleRequest(
        db, new Request(
            `${BASE}/organizations/`
                + 'BBjWJsjYIDkTRKIIPrzWRw/members/'
                + 'XXZruirZyAOoRpNxaDnpSA', {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer '
                        + await organizationToken(
                            'XXZruirZyAOoRpNxaDnpSA'
                                , 'BBjWJsjYIDkTRKIIPrzWRw',
                        ),
                    'operation-id': TEST_OPERATION_ID,
                },
            },
        ),
    );
    assertStrictEquals(revoked.status, 204);
    const got = await handleRequest(
        db, new Request(
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
    assertStrictEquals(typeof match.route.get, 'function');
    assertStrictEquals(typeof match.route.put, 'function');
});
