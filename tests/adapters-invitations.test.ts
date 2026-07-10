import { test } from 'node:test';
import {
    invitationLifecycleStatesFor,
} from '../api/derive-states.ts';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from '../api/backend-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import type { NotificationEvent } from '../api/notifications.ts';
import {
    validateInvitationEntity,
    validateMembershipEntity,
} from '../api/validators.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedIdentityPii } from './identity-fixtures.ts';
import {
    postInvitationGrant,
    postInvitationAcceptance,
    postInvitationDecline,
    postInvitationRevocation,
    getInvitations,
    getSentInvitations,
} from '../web-app/app/adapters/invitations.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    canonicalUriPrefix,
} from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import { deriveDocumentsAt } from
    '../api/derive-documents.ts';
import { withoutId } from '../api/document-family.ts';

const AT = '2026-01-01T00:00:00.000000Z';

// Below-facade pair formation (the member-fixtures.ts idiom,
// mirroring seedOrganizationDocument's own reasoning just below):
// postInvitationGrant's admin/membership checks derive from the
// pair plane once role_grants/memberships flip, so a raw row
// here would go derivation-invisible — and, like
// seedOrganizationDocument, these below-facade ops post no
// notification, so seedWithNotify's counting spy stays clean.
// Every id/field value stays IDENTICAL to the raw puts these
// replace — only the write mechanism changes.
async function seedMembershipPair(
    db: DbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
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
    db: DbAdapter,
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

// Two orgs (Stark '1', Wayne '2'). Tony ('current') is admin
// and member of both. Sarah is a Stark-only member. Dave is an
// identity with no membership anywhere (a fresh invitee).
async function seedRows(db: DbAdapter): Promise<void> {
    await db.postSchemaCreation();
    // Message pairs, not raw rows: getInvitations' own
    // organization_name join (Phase 12 Task 5,
    // api/invitations-domain.ts) derives from the ledger, so a
    // raw db.organizations.put would leave both orgs invisible
    // to it — seedOrganizationDocument's own comment (test-
    // fixtures.ts) on why this rides below the facade rather
    // than a live PUT (this fixture also feeds seedWithNotify's
    // counting spy, which a live PUT's own notification would
    // pollute).
    await seedOrganizationDocument(db, '1', 'Stark');
    await seedOrganizationDocument(db, '2', 'Wayne');
    for (const organization of ['1', '2']) {
        await seedRoleGrantPair(db, 'rg-current-' + organization, {
            organization_id: organization, identity_id: 'current',
            role: 'admin', action: 'granted',
            by_member_id: 'system', at: AT,
        });
        await seedMembershipPair(db, 'm-current-' + organization, {
            organization_id: organization, identity_id: 'current',
            at: AT,
        });
    }
    await seedPerson(db, 'current', 'Tony', 'demo@example.com');
    await seedPerson(db, 'sarah', 'Sarah', 'sarah@x.com');
    await seedMembershipPair(db, 'm-sarah-1', {
        organization_id: '1', identity_id: 'sarah', at: AT,
    });
    await seedPerson(db, 'dave', 'Dave', 'dave@x.com');
}

async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedRows(db);
    return db;
}

// The same world, over a BackedDbAdapter constructed directly
// so the notify hook (its 4th ctor arg) can be a counting spy —
// MemoryDbAdapter's preset always wires a no-op there.
async function seedWithNotify(
    notify: (event: NotificationEvent) => void,
): Promise<BackedDbAdapter> {
    const db = new BackedDbAdapter(
        new MemoryStorageBackend(),
        async () => {},
        async () => {},
        notify,
    );
    await seedRows(db);
    return db;
}

// identities stays a raw put — no GET /identities (or
// /identities/:id) reads it anywhere in this file. identityPii
// DOES feed a flip: getInvitations/getSentInvitations enrich
// invited_by_name/invitee_email by reading the identity_pii
// plane (api/invitations-domain.ts), which Task 8 Step 3
// re-points onto deriveIdentityPiiRows — so this facet forms
// its pair below-facade (finding 18's fixture budget) via the
// SAME exported op the live PUT identities/:id/pii route uses.
async function seedPerson(
    db: DbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await seedIdentityPii(db, id, {
        name, email, phone: '', bio: '',
    });
}

