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
import {
    generateIdentifier,
    compareIdentifiers,
} from '../shared/identifier.ts';

// The Phase 14 Task 1 core: invitationLifecycleStatesFor is the
// ENTITY-SCOPED sibling of deriveInvitationStates — INDEXED
// getAllWhere reads (uri_id for the grant/document message pair,
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
    grantEventId: string = generateIdentifier(),
): Promise<string> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email,
            invitationId,
            grantEventId,
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 200);
    return grantEventId;
}

async function bulkRowsFor(
    db: MemoryDbAdapter, id: string,
): Promise<unknown[]> {
    return (await deriveInvitationStates(db))
        .filter((row) => row.entity_id === id)
        .sort((a, b) => compareIdentifiers(a.id, b.id));
}

test('invitationLifecycleStatesFor: pending-only (granted,'
+ ' unanswered) matches deriveInvitationStates\'s own subset',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    const grantEventId = generateIdentifier();
    await grant(db, id, 'sarah.chen@company.com', grantEventId);

    const scoped = await invitationLifecycleStatesFor(db, id);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]!.state, 'pending');
    assert.equal(scoped[0]!.id, grantEventId);
    assert.deepEqual(scoped, await bulkRowsFor(db, id));
});

test('invitationLifecycleStatesFor: accepted carries both the'
+ ' pending and accepted rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    await grant(db, id, 'sarah.chen@company.com');

    const accept = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
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
    const id = generateIdentifier();
    const inviteeId = 'zyGBRshxOnKHUfcyFRqowg'; // Jessica Park
    await grant(db, id, 'jessica.park@company.com');

    const decline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'declined',
            eventId: generateIdentifier(),
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
    const id = generateIdentifier();
    await grant(db, id, 'emily.rodriguez@company.com');

    const revoke = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO),
        {
            state: 'revoked',
            eventId: generateIdentifier(),
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
        () => invitationLifecycleStatesFor(
            db, generateIdentifier(),
        ),
    );
    const missingId = generateIdentifier();
    assert.deepEqual(
        await invitationLifecycleStatesFor(db, missingId),
        [],
    );
});

// -- the phantom-echo exclusion (finding 1: "Document existence --
// -- is the grant proof") ----------------------------------------

test('invitationLifecycleStatesFor: a duplicate-grant\'s'
+ ' PHANTOM echo id (an operation message pair with no document)'
+ ' derives an EMPTY array — never a false \'pending\' row',
async () => {
    const db = await seededDb();
    const freshId = generateIdentifier();
    await grant(db, freshId, 'sarah.chen@company.com');

    // A second grant for the SAME (org, identity) pair, submitted
    // with a DIFFERENT invitationId — the 'existing' outcome:
    // 200, but no document at the submitted id (grantInvitation's
    // own header).
    const echoId = generateIdentifier();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const echoRes = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: echoId,
            grantEventId: generateIdentifier(),
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
