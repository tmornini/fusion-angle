import { assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { membershipOf } from '../api/memberships.ts';
import { ORGANIZATION_TWO } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

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
// membershipExistsFor precedent, applied to the write-path
// function itself. "The SAME derivation" is thereby a proven
// property, not a coincidence.
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

async function assertMembershipExistsWritePathParity(
    db: MemoryDbAdapter,
    organization: string,
    identityId: string,
): Promise<boolean> {
    const pre = await membershipOf(
        db, organization, identityId);
    const inside = await db.readTransaction(
        (view) => membershipOf(
            view, organization, identityId),
    );
    const preTx = pre !== null;
    const inTx = inside !== null;
    assertStrictEquals(inTx, preTx);
    return preTx;
}

Deno.test('membershipOf: pre-tx vs in-tx agree before and'
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

    const name = membershipNameOf(ORGANIZATION_TWO, inviteeId);
    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            grantAt: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 201);

    const operationId = generateIdentifier();
    const accept = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + inviteeId
                + '/invitations/' + name,
            inviteeToken, {
                state: 'accepted',
                at: '2026-06-04T00:00:01.000000Z',
            },
            operationId,
        )),
    );
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
    assertStrictEquals(seatRows.length, 0);
});