// Phase Final Task 2: all membership documents (every org).
async function deriveMembershipsAll(db: DbAdapter) {
    const organizations = await deriveOrganizations(db);
    const rows: Array<{
        id: string;
        organization_id: string;
        identity_id: string;
        at: string;
    }> = [];
    for (const organization of organizations) {
        const prefix = canonicalUriPrefix(
            organization.id, '/memberships/',
        );
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_prefix', prefix),
            db.responses.getAllWhere('uri_prefix', prefix),
        ]);
        for (const document of deriveDocumentsAt(
            requests, responses, prefix,
        ).values()) {
            rows.push({
                ...validateMembershipEntity(
                    withoutId(document.body),
                ),
                id: document.uriId,
            });
        }
    }
    return rows;
}

async function ctxFor(sub: string, organization: string) {
    const db = await seed();
    const ctx = createRequestContext(
        db, await organizationToken(sub, organization),
    );
    return { db, ctx };
}

// A context bound to an existing db (for two actors in one test).
async function ctxOn(db: DbAdapter, sub: string, organization: string) {
    return createRequestContext(
        db, await organizationToken(sub, organization),
    );
}

// Erase a pii slot through the LIVE facade (Phase 10 Task 8
// Session B), not a raw db.identityPii.delete: the enrichment
// joins below now read deriveIdentityPiiRows (the message
// ledger), so a raw row delete leaves the slot's message pair
// intact and the "erased" identity would still show up in the
// derived read. The live DELETE also replaces the pair
// (replacePiiSlot, the hard-delete zone), matching what an
// actual erasure does. `actor` is the caller (self or admin);
// `organization` only needs to resolve a valid fenced token —
// authorizeIdentityPii's self-or-admin check does not itself
// consult org membership.
async function eraseIdentityPii(
    db: DbAdapter,
    actor: string,
    organization: string,
    target: string,
): Promise<void> {
    const token = await organizationToken(actor, organization);
    const response = await handleRequest(db, new Request(
        `http://localhost/identities/${target}/pii`,
        {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token },
        },
    ));
    assert.equal(response.status, 204);
}

test('validateInvitationEntity accepts a full body', () => {
    assert.deepEqual(
        validateInvitationEntity({
            organization_id: '2',
            identity_id: 'sarah',
            at: AT,
        }),
        {
            organization_id: '2',
            identity_id: 'sarah',
            at: AT,
        },
    );
});

test('validateInvitationEntity rejects an extra key', () => {
    assert.throws(() =>
        validateInvitationEntity({
            organization_id: '2', identity_id: 'sarah',
            at: AT, state: 'pending',
        }));
});

test('validateInvitationEntity rejects a bad timestamp', () => {
    assert.throws(() =>
        validateInvitationEntity({
            organization_id: '2', identity_id: 'sarah',
            at: 'not-a-date',
        }));
});

// Phase Final Stage B: invitations table retired — store
// round-trip pins live on pair-plane document tests.

test('grant by email appends a pending invitation', async () => {
    const { db, ctx } = await ctxFor('current', '2');
    assert.equal(
        await postInvitationGrant(ctx, 'sarah@x.com'), 'sent');
    // Phase Final Task 2: invitations ROW half stripped.
    const rows = await deriveInvitations(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.organization_id, '2');
    assert.equal(rows[0]!.identity_id, 'sarah');
    assert.equal(rows[0]!.state, 'pending');
    // Phase Final Stage B: roster tables retired.
});

test('grant stamps the org from the verified token', async () => {
    // Tony is admin of both, but his token is scoped to Wayne;
    // the invitation must land in Wayne, never Stark.
    const { db, ctx } = await ctxFor('current', '2');
    await postInvitationGrant(ctx, 'sarah@x.com');
    const rows = await deriveInvitations(db);
    assert.equal(rows[0]!.organization_id, '2');
});

test('grant by unknown email returns no-identity', async () => {
    const { ctx } = await ctxFor('current', '2');
    assert.equal(
        await postInvitationGrant(ctx, 'nobody@x.com'),
        'no-identity');
});

test('grant for an existing member returns already-member',
async () => {
    // Tony invites Sarah to Stark, where she is already a member.
    const { ctx } = await ctxFor('current', '1');
    assert.equal(
        await postInvitationGrant(ctx, 'sarah@x.com'),
        'already-member');
});

test('a non-admin cannot grant', async () => {
    // Sarah is a Stark member but not an admin.
    const { ctx } = await ctxFor('sarah', '1');
    await assert.rejects(
        postInvitationGrant(ctx, 'dave@x.com'));
});

test('the invitee reads their own pending invitation',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const sarah = await ctxOn(db, 'sarah', '1');
    const mine = await getInvitations(sarah);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.organizationName, 'Wayne');
    assert.equal(mine[0]!.state, 'pending');
});

