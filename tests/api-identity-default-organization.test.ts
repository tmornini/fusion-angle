import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
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

// Below-facade pair formation (the member-fixtures.ts idiom): the
// PUT identities/:id/default-org route's own membership check
// derives from the pair plane once memberships flips, so a raw
// row here would go derivation-invisible. Every id/field value
// stays IDENTICAL to the raw put this replaces — only the write
// mechanism changes.
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
    await seedOrganizationDocument(db, organization, organization);
    const id = 'm-' + identityId + '-' + organization;
    const body = {
        organization_id: organization,
        identity_id: identityId,
        type: 'member',
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

// eventId + at are now caller-minted; far-future AT is used so
// timestamps are deterministic across timezones.
const EVENT_AT = '2099-01-01T00:00:00.000000Z';

function putDefaultOrganization(
    token: string,
    identityId: string,
    organization: string,
    eventId?: string,
    at?: string,
) {
    const payload: Record<string, string> =
        { organization_id: organization };
    if (eventId !== undefined) payload['eventId'] = eventId;
    if (at !== undefined) payload['at'] = at;
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify(payload),
        });
}

function getDefaultOrganization(token: string, identityId: string) {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });
}

test('PUT default-org sets it and GET returns it', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrganization(
            token, 'current', '1', 'ev-set-1', EVENT_AT,
        ));
    assert.equal(put.status, 201);
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string | null };
    assert.equal(body.organization_id, '1');
});

test('PUT a non-member org is forbidden', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(
        db, putDefaultOrganization(
            token, 'current', '2', 'ev-forbid-1', EVENT_AT,
        ));
    assert.equal(res.status, 403);
});

test('PUT to another identity tree is forbidden', async () => {
    const db = await freshDb();
    await seedMembership(db, 'other', '1');
    const token = await devToken();   // sub = current
    const res = await handleRequest(
        db, putDefaultOrganization(
            token, 'other', '1', 'ev-tree-1', EVENT_AT,
        ));
    assert.equal(res.status, 403);
});

test('PUT the same org twice appends one event', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(
        db, putDefaultOrganization(
            token, 'current', '1', 'ev-dup-1', EVENT_AT,
        ));
    await handleRequest(
        db, putDefaultOrganization(
            token, 'current', '1', 'ev-dup-1', EVENT_AT,
        ));
    // Phase Final Task 2: identity_default_organizations ROW
    // half stripped — count via derive.
    const { deriveDefaultOrganization } = await import(
        '../api/derive-default-organization.ts'
    );
    const rows = await deriveDefaultOrganization(
        db, 'current',
    );
    assert.equal(rows.length, 1);
    // Phase Final Stage B: identity spine tables retired.
});

test('GET resolves to the primary membership when unset',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string | null };
    assert.equal(body.organization_id, '1');
});

test('GET is null for an org-less identity', async () => {
    const db = await freshDb();
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrganization(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string | null };
    assert.equal(body.organization_id, null);
});

test('PUT persists the caller-supplied eventId as the'
+ ' pair uriId', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrganization(
            token, 'current', '1', 'caller-id-1', EVENT_AT,
        ));
    assert.equal(put.status, 201);
    // Phase Final Task 2: row half stripped — pair plane.
    const { deriveDefaultOrganization } = await import(
        '../api/derive-default-organization.ts'
    );
    const rows = await deriveDefaultOrganization(
        db, 'current',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 'caller-id-1');
    assert.equal(rows[0]!.at, EVENT_AT);
});

test('PUT with same eventId + org is idempotent (no-op)',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const req1 = putDefaultOrganization(
        token, 'current', '1', 'caller-id-2', EVENT_AT,
    );
    const req2 = putDefaultOrganization(
        token, 'current', '1', 'caller-id-2', EVENT_AT,
    );
    const r1 = await handleRequest(db, req1);
    assert.equal(r1.status, 201);
    const r2 = await handleRequest(db, req2);
    assert.equal(r2.status, 201);
    const { deriveDefaultOrganization } = await import(
        '../api/derive-default-organization.ts'
    );
    const rows = await deriveDefaultOrganization(
        db, 'current',
    );
    // org unchanged on second PUT — no new event appended
    assert.equal(rows.length, 1);
});

test('PUT with empty eventId returns 400', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(
        db, putDefaultOrganization(
            token, 'current', '1', '', EVENT_AT,
        ));
    assert.equal(res.status, 400);
});
