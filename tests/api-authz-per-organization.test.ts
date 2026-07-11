import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';

const BASE = 'http://localhost';

function req(
    method: string, path: string, token: string,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the per-org authz checks below derive from the pair plane once
// memberships/role_grants flip, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw puts these replace — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(db, organization, organization);
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
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedRoleGrantPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/role-grants/' + id,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postRoleGrantDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

// `current` is a member of BOTH orgs but admin ONLY in A.
// The exchange is membership-fenced, so it succeeds into
// either org — which means AUTHZ, not the fence, is what
// must keep the org-A grant from acting in org B.
async function memberOfBothAdminInA(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await seedRoleGrantPair(db, 'g-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return db;
}

test('a role granted in org A does not authorize in org B',
async () => {
    const db = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'GET', '/organizations/B/ideas',
        await devToken('current')));
    assert.equal(res.status, 403);
});

test('the same role authorizes within its own org',
async () => {
    const db = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas',
        await devToken('current')));
    assert.equal(res.status, 200);
});

test('a flat token authorizes via its resolved membership',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, 'm', {
        organization_id: '1', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await seedRoleGrantPair(db, 'g', {
        organization_id: '1', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'GET', '/members', await devToken('current')));
    assert.equal(res.status, 200);
});