test('the view omits the inviter name when PII is erased',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    await eraseIdentityPii(db, 'current', '2', 'current');
    const sarah = await ctxOn(db, 'sarah', '1');
    const mine = await getInvitations(sarah);
    assert.equal(mine.length, 1);
    assert.ok(!('invitedByName' in mine[0]!));
});

test('the view omits the org name when the org is gone',
async () => {
    // Org '3': current is admin/member, but it carries no
    // organizations document at all — a states 'deleted' event
    // against an EXISTING org (the pre-flip version of this test)
    // no longer omits the name, since the flipped join (Phase 12
    // Task 5) derives from the ledger, which never consults
    // states (a NAMED watch-point, api/derive-organizations.ts's
    // own header — organizations carry no real delete lifecycle,
    // so a genuinely-undocumented org is the honest "gone" case
    // on BOTH planes).
    const { db } = await ctxFor('current', '2');
    await seedRoleGrantPair(db, 'rg-current-3', {
        organization_id: '3', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-current-3', {
        organization_id: '3', identity_id: 'current', at: AT,
    });
    const tony = await ctxOn(db, 'current', '3');
    await postInvitationGrant(tony, 'sarah@x.com');
    const sarah = await ctxOn(db, 'sarah', '1');
    const mine = await getInvitations(sarah);
    assert.equal(mine.length, 1);
    assert.ok(!('organizationName' in mine[0]!));
});

test('accept writes a membership in the invitation org',
async () => {
    // THE security crux: Sarah is scoped to Stark, but accepting
    // a Wayne invite must write a WAYNE membership, never Stark.
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationAcceptance(sarah, inv.id);
    const memberships = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'sarah');
    const organizations = memberships.map(m => m.organization_id).sort();
    assert.deepEqual(organizations, ['1', '2']);
    const views = await getInvitations(sarah);
    assert.equal(
        views.find(v => v.id === inv.id)?.state, 'accepted');
});

test('accept by a non-invitee is rejected', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    // Dave tries to accept Sarah's invitation.
    const dave = await ctxOn(db, 'dave', '1');
    await assert.rejects(
        postInvitationAcceptance(dave, inv.id));
});

test('decline records declined and writes no membership',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    // Decline is identity-gated, not org-gated: Dave acts on his
    // own invitation regardless of any active org.
    const dave = await ctxOn(db, 'dave', '1');
    await postInvitationDecline(dave, inv.id);
    const views = await getInvitations(dave);
    assert.equal(
        views.find(v => v.id === inv.id)?.state, 'declined');
    const memberships = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'dave');
    assert.equal(memberships.length, 0);
});

test('revoke records revoked (admin only)', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    await postInvitationRevocation(tony, inv.id);
    const sarah = await ctxOn(db, 'sarah', '1');
    const views = await getInvitations(sarah);
    assert.equal(
        views.find(v => v.id === inv.id)?.state, 'revoked');
});

test('a non-admin cannot revoke', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await assert.rejects(
        postInvitationRevocation(sarah, inv.id));
});

test('accept after revoke is rejected, no membership', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    await postInvitationRevocation(tony, inv.id);
    const sarah = await ctxOn(db, 'sarah', '1');
    await assert.rejects(
        postInvitationAcceptance(sarah, inv.id));
    const wayne = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'sarah'
            && m.organization_id === '2');
    assert.equal(wayne.length, 0);
});

test('accept after decline is rejected', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationDecline(sarah, inv.id);
    await assert.rejects(
        postInvitationAcceptance(sarah, inv.id));
});

test('decline after accept is rejected', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationAcceptance(sarah, inv.id);
    await assert.rejects(
        postInvitationDecline(sarah, inv.id));
});

test('granting the same email twice is idempotent', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    await postInvitationGrant(tony, 'sarah@x.com');
    assert.equal((await deriveInvitations(db)).length, 1);
});

// The dedup treats only a PENDING invitation as outstanding — a
// DECLINED one is spent. Contrast the idempotent-duplicate case
// above (still pending): here the invitee has answered, so the
// re-grant must mint a FRESH invitation, never echo the declined
// row's id.
test('re-inviting a declined invitee mints a fresh invitation',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const first = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationDecline(sarah, first.id);

    assert.equal(
        await postInvitationGrant(tony, 'sarah@x.com'), 'sent');

    const invs = await deriveInvitations(db);
    assert.equal(invs.length, 2);
    const fresh = invs.find(inv => inv.id !== first.id);
    assert.ok(fresh !== undefined);

    const mine = await getInvitations(sarah);
    const stateById = new Map(mine.map(v => [v.id, v.state]));
    assert.equal(stateById.get(first.id), 'declined');
    assert.equal(stateById.get(fresh!.id), 'pending');
});

