import { assertEquals, assertStrictEquals } from '@std/assert';
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
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import {
    generateIdentifier,
    compareIdentifiers,
} from '../shared/identifier.ts';

// invitationLifecycleStatesFor reads ONE invitation document's
// own PUT history (api/derive-states.ts) — the grant's 'pending'
// PUT, then the terminal PUT — via getDocumentHistory, rather
// than the whole-collection scan deriveInvitationStates needs
// to DISCOVER every id. This file proves it byte-identical to
// deriveInvitationStates's own per-entity subset over the same
// three live lifecycles plus pending and never-granted.

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
    assertStrictEquals(res.status, 201);
    return grantEventId;
}

async function bulkRowsFor(
    db: MemoryDbAdapter, id: string,
): Promise<unknown[]> {
    return (await deriveInvitationStates(db))
        .filter((row) => row.entity_id === id)
        .sort((a, b) => compareIdentifiers(a.id, b.id));
}

Deno.test('invitationLifecycleStatesFor: pending-only (granted,'
+ ' unanswered) matches deriveInvitationStates\'s own subset',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    const grantEventId = generateIdentifier();
    await grant(db, id, 'sarah.chen@company.com', grantEventId);

    const scoped = await invitationLifecycleStatesFor(db, id);
    assertStrictEquals(scoped.length, 1);
    assertStrictEquals(scoped[0]!.state, 'pending');
    assertStrictEquals(
        scoped[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assertEquals(scoped, await bulkRowsFor(db, id));
});

Deno.test('invitationLifecycleStatesFor: accepted carries both the'
+ ' pending and accepted rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA'; // Sarah Chen
    await grant(db, id, 'sarah.chen@company.com');

    const accept = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
            at: '2026-06-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(accept.status, 200);

    const scoped = await invitationLifecycleStatesFor(db, id);
    assertStrictEquals(scoped.length, 2);
    assertEquals(
        scoped.map((row) => row.state).sort(),
        ['accepted', 'pending'],
    );
    assertEquals(scoped, await bulkRowsFor(db, id));
});

Deno.test('invitationLifecycleStatesFor: declined carries both the'
+ ' pending and declined rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    const inviteeId = 'zyGBRshxOnKHUfcyFRqowg'; // Jessica Park
    await grant(db, id, 'jessica.park@company.com');

    const decline = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + inviteeId + '/invitations/' + id,
        await organizationToken(inviteeId, ORGANIZATION_TWO),
        {
            state: 'declined',
            eventId: generateIdentifier(),
            at: '2026-06-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(decline.status, 200);

    const scoped = await invitationLifecycleStatesFor(db, id);
    assertStrictEquals(scoped.length, 2);
    assertEquals(
        scoped.map((row) => row.state).sort(),
        ['declined', 'pending'],
    );
    assertEquals(scoped, await bulkRowsFor(db, id));
});

Deno.test('invitationLifecycleStatesFor: revoked carries both the'
+ ' pending and revoked rows, matching the bulk subset',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    await grant(db, id, 'emily.rodriguez@company.com');

    const revoke = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO),
        {
            state: 'revoked',
            eventId: generateIdentifier(),
            at: '2026-06-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(revoke.status, 200);

    const scoped = await invitationLifecycleStatesFor(db, id);
    assertStrictEquals(scoped.length, 2);
    assertEquals(
        scoped.map((row) => row.state).sort(),
        ['pending', 'revoked'],
    );
    assertEquals(scoped, await bulkRowsFor(db, id));
});

Deno.test('invitationLifecycleStatesFor: a never-granted id derives'
+ ' an empty array, no throw', async () => {
    const db = await seededDb();
    await invitationLifecycleStatesFor(db, generateIdentifier());
    const missingId = generateIdentifier();
    assertEquals(
        await invitationLifecycleStatesFor(db, missingId),
        [],
    );
});

// -- the phantom-echo id: no document, so no rows ------------------

Deno.test('invitationLifecycleStatesFor: a duplicate-grant\'s'
+ ' echo id (no document ever written there) derives an EMPTY'
+ ' array — structurally, not by cross-reference',
async () => {
    const db = await seededDb();
    const freshId = generateIdentifier();
    await grant(db, freshId, 'sarah.chen@company.com');

    // A second grant for the SAME (org, identity) pair, submitted
    // with a DIFFERENT invitationId — the 'existing' outcome:
    // 200, but grantInvitation never PUTs a document at this id
    // (only the 'fresh' branch does), so there is structurally
    // nothing to read here — never a false 'pending' row.
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
    assertStrictEquals(echoRes.status, 200);
    const echoBody = await echoRes.json() as { id: string };
    assertStrictEquals(echoBody.id, freshId);

    assertEquals(
        await invitationLifecycleStatesFor(db, echoId), [],
    );
    assertEquals(
        await bulkRowsFor(db, echoId), [],
    );

    // The FRESH id's own single pending row is untouched by the
    // echo.
    const freshRows = await invitationLifecycleStatesFor(
        db, freshId,
    );
    assertStrictEquals(freshRows.length, 1);
    assertStrictEquals(freshRows[0]!.state, 'pending');
});
