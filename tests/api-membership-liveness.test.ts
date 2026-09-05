import { assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedRootAdmin, seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const BASE = 'http://localhost';

function req(path: string, token: string): Request {
    return new Request(`${BASE}${path}`, {
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// De-membership rides the real wire DELETE. Under the claim-
// based fence, a still-valid token keeps its claim orgs/roles
// until mint/refresh/exchange or access-token expiry — the
// NAMED ≤15-min staleness covenant. Live membership is NOT
// re-read on every request.
async function deleteMembership(
    db: MemoryDbAdapter, id: string,
): Promise<void> {
    const res = await handleRequest(
        db, new Request(
            `${BASE}/organizations/AjdvjuECVZEgZoFajaIEkg/members/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer '
                    + await organizationToken(),
                'operation-id': generateIdentifier(),
            },
        }));
    assertStrictEquals(res.status, 204);
}

function putDefaultOrganization(
    token: string, identityId: string, organization: string,
): Request {
    return new Request(
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

// A second admin seat: the tests below remove the root
// admin's seat to prove the claim-based fence, and the last
// admin seat refuses removal (Task 20 of the critical
// functionality path).
const SECOND_ADMIN_ID = 'uTGrEpVpODbNhDhDVdWeqQ';

async function adminDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedSeat(
        db, 'AjdvjuECVZEgZoFajaIEkg', SECOND_ADMIN_ID, 'admin',
    );
    return db;
}

Deno.test('a live member passes the membership fence',
async () => {
    const db = await adminDb();
    const res = await handleRequest(
        db, req('/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , await organizationToken()));
    assertStrictEquals(res.status, 200);
});

Deno.test('a revoked membership does not stop access mid-token',
async () => {
    const db = await adminDb();
    const token = await organizationToken();
    const before = await handleRequest(
        db, req('/organizations/AjdvjuECVZEgZoFajaIEkg/members/', token));
    assertStrictEquals(before.status, 200);
    // Claim-based fence: de-membership lands on the message plane
    // but the existing token's organizations claim still holds
    // until mint/refresh/exchange or exp.
    await deleteMembership(db, 'XXZruirZyAOoRpNxaDnpSA');
    const after = await handleRequest(
        db, req('/organizations/AjdvjuECVZEgZoFajaIEkg/members/', token));
    assertStrictEquals(after.status, 200);
});

Deno.test('a flat token denies when SET is not a live seat'
+ ' and no PRIMARY remains',
async () => {
    const db = await adminDb();
    // Token resolution skips a SET that is not a live
    // seat. After revoke of the only remaining join,
    // a flat token has no organization to resolve.
    const pin = await handleRequest(db, putDefaultOrganization(
        await devToken(), 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
    ));
    assertStrictEquals(pin.status, 201);
    await deleteMembership(db, 'XXZruirZyAOoRpNxaDnpSA');
    const res = await handleRequest(
        db, req('/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , await devToken()));
    assertStrictEquals(res.status, 403);
});
