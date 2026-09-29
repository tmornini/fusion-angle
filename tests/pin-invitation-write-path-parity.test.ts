import { assertEquals, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    pendingInvitationFor,
} from '../api/invitations-domain.ts';
import { membershipExistsFor } from '../api/derive-memberships.ts';
import { ORGANIZATION_TWO } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_PARITY_WRITE_FIRST_GRANT = generateIdentifier();
const INV_PARITY_WRITE_FIRST_DECLINE = generateIdentifier();
const INV_PARITY_WRITE_SECOND = generateIdentifier();
const INV_PARITY_WRITE_SECOND_GRANT = generateIdentifier();
const INV_PARITY_MEMBERSHIP_EXISTS_GRANT = generateIdentifier();
const INV_PARITY_MEMBERSHIP_EXISTS_MS = generateIdentifier();
const INV_PARITY_MEMBERSHIP_EXISTS_ACCEPT = generateIdentifier();

// Phase 14 Task 2 commit 3: the write-path pre-tx-vs-in-tx
// parity pin. grantInvitation calls pendingInvitationFor (via
// grantOutcomeFor) pre-tx alone, to decide the response; the
// statement's nil latch judges a taken invitation id.
// acceptInvitation/declineInvitation/revokeInvitation read the
// invitation's head before their statement, which judges the
// client's tag; none opens a transaction. This file proves
// pendingInvitationFor returns the SAME result pre-tx (the
// plain adapter) and in-tx (an open read-transaction view, as
// the pre-state-by-PUT transactions read them) — the
// membershipExistsFor / drift-phase14-cores-parity.test.ts
// precedent, applied to the write-path function itself
// rather than the raw Task 1 cores beneath it. "The SAME
// derivation" is thereby a proven property, not a
// coincidence.
//
// Phase 14 Task 3 ADDS to this proof: acceptInvitation's own
// `already`-membership check calls membershipExistsFor before
// its statement (api/invitations-domain.ts); the parity test
// below proves the message-plane derive agrees pre-tx and
// in-tx, both before a membership exists and after one lands.

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// pendingInvitationFor read plainly and inside a read
// transaction must agree; the transitions open no
// transaction of their own (api/invitations-domain.ts).
async function assertPendingWritePathParity(
    db: MemoryDbAdapter,
    organization: string,
    identityId: string,
): Promise<{ id: string; at: string } | null> {
    const preTx = await pendingInvitationFor(
        db, organization, identityId);
    const inTx = await db.readTransaction(
        (view) => pendingInvitationFor(
            view, organization, identityId),
    );
    assertEquals(inTx, preTx);
    return preTx;
}

Deno.test('pendingInvitationFor: pre-tx vs in-tx agree across'
+ ' a fresh grant, a decline, and a declined-reinvite'
+ ' (multi-candidate)', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    assertStrictEquals(
        await assertPendingWritePathParity(
            db, ORGANIZATION_TWO, inviteeId),
        null,
    );

    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'iUFAcBfktmuASnGGNrPCKw',
            grantEventId: INV_PARITY_WRITE_FIRST_GRANT,
            grantAt: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 201);
    const afterGrant = await assertPendingWritePathParity(
        db, ORGANIZATION_TWO, inviteeId);
    assertStrictEquals(afterGrant?.id, 'iUFAcBfktmuASnGGNrPCKw');

    const decline = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/iUFAcBfktmuASnGGNrPCKw',
        inviteeToken, {
            state: 'declined',
            eventId: INV_PARITY_WRITE_FIRST_DECLINE,
            at: '2026-06-02T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(decline.status, 200);
    assertStrictEquals(
        await assertPendingWritePathParity(
            db, ORGANIZATION_TWO, inviteeId),
        null,
    );

    // Declined-reinvite: a SECOND candidate row now exists for
    // the same (organization, identity) pair — the multi-
    // candidate case pendingInvitationFor's loop must resolve
    // identically pre-tx and in-tx.
    const regrant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: INV_PARITY_WRITE_SECOND,
            grantEventId: INV_PARITY_WRITE_SECOND_GRANT,
            grantAt: '2026-06-02T00:00:02.000000Z',
        },
    ));
    assertStrictEquals(regrant.status, 201);
    const afterRegrant = await assertPendingWritePathParity(
        db, ORGANIZATION_TWO, inviteeId);
    assertStrictEquals(afterRegrant?.id, INV_PARITY_WRITE_SECOND);
});

async function assertMembershipExistsWritePathParity(
    db: MemoryDbAdapter,
    organization: string,
    identityId: string,
): Promise<boolean> {
    const preTx = await membershipExistsFor(
        db, organization, identityId);
    const inTx = await db.readTransaction(
        (view) => membershipExistsFor(
            view, organization, identityId),
    );
    assertStrictEquals(inTx, preTx);
    return preTx;
}

Deno.test('membershipExistsFor: pre-tx vs in-tx agree before and'
+ ' after a live accept — the `already` check\'s derived row'
+ ' source, held honest', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    assertStrictEquals(
        await assertMembershipExistsWritePathParity(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        false,
    );

    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'iJbzDBDkWJrjxankczlJEQ',
            grantEventId: INV_PARITY_MEMBERSHIP_EXISTS_GRANT,
            grantAt: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 201);

    const operationId = generateIdentifier();
    const accept = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/iJbzDBDkWJrjxankczlJEQ',
        inviteeToken, {
            state: 'accepted',
            membershipId: INV_PARITY_MEMBERSHIP_EXISTS_MS,
            eventId: INV_PARITY_MEMBERSHIP_EXISTS_ACCEPT,
            at: '2026-06-04T00:00:01.000000Z',
        },
        operationId,
    )));
    assertStrictEquals(accept.status, 200);

    assertStrictEquals(
        await assertMembershipExistsWritePathParity(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        true,
    );

    const seatPrefix = '/organizations/'
        + ORGANIZATION_TWO + '/members/';
    const seatRows = await db.messagePairs.getCollectionPairs(seatPrefix,
    );
    assertStrictEquals(
        seatRows.some((row) => row.name === inviteeId
            && row.operation_id === operationId),
        true,
    );
});