test('sent invitations list the active org pending only',
async () => {
    const { db } = await ctxFor('current', '2');
    const tonyWayne = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tonyWayne, 'sarah@x.com');
    const sent = await getSentInvitations(tonyWayne);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.inviteeEmail, 'sarah@x.com');
    // Switched to Stark, the Wayne invitation is out of scope.
    const tonyStark = await ctxOn(db, 'current', '1');
    assert.equal((await getSentInvitations(tonyStark)).length, 0);
});

test('the sent view omits the email when PII is erased',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    await eraseIdentityPii(db, 'current', '2', 'sarah');
    const sent = await getSentInvitations(tony);
    assert.equal(sent.length, 1);
    assert.ok(!('inviteeEmail' in sent[0]!));
});

// Caller-minted ids + at (T11)
// Adapters mint unconditionally; the adapter-level tests assert:
// - entity lands and carries a state event with an `at`
// - author (member_id) is server-derived, not a body field
// Replay idempotency is tested at the API level (fixed-body
// POST twice), where the exact id is controllable — see
// tests/api-invitations-fence.test.ts.

test('grant: entity lands and event author is server-derived',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const invs = await deriveInvitations(db);
    assert.equal(invs.length, 1);
    // Entity landed with a non-empty id.
    assert.ok(invs[0]!.id !== '');
    // State event exists and carries an at.
    const life = await invitationLifecycleStatesFor(
        db, invs[0]!.id,
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.ok(ev.at !== '');
    assert.equal(ev.member_id, 'current');
});

test('accept: event author is server-derived, membership lands',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationAcceptance(sarah, inv.id);
    // State event landed with a non-empty id + at.
    const life = await invitationLifecycleStatesFor(
        db, inv.id,
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.ok(ev.id !== '');
    assert.ok(ev.at !== '');
    assert.equal(ev.member_id, 'sarah');
    // Membership landed at a non-empty id.
    const wayne = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'sarah'
            && m.organization_id === '2');
    assert.equal(wayne.length, 1);
    assert.ok(wayne[0]!.id !== '');
});

test('decline: event author is server-derived', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const dave = await ctxOn(db, 'dave', '1');
    await postInvitationDecline(dave, inv.id);
    const life = await invitationLifecycleStatesFor(
        db, inv.id,
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.ok(ev.id !== '');
    assert.ok(ev.at !== '');
    assert.equal(ev.member_id, 'dave');
});

test('revoke: event author is server-derived', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    await postInvitationRevocation(tony, inv.id);
    const life = await invitationLifecycleStatesFor(
        db, inv.id,
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.ok(ev.id !== '');
    assert.ok(ev.at !== '');
    assert.equal(ev.member_id, 'current');
});

// A notify fires only after a write commits — an idempotent
// no-op writes nothing, so it must ring nothing.

test('a repeated grant (existing pending) posts no notification',
async () => {
    const posted: NotificationEvent[] = [];
    const db = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    assert.equal(posted.length, 1);
    await postInvitationGrant(tony, 'sarah@x.com');
    assert.equal(posted.length, 1);
});

test('a repeated accept posts no notification', async () => {
    const posted: NotificationEvent[] = [];
    const db = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationAcceptance(sarah, inv.id);
    assert.equal(posted.length, 2);   // grant, accept
    await postInvitationAcceptance(sarah, inv.id);
    assert.equal(posted.length, 2);
});

test('a repeated decline posts no notification', async () => {
    const posted: NotificationEvent[] = [];
    const db = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    const dave = await ctxOn(db, 'dave', '1');
    await postInvitationDecline(dave, inv.id);
    assert.equal(posted.length, 2);   // grant, decline
    await postInvitationDecline(dave, inv.id);
    assert.equal(posted.length, 2);
});

test('a repeated revoke posts no notification', async () => {
    const posted: NotificationEvent[] = [];
    const db = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await deriveInvitations(db))[0]!;
    await postInvitationRevocation(tony, inv.id);
    assert.equal(posted.length, 2);   // grant, revoke
    await postInvitationRevocation(tony, inv.id);
    assert.equal(posted.length, 2);
});
