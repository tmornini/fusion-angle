import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
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
const GRANT_TX_TABLES = [
    'requests', 'responses',
];
const ACCEPT_TX_TABLES = [
    'requests', 'responses',
];
const DECLINE_OR_REVOKE_TX_TABLES = [
    'requests', 'responses',
];

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
        'current', ORGANIZATION_TWO);
    const inviteeId = 'LhfaUUf4IumVsCSGB4xjdK'; // Sarah Chen
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    assert.equal(
        await assertPendingWritePathParity(
            db, ORGANIZATION_TWO, inviteeId),
        null,
    );

    const grant = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'inv-parity-write-first',
            grantEventId: 'inv-parity-write-first-grant',
            grantAt: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assert.equal(grant.status, 201);
    const afterGrant = await assertPendingWritePathParity(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterGrant?.id, 'inv-parity-write-first');

    const decline = await handleRequest(db, req(
        'POST',
        '/invitations/inv-parity-write-first/decline',
        inviteeToken, {
            declineEventId: 'inv-parity-write-first-decline',
            declineAt: '2026-06-02T00:00:01.000000Z',
        },
    ));
    assert.equal(decline.status, 201);
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
        'POST', '/invitations', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'inv-parity-write-second',
            grantEventId: 'inv-parity-write-second-grant',
            grantAt: '2026-06-02T00:00:02.000000Z',
        },
    ));
    assert.equal(regrant.status, 201);
    const afterRegrant = await assertPendingWritePathParity(
        db, ORGANIZATION_TWO, inviteeId);
    assert.equal(afterRegrant?.id, 'inv-parity-write-second');
});

test('currentInvitationState: pre-tx vs in-tx agree across'
+ ' pending, accepted, declined, and revoked, each over its own'
+ ' write-gate\'s own table list', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO);

    async function grant(
        id: string, email: string, at: string,
    ): Promise<void> {
        const res = await handleRequest(db, req(
            'POST', '/invitations', admin, {
                email, invitationId: id,
                grantEventId: id + '-grant', grantAt: at,
            },
        ));
        assert.equal(res.status, 201);
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
        'inv-parity-write-pending', 'sarah.chen@company.com',
        '2026-06-03T00:00:00.000000Z',
    );
    assert.equal(
        await assertStateWritePathParity(
            'inv-parity-write-pending', ACCEPT_TX_TABLES,
        ),
        'pending',
    );

    // accepted — Jessica Park.
    await grant(
        'inv-parity-write-accepted', 'jessica.park@company.com',
        '2026-06-03T00:00:01.000000Z',
    );
    const jessicaId = 'zyTbfbjcGEfbpCsNTP0XjX';
    const jessicaToken = await organizationToken(
        jessicaId, ORGANIZATION_TWO);
    const accept = await handleRequest(db, req(
        'POST',
        '/invitations/inv-parity-write-accepted/acceptance',
        jessicaToken, {
            membershipId: 'inv-parity-write-accepted-ms',
            acceptEventId: 'inv-parity-write-accepted-accept',
            acceptAt: '2026-06-03T00:00:02.000000Z',
        },
    ));
    assert.equal(accept.status, 201);
    assert.equal(
        await assertStateWritePathParity(
            'inv-parity-write-accepted', ACCEPT_TX_TABLES,
        ),
        'accepted',
    );

    // declined — Emily Rodriguez.
    await grant(
        'inv-parity-write-declined',
        'emily.rodriguez@company.com',
        '2026-06-03T00:00:03.000000Z',
    );
    const emilyId = '53J8h9dr76XFqCjYcNVwIR';
    const emilyToken = await organizationToken(
        emilyId, ORGANIZATION_TWO);
    const decline = await handleRequest(db, req(
        'POST',
        '/invitations/inv-parity-write-declined/decline',
        emilyToken, {
            declineEventId: 'inv-parity-write-declined-decline',
            declineAt: '2026-06-03T00:00:04.000000Z',
        },
    ));
    assert.equal(decline.status, 201);
    assert.equal(
        await assertStateWritePathParity(
            'inv-parity-write-declined',
            DECLINE_OR_REVOKE_TX_TABLES,
        ),
        'declined',
    );

    // revoked — Marcus Johnson.
    await grant(
        'inv-parity-write-revoked', 'marcus@acmecorp.com',
        '2026-06-03T00:00:05.000000Z',
    );
    const revoke = await handleRequest(db, req(
        'POST',
        '/invitations/inv-parity-write-revoked/revocation',
        admin, {
            revokeEventId: 'inv-parity-write-revoked-revoke',
            revokeAt: '2026-06-03T00:00:06.000000Z',
        },
    ));
    assert.equal(revoke.status, 201);
    assert.equal(
        await assertStateWritePathParity(
            'inv-parity-write-revoked',
            DECLINE_OR_REVOKE_TX_TABLES,
        ),
        'revoked',
    );

    // A never-granted id, same parity.
    assert.equal(
        await assertStateWritePathParity(
            'no-such-invitation', ACCEPT_TX_TABLES,
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
        'current', ORGANIZATION_TWO);
    const inviteeId = 'LhfaUUf4IumVsCSGB4xjdK'; // Sarah Chen
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    assert.equal(
        await assertMembershipExistsWritePathParity(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        false,
    );

    const grant = await handleRequest(db, req(
        'POST', '/invitations', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'inv-parity-membership-exists',
            grantEventId: 'inv-parity-membership-exists-grant',
            grantAt: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assert.equal(grant.status, 201);

    const accept = await handleRequest(db, req(
        'POST',
        '/invitations/inv-parity-membership-exists/acceptance',
        inviteeToken, {
            membershipId: 'inv-parity-membership-exists-ms',
            acceptEventId: 'inv-parity-membership-exists-accept',
            acceptAt: '2026-06-04T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 201);

    assert.equal(
        await assertMembershipExistsWritePathParity(
            db, ORGANIZATION_TWO, inviteeId,
        ),
        true,
    );
});
