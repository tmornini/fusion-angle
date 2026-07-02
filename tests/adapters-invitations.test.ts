import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from '../api/backend-memory.ts';
import type { DbAdapter } from '../api/db.ts';
import type { NotificationEvent } from '../api/notifications.ts';
import {
    validateInvitationEntity,
} from '../api/validators.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { organizationRow } from './test-fixtures.ts';
import {
    postInvitationGrant,
    postInvitationAcceptance,
    postInvitationDecline,
    postInvitationRevocation,
    getInvitations,
    getSentInvitations,
} from '../web-app/app/adapters/invitations.ts';

const AT = '2026-01-01T00:00:00.000000Z';

// Two orgs (Stark '1', Wayne '2'). Tony ('current') is admin
// and member of both. Sarah is a Stark-only member. Dave is an
// identity with no membership anywhere (a fresh invitee).
async function seedRows(db: DbAdapter): Promise<void> {
    await db.postSchemaCreation();
    await db.organizations.put('1', organizationRow('Stark'));
    await db.organizations.put('2', organizationRow('Wayne'));
    for (const organization of ['1', '2']) {
        await db.roleGrants.put('rg-current-' + organization, {
            organization_id: organization, identity_id: 'current',
            role: 'admin', action: 'granted',
            by_member_id: 'system', at: AT,
        });
        await db.memberships.put('m-current-' + organization, {
            organization_id: organization, identity_id: 'current',
            at: AT,
        });
    }
    await seedPerson(db, 'current', 'Tony', 'demo@example.com');
    await seedPerson(db, 'sarah', 'Sarah', 'sarah@x.com');
    await db.memberships.put('m-sarah-1', {
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

async function seedPerson(
    db: DbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await db.members.put(id, { type: 'human' });
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, {
        name, email, phone: '', bio: '',
    });
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

test('the invitations store round-trips a row', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.invitations.put('inv1', {
        organization_id: '2', identity_id: 'sarah', at: AT,
    });
    const row = await db.invitations.getById('inv1');
    assert.equal(row.organization_id, '2');
    assert.equal(row.identity_id, 'sarah');
});

test('grant by email appends a pending invitation', async () => {
    const { db, ctx } = await ctxFor('current', '2');
    assert.equal(
        await postInvitationGrant(ctx, 'sarah@x.com'), 'sent');
    const rows = await db.invitations.getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.organization_id, '2');
    assert.equal(rows[0]!.identity_id, 'sarah');
    const state = await db.states.getCurrentFor(rows[0]!.id);
    assert.equal(state?.state, 'pending');
});

test('grant stamps the org from the verified token', async () => {
    // Tony is admin of both, but his token is scoped to Wayne;
    // the invitation must land in Wayne, never Stark.
    const { db, ctx } = await ctxFor('current', '2');
    await postInvitationGrant(ctx, 'sarah@x.com');
    const rows = await db.invitations.getAll();
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
    await db.identityPii.delete('current');
    const sarah = await ctxOn(db, 'sarah', '1');
    const mine = await getInvitations(sarah);
    assert.equal(mine.length, 1);
    assert.ok(!('invitedByName' in mine[0]!));
});

test('the view omits the org name when the org is gone',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    await db.states.postEvent(
        'ev-org-gone', '2', 'deleted', 'system',
        '2026-01-01T00:00:00.000000Z',
    );
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
    const inv = (await db.invitations.getAll())[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationAcceptance(sarah, inv.id);
    const memberships = (await db.memberships.getAll())
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
    const inv = (await db.invitations.getAll())[0]!;
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
    const inv = (await db.invitations.getAll())[0]!;
    // Decline is identity-gated, not org-gated: Dave acts on his
    // own invitation regardless of any active org.
    const dave = await ctxOn(db, 'dave', '1');
    await postInvitationDecline(dave, inv.id);
    const views = await getInvitations(dave);
    assert.equal(
        views.find(v => v.id === inv.id)?.state, 'declined');
    const memberships = (await db.memberships.getAll())
        .filter(m => m.identity_id === 'dave');
    assert.equal(memberships.length, 0);
});

test('revoke records revoked (admin only)', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await db.invitations.getAll())[0]!;
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
    const inv = (await db.invitations.getAll())[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await assert.rejects(
        postInvitationRevocation(sarah, inv.id));
});

