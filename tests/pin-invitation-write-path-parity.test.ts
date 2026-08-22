import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import {
    pendingInvitationFor,
    currentInvitationState,
} from '../api/invitations-domain.ts';
import { membershipExistsFor } from '../api/derive-memberships.ts';
import { ORGANIZATION_TWO } from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_PARITY_WRITE_FIRST_GRANT = generateIdentifier();
const INV_PARITY_WRITE_FIRST_DECLINE = generateIdentifier();
const INV_PARITY_WRITE_SECOND = generateIdentifier();
const INV_PARITY_WRITE_SECOND_GRANT = generateIdentifier();
const INV_PARITY_WRITE_PENDING = generateIdentifier();
const INV_PARITY_WRITE_ACCEPTED_MS = generateIdentifier();
const INV_PARITY_WRITE_ACCEPTED_ACCEPT = generateIdentifier();
const INV_PARITY_WRITE_DECLINED_DECLINE = generateIdentifier();
const INV_PARITY_WRITE_REVOKED_REVOKE = generateIdentifier();
const NO_SUCH_INVITATION = generateIdentifier();
const INV_PARITY_MEMBERSHIP_EXISTS_GRANT = generateIdentifier();
const INV_PARITY_MEMBERSHIP_EXISTS_MS = generateIdentifier();
const INV_PARITY_MEMBERSHIP_EXISTS_ACCEPT = generateIdentifier();
const ID_GRANT = generateIdentifier();

// Phase 14 Task 2 commit 3: the write-path pre-tx-vs-in-tx
// parity pin. grantInvitation calls pendingInvitationFor (via
// grantOutcomeFor) BOTH pre-tx (to decide the response) and
// in-tx (the `agrees` re-check); acceptInvitation/
// declineInvitation/revokeInvitation each call
// currentInvitationState only in-tx today. This file proves
// BOTH flipped functions return the SAME result pre-tx (the
// plain adapter) and in-tx (an open db.transaction view sharing
// the EXACT table list their own write-gate caller uses) — the
// membershipExistsFor / drift-phase14-cores-parity.test.ts
// precedent, applied to the write-path functions themselves
// (both now exported for this purpose) rather than the raw
// Task 1 cores beneath them. "The SAME derivation" is thereby a
// proven property, not a coincidence.
//
// Phase 14 Task 3 ADDS to this proof: acceptInvitation's own
// `already`-membership gate now calls membershipExistsFor
// in-tx (api/invitations-domain.ts), so this file's own
// ACCEPT_TX_TABLES list is the flipped check's REAL table set,
// not a stand-in — the parity test below proves the pair-plane
// derive is honest under acceptInvitation's own transaction
// shape, both before a membership exists and after one lands.

const BASE = 'http://localhost';

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

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// The exact table lists grantInvitation/acceptInvitation/
// declineInvitation/revokeInvitation open their own write-gate
// transaction over (api/invitations-domain.ts). Phase Final
// Task 2: invitations + memberships ROW halves stripped;
// states stays until states-trace.
const GRANT_TX_TABLES = MESSAGE_TABLES;
const ACCEPT_TX_TABLES = MESSAGE_TABLES;
const DECLINE_OR_REVOKE_TX_TABLES = MESSAGE_TABLES;

async function assertPendingWritePathParity(
    db: MemoryDbAdapter,
    organization: string,
    identityId: string,
): Promise<{ id: string; at: string } | null> {
    const preTx = await pendingInvitationFor(
        db, organization, identityId);
    const inTx = await db.transaction(
        GRANT_TX_TABLES,
        (view) => pendingInvitationFor(
            view, organization, identityId),
    );
    assert.deepEqual(inTx, preTx);
    return preTx;
}

test('pendingInvitationFor: pre-tx vs in-tx (grantInvitation\'s'
+ ' own table list) agree across a fresh grant, a decline, and'
+ ' a declined-reinvite (multi-candidate)', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    assert.equal(
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
    assert.equal(grant.status, 200);
    const afterGrant = await assertPendingWritePathParity(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterGrant?.id, 'iUFAcBfktmuASnGGNrPCKw');

    const decline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/iUFAcBfktmuASnGGNrPCKw',
        inviteeToken, {
            state: 'declined',
            eventId: INV_PARITY_WRITE_FIRST_DECLINE,
            at: '2026-06-02T00:00:01.000000Z',
        },
    ));
    assert.equal(decline.status, 204);
    assert.equal(
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
    assert.equal(regrant.status, 200);
    const afterRegrant = await assertPendingWritePathParity(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterRegrant?.id, INV_PARITY_WRITE_SECOND);
});

