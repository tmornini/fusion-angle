import { assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { Id } from '../shared/types.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// The document-head oracle: an invitation GET is ONE document
// read whose head carries `state` (spec 2026-09-15 § 2).
// This file proves it agrees with the invitation's version
// list (the document's own history, newest version) over the
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

// The state an invitation GET answers its organization's
// admin, or undefined when it answers 404.
async function readState(
    db: MemoryDbAdapter, id: Id,
): Promise<string | undefined> {
    return (await adminRead(db, id) as { state: string } | undefined)
        ?.state;
}

// The newest version's state: the document's OWN history,
// read through its version list.
async function newestVersionState(
    db: MemoryDbAdapter, id: Id,
): Promise<string | undefined> {
    const versions = await adminRead(db, id + '/versions/') as
        { state: string }[] | undefined;
    return versions?.[0]?.state;
}

async function adminRead(
    db: MemoryDbAdapter, resource: string,
): Promise<unknown> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + resource, admin,
    ));
    if (res.status === 404) {
        await res.body?.cancel();
        return undefined;
    }
    assertStrictEquals(res.status, 200);
    return await res.json();
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

Deno.test('an invitation GET: pending (granted, unanswered)'
+ ' reads \'pending\', matching its newest version',
async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    await grant(db, id, 'sarah.chen@company.com');

    assertStrictEquals(
        await readState(db, id), 'pending',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: accepted reads \'accepted\','
+ ' matching its newest version', async () => {
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

    assertStrictEquals(
        await readState(db, id), 'accepted',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: declined reads \'declined\','
+ ' matching its newest version', async () => {
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

    assertStrictEquals(
        await readState(db, id), 'declined',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: revoked reads \'revoked\','
+ ' matching its newest version', async () => {
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

    assertStrictEquals(
        await readState(db, id), 'revoked',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: a never-granted id answers 404,'
+ ' as its version list does', async () => {
    const db = await seededDb();
    const id = generateIdentifier();
    assertStrictEquals(await readState(db, id), undefined);
    assertStrictEquals(await newestVersionState(db, id), undefined);
});
