import { assertEquals, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    invitationLatched,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import type { MembershipEntity } from '../shared/types.ts';

// An invitation's version list reads ONE document's own PUT
// history, oldest first. The parts are the stored bodies.

const SARAH = 'MQFcPtrZPIGjMCRAXtZUnA';
const JESSICA = 'zyGBRshxOnKHUfcyFRqowg';
const EMILY = 'CJrglMsNBxOWWfbihHQSeg';
const ADMIN = 'XXZruirZyAOoRpNxaDnpSA';

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

function nameOf(identity: string): string {
    return membershipNameOf(ORGANIZATION_TWO, identity);
}

async function invite(
    db: MemoryDbAdapter,
    email: string,
): Promise<string> {
    const admin = await organizationToken(
        ADMIN, ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email,
            at: '2026-06-01T00:00:00.000000Z',
            expiresAt: '2099-12-31T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
    const identity = email === 'sarah.chen@company.com'
        ? SARAH
        : email === 'jessica.park@company.com'
            ? JESSICA
            : EMILY;
    return nameOf(identity);
}

// Oldest first. Null when the read answers 404.
async function versionStates(
    db: MemoryDbAdapter, id: string,
): Promise<string[] | null> {
    const admin = await organizationToken(
        ADMIN, ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + id + '/versions/', admin,
    ));
    if (res.status === 404) {
        await res.body?.cancel();
        return null;
    }
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<MembershipEntity>(res);
    return parts.map((part) => part.body().toValue().state);
}

Deno.test('the version list: pending-only (granted,'
+ ' unanswered) is the grant',
async () => {
    const db = await seededDb();
    const id = await invite(db, 'sarah.chen@company.com');

    const scoped = await versionStates(db, id);
    assertStrictEquals(scoped?.length, 1);
    assertStrictEquals(scoped?.[0], 'pending');
    const head = await db.messagePairs.getHeadPair(
        '/invitations/', id,
    );
    assertStrictEquals(
        head?.requester_identity_id, ADMIN,
    );
});

Deno.test('the version list: accepted carries both the'
+ ' pending and accepted rows',
async () => {
    const db = await seededDb();
    const id = await invite(db, 'sarah.chen@company.com');

    const accept = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + SARAH + '/invitations/' + id,
            await organizationToken(SARAH, ORGANIZATION_TWO),
            {
                state: 'accepted',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(accept.status, 200);
    await accept.body?.cancel();

    const scoped = await versionStates(db, id);
    assertStrictEquals(scoped?.length, 2);
    assertEquals(scoped, ['pending', 'accepted']);
});

Deno.test('the version list: declined carries both the'
+ ' pending and declined rows',
async () => {
    const db = await seededDb();
    const id = await invite(db, 'jessica.park@company.com');

    const decline = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + JESSICA + '/invitations/' + id,
            await organizationToken(JESSICA, ORGANIZATION_TWO),
            {
                state: 'declined',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(decline.status, 200);
    await decline.body?.cancel();

    const scoped = await versionStates(db, id);
    assertStrictEquals(scoped?.length, 2);
    assertEquals(scoped, ['pending', 'declined']);
});

Deno.test('the version list: revoked carries both the'
+ ' pending and revoked rows',
async () => {
    const db = await seededDb();
    const id = await invite(db, 'emily.rodriguez@company.com');

    const revoke = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/organizations/' + ORGANIZATION_TWO
                + '/invitations/' + id,
            await organizationToken(ADMIN, ORGANIZATION_TWO),
            {
                state: 'revoked',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(revoke.status, 200);
    await revoke.body?.cancel();

    const scoped = await versionStates(db, id);
    assertStrictEquals(scoped?.length, 2);
    assertEquals(scoped, ['pending', 'revoked']);
});

Deno.test('the version list: a never-granted name answers'
+ ' 404',
async () => {
    const db = await seededDb();
    const missingId = nameOf(generateIdentifier());
    assertStrictEquals(
        await versionStates(db, missingId), null,
    );
});
