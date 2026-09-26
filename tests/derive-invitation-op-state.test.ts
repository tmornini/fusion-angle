import { assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { Id } from '../shared/types.ts';
import { assertInvitationState } from '../shared/types.ts';
import { deriveInvitation } from '../api/derive-invitations.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// The document-head oracle: deriveInvitation is ONE document
// read whose head carries `state` (spec 2026-09-15 § 2).
// This file proves it agrees with invitationLifecycleStatesFor
// (the document's own history, latest row) over the three
// live lifecycles plus pending and never-granted.

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

// The row-plane reproduction of deriveInvitation's own head
// read: the document's OWN history, latest row, mirroring the
// algorithm rather than the privacy (the
// drift-memberships-identity.test.ts leg-4 precedent).
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
    return assertInvitationState(latest.state, 'invitation ' + id);
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email: string,
): Promise<void> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email,
            invitationId,
            grantEventId: generateIdentifier(),
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 201);
}

Deno.test('deriveInvitation: pending (granted, unanswered)'
+ ' derives \'pending\', matching the row-plane state',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    await grant(db, id, 'sarah.chen@company.com');

    assertStrictEquals(
        (await deriveInvitation(db, id))?.state, 'pending',
    );
    assertStrictEquals(
        (await deriveInvitation(db, id))?.state,
        await rowPlaneOpState(db, id),
    );
});

Deno.test('deriveInvitation: accepted derives \'accepted\','
+ ' matching the row-plane current state', async () => {
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
    assertStrictEquals(accept.status, 204);

    assertStrictEquals(
        (await deriveInvitation(db, id))?.state, 'accepted',
    );
    assertStrictEquals(
        (await deriveInvitation(db, id))?.state,
        await rowPlaneOpState(db, id),
    );
});

Deno.test('deriveInvitation: declined derives \'declined\','
+ ' matching the row-plane current state', async () => {
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
    assertStrictEquals(decline.status, 204);

    assertStrictEquals(
        (await deriveInvitation(db, id))?.state, 'declined',
    );
    assertStrictEquals(
        (await deriveInvitation(db, id))?.state,
        await rowPlaneOpState(db, id),
    );
});

Deno.test('deriveInvitation: revoked derives \'revoked\','
+ ' matching the row-plane current state', async () => {
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
    assertStrictEquals(revoke.status, 204);

    assertStrictEquals(
        (await deriveInvitation(db, id))?.state, 'revoked',
    );
    assertStrictEquals(
        (await deriveInvitation(db, id))?.state,
        await rowPlaneOpState(db, id),
    );
});

Deno.test('deriveInvitation: a never-granted id derives'
+ ' undefined, no throw', async () => {
    const db = await seededDb();
    await deriveInvitation(db, generateIdentifier());
    assertStrictEquals(
        (await deriveInvitation(db, generateIdentifier()))?.state,
        undefined,
    );
});
