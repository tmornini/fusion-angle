import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { pendingInvitationFor } from
    '../api/invitations-domain.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { ORGANIZATION_TWO } from
    '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_DEDUP_STEP0_FIRST_GRANT = generateIdentifier();
const INV_DEDUP_STEP0_FIRST_DECLINE = generateIdentifier();
const INV_DEDUP_STEP0_SECOND_GRANT = generateIdentifier();
const INV_DEDUP_STEP0_SECOND_MS = generateIdentifier();
const INV_DEDUP_STEP0_SECOND_ACCEPT = generateIdentifier();

// Phase Final Task 2: invitations ROW half stripped — the
// row-plus-lifecycle dual-write oracle is retired.
// pendingInvitationFor is the sole pending discovery path
// (message plane). Declined-reinvite is the drift pin: a stale
// DECLINED invitation must never be mistaken for the
// outstanding pending one.

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

Deno.test('Step 0: pendingInvitationFor over live grant/decline/'
+ ' re-grant — declined-reinvite is the drift pin (message'
+ ' plane)',
async () => {
    const db = await seededMockDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    const inviteeEmail = 'sarah.chen@company.com';

    // Nothing granted yet: no pending.
    assertStrictEquals(
        await pendingInvitationFor(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        null,
    );

    // Fresh grant: the new invitation is pending.
    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: inviteeEmail,
            invitationId: 'hhLDowecKAZZsoTcnjSQrg',
            grantEventId: INV_DEDUP_STEP0_FIRST_GRANT,
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 200);
    const afterGrant = await pendingInvitationFor(
        db, ORGANIZATION_TWO, inviteeId);
    assertStrictEquals(afterGrant?.id, 'hhLDowecKAZZsoTcnjSQrg');

    // Decline: no longer pending — declined is terminal.
    const invitee = await organizationToken(
        inviteeId, ORGANIZATION_TWO);
    const decline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/hhLDowecKAZZsoTcnjSQrg',
        invitee,
        {
            state: 'declined',
            eventId: INV_DEDUP_STEP0_FIRST_DECLINE,
            at: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(decline.status, 204);
    assertStrictEquals(
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
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: inviteeEmail,
            invitationId: 'hjPGoZqbkGJVvYQFoLWXCA',
            grantEventId: INV_DEDUP_STEP0_SECOND_GRANT,
            grantAt: '2026-06-01T00:00:02.000000Z',
        },
    ));
    assertStrictEquals(regrant.status, 200);
    const candidates = (await deriveInvitations(db))
        .filter(inv => inv.organization_id === ORGANIZATION_TWO
            && inv.identity_id === inviteeId);
    assertStrictEquals(candidates.length, 2);   // both documents
    const afterRegrant = await pendingInvitationFor(
        db, ORGANIZATION_TWO, inviteeId);
    assertStrictEquals(afterRegrant?.id, 'hjPGoZqbkGJVvYQFoLWXCA');

    // Accept the fresh one: no pending again.
    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/hjPGoZqbkGJVvYQFoLWXCA',
        invitee,
        {
            state: 'accepted',
            membershipId: INV_DEDUP_STEP0_SECOND_MS,
            eventId: INV_DEDUP_STEP0_SECOND_ACCEPT,
            at: '2026-06-01T00:00:03.000000Z',
        },
    ));
    assertStrictEquals(accept.status, 204);
    assertStrictEquals(
        await pendingInvitationFor(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        null,
    );
    // Phase Final Stage B: roster tables retired.
});
