import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { pendingInvitationFor } from
    '../api/invitations-domain.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { ORGANIZATION_TWO } from
    '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';

// Phase Final Task 2: invitations ROW half stripped — the
// row/states dual-write oracle is retired. pendingInvitationFor
// is the sole pending discovery path (pair plane). Declined-
// reinvite is the drift pin: a stale DECLINED invitation must
// never be mistaken for the outstanding pending one.

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

test('Step 0: pendingInvitationFor over live grant/decline/'
+ ' re-grant — declined-reinvite is the drift pin (pair plane)',
async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db);
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO);
    const inviteeId = 'LhfaUUf4IumVsCSGB4xjdK'; // Sarah Chen
    const inviteeEmail = 'sarah.chen@company.com';

    // Nothing granted yet: no pending.
    assert.equal(
        await pendingInvitationFor(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        null,
    );

    // Fresh grant: the new invitation is pending.
    const grant = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email: inviteeEmail,
            invitationId: 'inv-dedup-step0-first',
            grantEventId: 'inv-dedup-step0-first-grant',
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(grant.status, 200);
    const afterGrant = await pendingInvitationFor(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterGrant?.id, 'inv-dedup-step0-first');

    // Decline: no longer pending — declined is terminal.
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
        await pendingInvitationFor(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        null,
    );

    // DECLINED-REINVITE (the drift pin): re-granting the SAME
    // (organization, identity) pair mints a SECOND invitation
    // document — the stale declined one must not be mistaken
    // for pending, and the FRESH one must be found as pending.
    const regrant = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email: inviteeEmail,
            invitationId: 'inv-dedup-step0-second',
            grantEventId: 'inv-dedup-step0-second-grant',
            grantAt: '2026-06-01T00:00:02.000000Z',
        },
    ));
    assert.equal(regrant.status, 200);
    const candidates = (await deriveInvitations(db))
        .filter(inv => inv.organization_id === ORGANIZATION_TWO
            && inv.identity_id === inviteeId);
    assert.equal(candidates.length, 2);   // both documents
    const afterRegrant = await pendingInvitationFor(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterRegrant?.id, 'inv-dedup-step0-second');

    // Accept the fresh one: no pending again.
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
        await pendingInvitationFor(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        null,
    );
    // Phase Final Stage B: roster tables retired.
});