test('accept after revoke is rejected, no membership', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await db.invitations.getAll())[0]!;
    await postInvitationRevocation(tony, inv.id);
    const sarah = await ctxOn(db, 'sarah', '1');
    await assert.rejects(
        postInvitationAcceptance(sarah, inv.id));
    const wayne = (await db.memberships.getAll())
        .filter(m => m.identity_id === 'sarah'
            && m.organization_id === '2');
    assert.equal(wayne.length, 0);
});

test('accept after decline is rejected', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await db.invitations.getAll())[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationDecline(sarah, inv.id);
    await assert.rejects(
        postInvitationAcceptance(sarah, inv.id));
});

test('decline after accept is rejected', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await db.invitations.getAll())[0]!;
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
    assert.equal((await db.invitations.getAll()).length, 1);
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
    await db.identityPii.delete('sarah');
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
    const invs = await db.invitations.getAll();
    assert.equal(invs.length, 1);
    // Entity landed with a non-empty id.
    assert.ok(invs[0]!.id !== '');
    // State event exists and carries an at.
    const ev = await db.states.getCurrentFor(invs[0]!.id);
    assert.ok(ev !== null);
    assert.ok(ev?.at !== '');
    // Author is server-derived (the actor's identity id).
    assert.equal(ev?.member_id, 'current');
});

test('accept: event author is server-derived, membership lands',
async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await db.invitations.getAll())[0]!;
    const sarah = await ctxOn(db, 'sarah', '1');
    await postInvitationAcceptance(sarah, inv.id);
    // State event landed with a non-empty id + at.
    const ev = await db.states.getCurrentFor(inv.id);
    assert.ok(ev?.id !== '');
    assert.ok(ev?.at !== '');
    // Author is server-derived (the invitee's identity id).
    assert.equal(ev?.member_id, 'sarah');
    // Membership landed at a non-empty id.
    const wayne = (await db.memberships.getAll())
        .filter(m => m.identity_id === 'sarah'
            && m.organization_id === '2');
    assert.equal(wayne.length, 1);
    assert.ok(wayne[0]!.id !== '');
});

test('decline: event author is server-derived', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = (await db.invitations.getAll())[0]!;
    const dave = await ctxOn(db, 'dave', '1');
    await postInvitationDecline(dave, inv.id);
    const ev = await db.states.getCurrentFor(inv.id);
    assert.ok(ev?.id !== '');
    assert.ok(ev?.at !== '');
    // Author is server-derived (the invitee's identity id).
    assert.equal(ev?.member_id, 'dave');
});

test('revoke: event author is server-derived', async () => {
    const { db } = await ctxFor('current', '2');
    const tony = await ctxOn(db, 'current', '2');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = (await db.invitations.getAll())[0]!;
    await postInvitationRevocation(tony, inv.id);
    const ev = await db.states.getCurrentFor(inv.id);
    assert.ok(ev?.id !== '');
    assert.ok(ev?.at !== '');
    // Author is server-derived (the admin's identity id).
    assert.equal(ev?.member_id, 'current');
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
    const inv = (await db.invitations.getAll())[0]!;
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
    const inv = (await db.invitations.getAll())[0]!;
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
    const inv = (await db.invitations.getAll())[0]!;
    await postInvitationRevocation(tony, inv.id);
    assert.equal(posted.length, 2);   // grant, revoke
    await postInvitationRevocation(tony, inv.id);
    assert.equal(posted.length, 2);
});
