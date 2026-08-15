import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    devToken,
    reachableToken,
} from './token-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// identityDefaultOrganization's primary-membership fallback (this
// file's own motivating case) and the deny-by-default role check
// both derive from the pair plane once role_grants/memberships
// flip, so a raw row here would go derivation-invisible. Every
// id/field value stays IDENTICAL to the raw puts these replace —
// only the write mechanism changes.

async function join(
    db: MemoryDbAdapter,
    identityId: string,
    organization: string,
    type: 'admin' | 'member' = 'admin',
) {
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(db, organization, organization);
    const id = 'm-' + identityId + '-' + organization;
    const body = {
        organization_id: organization,
        identity_id: identityId,
        type,
        at: AT,
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
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

function getMembers(token: string) {
    return new Request(`${BASE}/members`, {
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// Task 8 (Phase 11): the flat-token fence fallback
// (identityDefaultOrganization) now derives from the
// /identities/:id/default-org/ message-pair ledger, never the
// identity_default_organizations table directly — so seeding a
// SET default here must ride the real PUT route (the same
// production write path), not a raw table put.
function putDefaultOrganization(
    token: string, identityId: string, organization: string,
) {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify({
                organization_id: organization,
                eventId: 'ev-flat-default-1',
                at: AT,
            }),
        });
}

test('a flat token resolves its org from the set default',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    // Claim orgs must include the membership set — fence
    // projects memberships from the token claim, not live.
    const token = await reachableToken('current', ['2']);
    const put = await handleRequest(
        db, putDefaultOrganization(token, 'current', '2'));
    assert.equal(put.status, 201);
    const res = await handleRequest(db, getMembers(token));
    assert.equal(res.status, 200);
});

test('a flat token falls back to its primary membership org',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    const res = await handleRequest(
        db, getMembers(await reachableToken('current', ['2'])));
    assert.equal(res.status, 200);
});

test('a flat token with no org resolution is denied',
async () => {
    const db = await freshDb();   // role, no member
    const res = await handleRequest(
        db, getMembers(await devToken()));
    assert.equal(res.status, 403);
});