test('currentInvitationState: pre-tx vs in-tx agree across'
+ ' pending, accepted, declined, and revoked, each over its own'
+ ' write-gate\'s own table list', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);

    async function grant(
        id: string, email: string, at: string,
    ): Promise<void> {
        const res = await handleRequest(db, req(
            'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
                email, invitationId: id,
                grantEventId: ID_GRANT, grantAt: at,
            },
        ));
        assert.equal(res.status, 200);
    }

    async function assertStateWritePathParity(
        id: string, tables: readonly string[],
    ): Promise<string | null> {
        const preTx = await currentInvitationState(db, id);
        const inTx = await db.transaction(
            tables,
            (view) => currentInvitationState(view, id),
        );
        assert.equal(inTx, preTx);
        return preTx;
    }

    // pending — Sarah Chen, granted, left untouched.
    await grant(
        INV_PARITY_WRITE_PENDING, 'sarah.chen@company.com',
        '2026-06-03T00:00:00.000000Z',
    );
    assert.equal(
        await assertStateWritePathParity(
            INV_PARITY_WRITE_PENDING, ACCEPT_TX_TABLES,
        ),
        'pending',
    );

    // accepted — Jessica Park.
    await grant(
        'iOhteLyCdhnLqTaeGYCoYQ', 'jessica.park@company.com',
        '2026-06-03T00:00:01.000000Z',
    );
    const jessicaId = 'zyGBRshxOnKHUfcyFRqowg';
    const jessicaToken = await organizationToken(
        jessicaId, ORGANIZATION_TWO);
    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + jessicaId
            + '/invitations/iOhteLyCdhnLqTaeGYCoYQ',
        jessicaToken, {
            state: 'accepted',
            membershipId: INV_PARITY_WRITE_ACCEPTED_MS,
            eventId: INV_PARITY_WRITE_ACCEPTED_ACCEPT,
            at: '2026-06-03T00:00:02.000000Z',
        },
    ));
    assert.equal(accept.status, 204);
    assert.equal(
        await assertStateWritePathParity(
            'iOhteLyCdhnLqTaeGYCoYQ', ACCEPT_TX_TABLES,
        ),
        'accepted',
    );

    // declined — Emily Rodriguez.
    await grant(
        'iPxNOWCigMcIYgqchAefWA',
        'emily.rodriguez@company.com',
        '2026-06-03T00:00:03.000000Z',
    );
    const emilyId = 'CJrglMsNBxOWWfbihHQSeg';
    const emilyToken = await organizationToken(
        emilyId, ORGANIZATION_TWO);
    const decline = await handleRequest(db, req(
        'PUT',
        '/identities/' + emilyId
            + '/invitations/iPxNOWCigMcIYgqchAefWA',
        emilyToken, {
            state: 'declined',
            eventId: INV_PARITY_WRITE_DECLINED_DECLINE,
            at: '2026-06-03T00:00:04.000000Z',
        },
    ));
    assert.equal(decline.status, 204);
    assert.equal(
        await assertStateWritePathParity(
            'iPxNOWCigMcIYgqchAefWA',
            DECLINE_OR_REVOKE_TX_TABLES,
        ),
        'declined',
    );

    // revoked — Marcus Johnson.
    await grant(
        'iZisVMKVGRGkyLzjwyTjow', 'marcus@acmecorp.com',
        '2026-06-03T00:00:05.000000Z',
    );
    const revoke = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/invitations/iZisVMKVGRGkyLzjwyTjow',
        admin, {
            state: 'revoked',
            eventId: INV_PARITY_WRITE_REVOKED_REVOKE,
            at: '2026-06-03T00:00:06.000000Z',
        },
    ));
    assert.equal(revoke.status, 204);
    assert.equal(
        await assertStateWritePathParity(
            'iZisVMKVGRGkyLzjwyTjow',
            DECLINE_OR_REVOKE_TX_TABLES,
        ),
        'revoked',
    );

    // A never-granted id, same parity.
    assert.equal(
        await assertStateWritePathParity(
            NO_SUCH_INVITATION, ACCEPT_TX_TABLES,
        ),
        null,
    );
});

async function assertMembershipExistsWritePathParity(
    db: MemoryDbAdapter,
    organization: string,
    identityId: string,
): Promise<boolean> {
    const preTx = await membershipExistsFor(
        db, organization, identityId);
    const inTx = await db.transaction(
        ACCEPT_TX_TABLES,
        (view) => membershipExistsFor(
            view, organization, identityId),
    );
    assert.equal(inTx, preTx);
    return preTx;
}

test('membershipExistsFor: pre-tx vs in-tx (acceptInvitation\'s'
+ " own table list) agree before and after a live accept — the"
+ ' `already` gate\'s derived row source, held honest', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    assert.equal(
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
    assert.equal(grant.status, 200);

    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/iJbzDBDkWJrjxankczlJEQ',
        inviteeToken, {
            state: 'accepted',
            membershipId: INV_PARITY_MEMBERSHIP_EXISTS_MS,
            eventId: INV_PARITY_MEMBERSHIP_EXISTS_ACCEPT,
            at: '2026-06-04T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 204);

    assert.equal(
        await assertMembershipExistsWritePathParity(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        true,
    );

    const seatPrefix = '/organizations/'
        + ORGANIZATION_TWO + '/members/';
    const seatRows = await db.pairs.getAllWhere(
        'uri_collection', seatPrefix,
    );
    assert.equal(
        seatRows.some((row) => row.uri_id === inviteeId
            && row.operation_id === TEST_OPERATION_ID),
        true,
    );
});
