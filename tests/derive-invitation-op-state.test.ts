import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { Id } from '../api/types.ts';
import { assertInvitationState } from '../api/types.ts';
import { invitationOpStateFor } from '../api/derive-invitations.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// The Phase 14 Task 1 core: invitationOpStateFor is the ENTITY-
// SCOPED sibling of the whole-ledger-scanning (private)
// invitationOpStates — three indexed getAllWhere('uri_collection',
// ...) reads (one per op kind) instead of a db.pairs.getAll()
// walk. This file proves it correct against the ROW-PLANE
// (states table) currentInvitationState reproduces, over three
// live lifecycles (accept/decline/revoke) plus the never-
// answered (pending) and never-granted (unknown id) cases. No
// write path reads this core yet — Task 1 flips nothing.

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

// The row-plane reproduction of currentInvitationState's OWN
// pending-default fold (api/invitations-domain.ts, module-
// private): 'pending' or an absent event both resolve to
// undefined here, matching invitationOpStateFor's own "no
// terminal op yet" contract — mirror the algorithm, never the
// privacy (the drift-memberships-identity.test.ts leg-4
// precedent).
async function rowPlaneOpState(
    db: MemoryDbAdapter, id: Id,
): Promise<string | undefined> {
    const { invitationLifecycleStatesFor } = await import(
        '../api/derive-states.ts'
    );
    const rows = await invitationLifecycleStatesFor(db, id);
    if (rows.length === 0) return undefined;
    const latest = [...rows].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    if (latest.state === 'pending') {
        return undefined;
    }
    return assertInvitationState(latest.state, 'invitation ' + id);
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email: string,
): Promise<void> {
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email,
            invitationId,
            grantEventId: invitationId + '-grant',
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 200);
}

test('invitationOpStateFor: pending (granted, unanswered)'
+ ' derives undefined, matching the row-plane pending default',
async () => {
    const db = await seededDb();
    const id = 'inv-opstate-pending';
    await grant(db, id, 'sarah.chen@company.com');

    assert.equal(
        await invitationOpStateFor(db, id), undefined,
    );
    assert.equal(
        await invitationOpStateFor(db, id),
        await rowPlaneOpState(db, id),
    );
});

test('invitationOpStateFor: accepted derives \'accepted\','
+ ' matching the row-plane current state', async () => {
    const db = await seededDb();
    const id = 'inv-opstate-accepted';
    const inviteeId = 'LhfaUUf4IumVsCSGB4xjdK'; // Sarah Chen
    await grant(db, id, 'sarah.chen@company.com');

    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'accepted',
            membershipId: id + '-ms',
            eventId: id + '-accept',
            at: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(accept.status, 204);

    assert.equal(await invitationOpStateFor(db, id), 'accepted');
    assert.equal(
        await invitationOpStateFor(db, id),
        await rowPlaneOpState(db, id),
    );
});

test('invitationOpStateFor: declined derives \'declined\','
+ ' matching the row-plane current state', async () => {
    const db = await seededDb();
    const id = 'inv-opstate-declined';
    const inviteeId = 'zyTbfbjcGEfbpCsNTP0XjX'; // Jessica Park
    await grant(db, id, 'jessica.park@company.com');

    const decline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'declined',
            eventId: id + '-decline',
            at: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(decline.status, 204);

    assert.equal(await invitationOpStateFor(db, id), 'declined');
    assert.equal(
        await invitationOpStateFor(db, id),
        await rowPlaneOpState(db, id),
    );
});

test('invitationOpStateFor: revoked derives \'revoked\','
+ ' matching the row-plane current state', async () => {
    const db = await seededDb();
    const id = 'inv-opstate-revoked';
    await grant(db, id, 'emily.rodriguez@company.com');

    const revoke = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + id,
        await organizationToken('current', ORGANIZATION_TWO),
        {
            state: 'revoked',
            eventId: id + '-revoke',
            at: '2026-06-01T00:00:01.000000Z',
        },
    ));
    assert.equal(revoke.status, 204);

    assert.equal(await invitationOpStateFor(db, id), 'revoked');
    assert.equal(
        await invitationOpStateFor(db, id),
        await rowPlaneOpState(db, id),
    );
});

test('invitationOpStateFor: a never-granted id derives'
+ ' undefined, no throw', async () => {
    const db = await seededDb();
    await assert.doesNotReject(
        () => invitationOpStateFor(db, 'no-such-invitation'),
    );
    assert.equal(
        await invitationOpStateFor(db, 'no-such-invitation'),
        undefined,
    );
});
