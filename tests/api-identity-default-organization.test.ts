import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test('PUT default-organization sets it and GET returns it',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrganization(token, 'current', '1'));
    assert.equal(put.status, 201);
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string };
    assert.equal(body.organization_id, '1');
});

test('PUT a non-seat organization is 400', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(
        db, putDefaultOrganization(token, 'current', '2'));
    assert.equal(res.status, 400);
});

test('PUT to another identity tree is forbidden', async () => {
    const db = await freshDb();
    await seedMembership(db, 'other', '1');
    const token = await devToken();   // sub = current
    const res = await handleRequest(
        db, putDefaultOrganization(token, 'other', '1'));
    assert.equal(res.status, 403);
});

test('PUT the same organization twice is one document',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(
        db, putDefaultOrganization(token, 'current', '1'));
    await handleRequest(
        db, putDefaultOrganization(token, 'current', '1'));
    const { deriveDefaultOrganization } = await import(
        '../api/derive-default-organization.ts'
    );
    const rows = await deriveDefaultOrganization(
        db, 'current',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.organization_id, '1');
});

test('GET 404s when never SET', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'current'));
    assert.equal(got.status, 404);
});

test('GET 404s for an organization-less identity', async () => {
    const db = await freshDb();
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'current'));
    assert.equal(got.status, 404);
});

test('PUT without organization_id returns 400', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(
        db, new Request(
            `${BASE}/identities/current/default-organization`, {
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
    assert.equal(res.status, 400);
});

test('revoke leaves the SET default-organization document',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    await seedMembership(db, 'current', '2');
    const token = await devToken();
    const put = await handleRequest(
        db, new Request(
            `${BASE}/identities/current/default-organization`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'operation-id': TEST_OPERATION_ID,
                },
                body: JSON.stringify({
                    organization_id: '2',
                }),
            },
        ),
    );
    assert.equal(put.status, 201);
    const revoked = await handleRequest(
        db, new Request(
            `${BASE}/organizations/2/members/current`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer '
                        + await organizationToken(
                            'current', '2',
                        ),
                    'operation-id': TEST_OPERATION_ID,
                },
            },
        ),
    );
    assert.equal(revoked.status, 204);
    const got = await handleRequest(
        db, new Request(
            `${BASE}/identities/current/default-organization`, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
            },
        ),
    );
    assert.equal(got.status, 200);
    const body = await got.json() as {
        organization_id: string;
    };
    assert.equal(body.organization_id, '2');
});

test('GET identities/:id/default-organization'
    + ' matches the table', () => {
    const match = matchRoute(
        routes,
        pathSegmentsOf(
            '/identities/abc/default-organization',
        ),
    );
    assert.ok(match);
    assert.equal(typeof match.route.get, 'function');
    assert.equal(typeof match.route.put, 'function');
});
