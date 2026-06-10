import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    validateInvitationEntity,
} from '../api/validators.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { orgToken } from './token-fixtures.ts';
import { orgRow } from './test-fixtures.ts';
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
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.organizations.put('1', orgRow('Stark'));
    await db.organizations.put('2', orgRow('Wayne'));
    for (const org of ['1', '2']) {
        await db.roleGrants.put('rg-current-' + org, {
            organization_id: org, identity_id: 'current',
            role: 'admin', action: 'granted',
            by_member_id: 'system', at: AT,
        });
        await db.memberships.put('m-current-' + org, {
            organization_id: org, identity_id: 'current',
            at: AT,
        });
    }
    await seedPerson(db, 'current', 'Tony', 'demo@example.com');
    await seedPerson(db, 'sarah', 'Sarah', 'sarah@x.com');
    await db.memberships.put('m-sarah-1', {
        organization_id: '1', identity_id: 'sarah', at: AT,
    });
    await seedPerson(db, 'dave', 'Dave', 'dave@x.com');
    return db;
}

async function seedPerson(
    db: MemoryDbAdapter,
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

async function ctxFor(sub: string, org: string) {
    const db = await seed();
    const ctx = createRequestContext(db, await orgToken(sub, org));
    return { db, ctx };
}

// A context bound to an existing db (for two actors in one test).
async function ctxOn(db: DbAdapter, sub: string, org: string) {
    return createRequestContext(db, await orgToken(sub, org));
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
    await db.createSchema();
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
    const state = await db.states.currentFor(rows[0]!.id);
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
    const orgs = memberships.map(m => m.organization_id).sort();
    assert.deepEqual(orgs, ['1', '2']);
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
