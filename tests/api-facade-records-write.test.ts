import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, organizationToken } from
    './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';

// Task 23: nested record-types is in-table (no facade
// re-entry). Flat /organizations/:org/records re-enters flat
// and 404s. Pins keep nested org stamp + flat retirement.

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

async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    await seedOrganizationDocument(
        db, organization, organization,
    );
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

async function oneOrganization(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'current',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return db;
}

test('nested record-types write stamps the bound org'
    + ' over a forged record', async () => {
    const db = await oneOrganization();
    const token = await organizationToken('current', 'A');
    const res = await handleRequest(db, req(
        'POST', '/organizations/A/record-types',
        token,
        editBody('B')));
    assert.equal(res.status, 204);
    const get = await handleRequest(db, req(
        'GET',
        '/organizations/A/record-types/rec-1',
        token,
    ));
    assert.equal(get.status, 200);
    const stored = await get.json() as {
        organization_id: string;
    };
    assert.equal(stored.organization_id, 'A');
});

test('nested record-types write into a non-member org'
    + ' is 403', async () => {
    const db = await oneOrganization();
    // Token scoped to A cannot use path org B (org-match).
    const token = await organizationToken('current', 'A');
    const res = await handleRequest(db, req(
        'POST', '/organizations/B/record-types',
        token,
        editBody('B')));
    assert.equal(res.status, 403);
});

test('authenticated flat GET /records → 404',
async () => {
    const db = await oneOrganization();
    const token = await organizationToken('current', 'A');
    const res = await handleRequest(
        db, req('GET', '/records', token),
    );
    assert.equal(res.status, 404);
});

test('unauthenticated GET /records → 401',
async () => {
    const db = await oneOrganization();
    const res = await handleRequest(
        db,
        new Request(`${BASE}/records`, { method: 'GET' }),
    );
    assert.equal(res.status, 401);
});
