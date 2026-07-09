import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';

// Verify-first (Correction C): facadeRequest forwards POST
// bodies and re-enters the gate against the org-scoped
// `effective` adapter, so a records POST through
// the facade is org-fenced exactly like a flat PUT. These
// pin that behavior; no facade code is added unless red.

const BASE = 'http://localhost';

function req(
    method: string, path: string,
    token: string, body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// An edit record write puts only the record row — the path
// that isolates the org stamp from the create-path member
// and initial-state writes.
function editBody(organization: string) {
    return {
        kind: 'edit',
        id: 'rec-1',
        record: {
            organization_id: organization,
            name: 'rec', description: 'd', position: 0,
        },
        attributes: [],
        state: 'active',
        state_at: '2020-01-01T00:00:00.000000Z',
        state_event_id: 'facade-rec-1-active',
        removedAttributeIds: [],
    };
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the facade's own org-A authz check derives from the pair plane
// once memberships/role_grants flip, so a raw row here would go
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

// `current` holds admin in org A (the administered org) and
// is a member of org A only. Roles are per-org since Phase 3,
// so the org-A grant authorizes the facade write.
async function oneOrganization(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedRoleGrantPair(db, 'role-current-admin-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return db;
}

test('a facade records write stamps the bound org'
    + ' over a forged record', async () => {
    const db = await oneOrganization();
    const res = await handleRequest(db, req(
        'POST', '/organizations/A/records',
        await devToken('current'),
        editBody('B')));
    assert.equal(res.status, 204);
    const stored = await db.records.getById('rec-1');
    assert.equal(stored.organization_id, 'A');
});

test('a facade records write into a non-member org'
    + ' is 403', async () => {
    const db = await oneOrganization();
    const res = await handleRequest(db, req(
        'POST', '/organizations/B/records',
        await devToken('current'),
        editBody('B')));
    assert.equal(res.status, 403);
});
