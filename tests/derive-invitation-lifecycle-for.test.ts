import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    deriveInvitationStates,
    invitationLifecycleStatesFor,
} from '../api/derive-states.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// The Phase 14 Task 1 core: invitationLifecycleStatesFor is the
// ENTITY-SCOPED sibling of deriveInvitationStates — INDEXED
// getAllWhere reads (uri_id for the grant/document pair,
// uri_collection per op address) restricted to ONE known invitation
// id, rather than the whole-collection + whole-ledger scans the
// multi-invitation reader needs to DISCOVER every id. This file
// proves it byte-identical to deriveInvitationStates's own
// per-entity subset. No write path reads this core yet — Task 1
// flips nothing.

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

async function bulkRowsFor(
    db: MemoryDbAdapter, id: string,
): Promise<unknown[]> {
    return (await deriveInvitationStates(db))
        .filter((row) => row.entity_id === id)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

test('invitationLifecycleStatesFor: pending-only (granted,'
+ ' unanswered) matches deriveInvitationStates\'s own subset',
async () => {
    const db = await seededDb();
    const id = 'inv-lifecycle-pending';
    await grant(db, id, 'sarah.chen@company.com');

    const scoped = await invitationLifecycleStatesFor(db, id);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]!.state, 'pending');
    assert.equal(scoped[0]!.id, id + '-grant');
    assert.deepEqual(scoped, await bulkRowsFor(db, id));
});

test('invitationLifecycleStatesFor: accepted carries both the'
+ ' pending and accepted rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = 'inv-lifecycle-accepted';
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

    const scoped = await invitationLifecycleStatesFor(db, id);
    assert.equal(scoped.length, 2);
    assert.deepEqual(
        scoped.map((row) => row.state).sort(),
        ['accepted', 'pending'],
    );
    assert.deepEqual(scoped, await bulkRowsFor(db, id));
});

test('invitationLifecycleStatesFor: declined carries both the'
+ ' pending and declined rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = 'inv-lifecycle-declined';
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

    const scoped = await invitationLifecycleStatesFor(db, id);
    assert.equal(scoped.length, 2);
    assert.deepEqual(
        scoped.map((row) => row.state).sort(),
        ['declined', 'pending'],
    );
    assert.deepEqual(scoped, await bulkRowsFor(db, id));
});

test('invitationLifecycleStatesFor: revoked carries both the'
+ ' pending and revoked rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = 'inv-lifecycle-revoked';
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

    const scoped = await invitationLifecycleStatesFor(db, id);
    assert.equal(scoped.length, 2);
    assert.deepEqual(
        scoped.map((row) => row.state).sort(),
        ['pending', 'revoked'],
    );
    assert.deepEqual(scoped, await bulkRowsFor(db, id));
});

test('invitationLifecycleStatesFor: a never-granted id derives'
+ ' an empty array, no throw', async () => {
    const db = await seededDb();
    await assert.doesNotReject(
        () => invitationLifecycleStatesFor(db, 'no-such-invite'),
    );
    assert.deepEqual(
        await invitationLifecycleStatesFor(db, 'no-such-invite'),
        [],
    );
});

// -- the phantom-echo exclusion (finding 1: "Document existence --
// -- is the grant proof") ----------------------------------------

test('invitationLifecycleStatesFor: a duplicate-grant\'s'
+ ' PHANTOM echo id (an operation pair with no document) derives'
+ ' an EMPTY array — never a false \'pending\' row', async () => {
    const db = await seededDb();
    const freshId = 'inv-lifecycle-phantom-fresh';
    await grant(db, freshId, 'sarah.chen@company.com');

    // A second grant for the SAME (org, identity) pair, submitted
    // with a DIFFERENT invitationId — the 'existing' outcome:
    // 200, but no document at the submitted id (grantInvitation's
    // own header).
    const echoId = 'inv-lifecycle-phantom-echo';
    const admin = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const echoRes = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: echoId,
            grantEventId: echoId + '-grant',
            grantAt: '2026-06-01T00:00:02.000000Z',
        },
    ));
    assert.equal(echoRes.status, 200);
    const echoBody = await echoRes.json() as { id: string };
    assert.equal(echoBody.id, freshId);

    assert.deepEqual(
        await invitationLifecycleStatesFor(db, echoId), [],
    );
    assert.deepEqual(
        await bulkRowsFor(db, echoId), [],
    );

    // The FRESH id's own single pending row is untouched by the
    // echo.
    const freshRows = await invitationLifecycleStatesFor(
        db, freshId,
    );
    assert.equal(freshRows.length, 1);
    assert.equal(freshRows[0]!.state, 'pending');
});
