import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id } from '../api/types.ts';
import { assertInvitationState } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { pendingInvitationFor } from '../api/invitations-domain.ts';
import { ORGANIZATION_TWO } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';

// Phase 14 Task 2, Step 0 (TDD — this equivalence is proven
// BEFORE currentInvitationState's own flip, commit 2): proves
// pending-from-pairs (pendingInvitationFor's NEW body, api/
// invitations-domain.ts, already flipped in this same commit)
// agrees with pending-from-states (the OLD row-plane derivation
// it replaces, kept here ONLY as a permanent oracle — it exists
// nowhere in production anymore) over a LIVE grant/decline/
// re-grant sequence. Declined-reinvite is the drift pin (Author
// gate 2; tests/adapters-invitations.test.ts's own "re-inviting a
// declined invitee mints a fresh invitation" pin): a stale
// DECLINED invitation row must never be mistaken for the
// outstanding pending one on EITHER plane, so a re-grant to the
// same (organization, identity) pair sees "no pending invite" on
// both and mints a genuinely fresh id.

async function pendingFromStates(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<{ id: Id; at: string } | null> {
    const candidates = (await db.invitations.getAll())
        .filter(inv => inv.organization_id === organization
            && inv.identity_id === identityId);
    const latest = latestByKey(
        await db.states.getAll(), ev => ev.entity_id);
    for (const inv of candidates) {
        const current = latest.get(inv.id);
        if (current === undefined) continue;
        const state = assertInvitationState(
            current.state, 'invitation ' + inv.id);
        if (state === 'pending') {
            return { id: inv.id, at: inv.at };
        }
    }
    return null;
}

async function assertPendingParity(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<{ id: Id; at: string } | null> {
    const fromStates = await pendingFromStates(
        db, organization, identityId);
    const fromPairs = await pendingInvitationFor(
        db, organization, identityId);
    assert.deepEqual(fromPairs, fromStates);
    return fromStates;
}

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
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

test('Step 0: pending-from-pairs ≡ pending-from-states over'
+ ' live grant/decline/re-grant — declined-reinvite is the'
+ ' drift pin', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO);
    const inviteeId = 'LhfaUUf4IumVsCSGB4xjdK'; // Sarah Chen
    const inviteeEmail = 'sarah.chen@company.com';

    // Nothing granted yet: both derivations agree on "no pending".
    assert.equal(
        await assertPendingParity(db, ORGANIZATION_TWO, inviteeId),
        null,
    );

    // Fresh grant: both derivations agree the new row is pending.
    const grant = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email: inviteeEmail,
            invitationId: 'inv-dedup-step0-first',
            grantEventId: 'inv-dedup-step0-first-grant',
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(grant.status, 200);
    const afterGrant = await assertPendingParity(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterGrant?.id, 'inv-dedup-step0-first');

    // Decline: both derivations agree the invitation is no
    // longer pending — declined is terminal.
    const invitee = await organizationToken(
        inviteeId, ORGANIZATION_TWO);
    const decline = await handleRequest(db, req(
        'POST',
        '/invitations/inv-dedup-step0-first/decline',
        invitee,
        {
            declineEventId: 'inv-dedup-step0-first-decline',
            declineAt: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(decline.status, 204);
    assert.equal(
        await assertPendingParity(db, ORGANIZATION_TWO, inviteeId),
        null,
    );

    // DECLINED-REINVITE (the drift pin): re-granting the SAME
    // (organization, identity) pair mints a SECOND invitation
    // row — the stale declined row must not be mistaken for
    // pending on either plane, and the FRESH row must be found
    // as pending on both.
    const regrant = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email: inviteeEmail,
            invitationId: 'inv-dedup-step0-second',
            grantEventId: 'inv-dedup-step0-second-grant',
            grantAt: '2026-06-01T00:00:02.000000Z',
        },
    ));
    assert.equal(regrant.status, 200);
    const candidates = (await db.invitations.getAll())
        .filter(inv => inv.organization_id === ORGANIZATION_TWO
            && inv.identity_id === inviteeId);
    assert.equal(candidates.length, 2);   // both rows co-exist
    const afterRegrant = await assertPendingParity(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterRegrant?.id, 'inv-dedup-step0-second');

    // Accept the fresh one: both derivations agree "no pending"
    // again.
    const accept = await handleRequest(db, req(
        'POST',
        '/invitations/inv-dedup-step0-second/acceptance',
        invitee,
        {
            membershipId: 'inv-dedup-step0-second-ms',
            acceptEventId: 'inv-dedup-step0-second-accept',
            acceptAt: '2026-06-01T00:00:03.000000Z',
        },
    ));
    assert.equal(accept.status, 204);
    assert.equal(
        await assertPendingParity(db, ORGANIZATION_TWO, inviteeId),
        null,
    );
});
