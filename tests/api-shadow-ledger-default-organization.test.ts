import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { devToken } from './token-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2099-01-01T00:00:00.000000Z';

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
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
): Promise<void> {
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
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

function putDefaultOrganization(
    token: string,
    identityId: string,
    organization: string,
    eventId: string,
    at: string,
): Request {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({
                organization_id: organization, eventId, at,
            }),
        });
}

// Event-append class: uriId is the body's OWN eventId, NOT the
// identity from the URL — a fresh id every write, so a repeat
// write to a DIFFERENT org (or a fresh eventId) never chains.

test('a default-org write appends its pair addressed at the'
+ ' eventId, not the identity', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-1', AT,
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // 3: the fixture's own organization document + membership
    // pair (Phase 13 Tasks 1 and 3) precede this write.
    assert.equal(requests.length, 3);
    assert.equal(
        requests[2]!.uri_prefix,
        '/identities/current/default-org/',
    );
    assert.equal(requests[2]!.uri_id, 'ev-1');
});

test('two writes to different orgs each append their OWN'
+ ' genesis pair, never superseding', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    await seedMembership(db, 'current', '2');
    const token = await devToken();
    const first = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-2a', AT,
    ));
    assert.equal(first.status, 204);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-2b', AT,
    ));
    assert.equal(second.status, 204);
    assert.equal(second.headers.get('Supersedes'), null);
    const requests = await db.requests.getAll();
    // 6: the fixture's own two organization documents + two
    // membership pairs (Phase 13 Tasks 1 and 3) precede these
    // two writes.
    assert.equal(requests.length, 6);
});

test('the idempotent no-change branch still appends its own'
+ ' pair — the pair is that request\'s only write',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-3a', AT,
    ));
    // A DIFFERENT eventId, but the SAME org (already current) —
    // a distinct request message (so not a byte-identical
    // resend) whose domain effect is a no-op.
    const res = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-3b', AT,
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // 4: the fixture's own organization document + membership
    // pair (Phase 13 Tasks 1 and 3) precede these two writes.
    assert.equal(requests.length, 4);
    const ledgerRows =
        await db.identityDefaultOrganizations.getAll();
    // The no-op write appended NO ledger row (the org already
    // was '1') — only the pair recorded the second call.
    assert.equal(ledgerRows.length, 1);
});

test('a byte-identical PUT resend returns the stored response'
+ ' and appends nothing', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const body = putDefaultOrganization(
        token, 'current', '1', 'ev-4', AT,
    );
    const first = await handleRequest(db, body);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const second = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-4', AT,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    // 3: the fixture's own organization document + membership
    // pair (Phase 13 Tasks 1 and 3) precede this write; the
    // resend appends nothing further.
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('a forbidden (non-member org) PUT appends nothing',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-5', AT,
    ));
    assert.equal(res.status, 403);
    // 2: only the fixture's own organization document + membership
    // pair (Phase 13 Tasks 1 and 3) — the forbidden write appends
    // nothing.
    assert.equal((await db.requests.getAll()).length, 2);
    assert.equal((await db.responses.getAll()).length, 2);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    await seedMembership(db, 'current', '2');
    const token = await devToken();
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-6a', AT,
    ));
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-6b', AT,
    ));
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('request and response counts stay equal across a mix'
+ ' including one failure', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-7a', AT,
    ));
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-7b', AT,
    ));
    const failed = await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-7fail', AT,
    ));
    assert.equal(failed.status, 403);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
