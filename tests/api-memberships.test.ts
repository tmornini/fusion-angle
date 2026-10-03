import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { bodyOf } from '../api/derive-documents.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';
import { seedPersonIdentity } from
    './identity-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    apiRequest,
    assertPartsAreHeads,
    invitationLatched,
    partBodiesOf,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import type { MembershipEntity } from '../shared/types.ts';

const TONY = 'XXZruirZyAOoRpNxaDnpSA';
const ORG = 'AjdvjuECVZEgZoFajaIEkg';
const MALFORMED =
    'membership-id must be two identifiers joined by'
    + ' one colon';
const MEMBER_VIEW =
    'forbidden: members read accepted or removed'
    + ' memberships';
const LAST_ADMIN =
    'the last accepted admin cannot be removed'
    + ' or demoted';

function itemPath(
    nest: 'organizations' | 'identities',
    owner: string,
    name: string,
): string {
    return '/' + nest + '/' + owner + '/invitations/'
        + name;
}

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): Request {
    return apiRequest({
        method, path, token,
        ...(body !== undefined ? { body } : {}),
        ...(headers !== undefined ? { headers } : {}),
    });
}

async function basis(): Promise<{
    db: MemoryDbAdapter;
    admin: string;
}> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, ORG, 'Stark');
    await seedPersonIdentity(db, TONY, {
        name: 'Tony',
        email: 'tony@example.com',
        phone: '',
        bio: '',
    });
    return {
        db,
        admin: await organizationToken(TONY, ORG),
    };
}

async function person(
    db: MemoryDbAdapter,
    email: string,
): Promise<{
    id: string;
    email: string;
    token: string;
}> {
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: email, email, phone: '', bio: '',
    });
    return {
        id,
        email,
        token: await organizationToken(id, ORG),
    };
}

async function errorOf(
    response: Response,
): Promise<string> {
    const body = await response.json() as { error: string };
    return body.error;
}

async function assertError(
    response: Response,
    status: number,
    error: string,
): Promise<void> {
    assertStrictEquals(response.status, status);
    assertStrictEquals(await errorOf(response), error);
}

async function membershipOf(
    response: Response,
): Promise<MembershipEntity> {
    return await response.json() as MembershipEntity;
}

function expected(
    identity: string,
    state: MembershipEntity['state'],
    at: string,
    type: MembershipEntity['type'] = 'member',
    organization = ORG,
): MembershipEntity {
    return {
        id: membershipNameOf(organization, identity),
        organization_id: organization,
        identity_id: identity,
        type,
        state,
        at,
    };
}

async function grant(
    db: MemoryDbAdapter,
    admin: string,
    email: string,
    at: string,
    organization = ORG,
): Promise<Response> {
    return handleRequest(db, req(
        'POST',
        '/organizations/' + organization + '/invitations/',
        admin,
        { email, grantAt: at },
    ));
}

async function putState(
    db: MemoryDbAdapter,
    nest: 'organizations' | 'identities',
    owner: string,
    name: string,
    token: string,
    body: Record<string, unknown>,
): Promise<Response> {
    return handleRequest(db, await invitationLatched(
        db, req(
            'PUT', itemPath(nest, owner, name), token, body,
        ),
    ));
}

async function directSeat(
    db: MemoryDbAdapter,
    admin: string,
    identity: string,
    type: MembershipEntity['type'],
    at: string,
): Promise<Response> {
    const name = membershipNameOf(ORG, identity);
    return handleRequest(db, req(
        'PUT',
        itemPath('organizations', ORG, name),
        admin,
        { state: 'accepted', type, at },
        { 'If-None-Match': '*' },
    ));
}

async function putCount(
    db: MemoryDbAdapter,
    name: string,
): Promise<number> {
    const rows = await db.messagePairs.getDocumentHistory(
        '/invitations/', name,
    );
    return rows.filter((row) => row.method === 'PUT').length;
}

async function seatHead(
    db: MemoryDbAdapter,
    identity: string,
): Promise<{ method: string; type?: string } | null> {
    const head = await db.messagePairs.getHeadPair(
        '/invitations/',
        membershipNameOf(ORG, identity),
    );
    if (head === null) return null;
    const body = bodyOf(head.response);
    if (body['state'] === 'removed') {
        return { method: 'DELETE' };
    }
    if (body['state'] === 'accepted') {
        return {
            method: 'PUT',
            type: String(body['type']),
        };
    }
    return null;
}

Deno.test('a grant from none is 201 pending at the name',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'grant@example.com');
    const at = '2026-04-01T00:00:00.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const response = await grant(
        db, admin, 'grant@example.com', at,
    );
    assertStrictEquals(response.status, 201);
    assertStrictEquals(
        response.headers.get('location'),
        '/organizations/' + ORG + '/invitations/' + name,
    );
    assertEquals(
        await membershipOf(response),
        expected(invitee.id, 'pending', at),
    );
    assertStrictEquals(await putCount(db, name), 1);
    assertEquals(await seatHead(db, invitee.id), null);
});

Deno.test('a grant on a pending head is 200 and stores'
+ ' nothing', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'again@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const firstAt = '2026-04-01T00:00:00.000000Z';
    const first = await grant(
        db, admin, 'again@example.com', firstAt,
    );
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const second = await grant(
        db, admin, 'again@example.com',
        '2026-04-02T00:00:00.000000Z',
    );
    assertStrictEquals(second.status, 200);
    assertEquals(
        await membershipOf(second),
        expected(invitee.id, 'pending', firstAt),
    );
    assertStrictEquals(await putCount(db, name), 1);
});

Deno.test('an admin pending PUT from none is 409'
+ ' and stores nothing', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'fresh@example.com');
    const at = '2026-04-01T00:00:00.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const before = (await db.messagePairs.getAll()).length;
    const response = await handleRequest(db, req(
        'PUT',
        itemPath('organizations', ORG, name),
        admin,
        { state: 'pending', type: 'member', at },
        { 'If-None-Match': '*' },
    ));
    await assertError(
        response, 409,
        'no transition from none to pending'
            + ' for the admin',
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('an admin pending PUT on a pending head is 409'
+ ' and a second grant stays 200', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'still@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const at = '2026-04-01T00:00:00.000000Z';
    const granted = await grant(
        db, admin, 'still@example.com', at,
    );
    assertStrictEquals(granted.status, 201);
    assertEquals(
        await membershipOf(granted),
        expected(invitee.id, 'pending', at),
    );
    const before = (await db.messagePairs.getAll()).length;
    const refused = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'pending',
            type: 'member',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await assertError(
        refused, 409,
        'no transition from pending to pending'
            + ' for the admin',
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    const second = await grant(
        db, admin, 'still@example.com',
        '2026-04-02T00:00:00.000000Z',
    );
    assertStrictEquals(second.status, 200);
    await second.body?.cancel();
});

Deno.test('an admin pending PUT on a declined head'
+ ' is 409 and the head stays declined', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'later@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const declineAt = '2026-04-01T00:00:01.000000Z';
    const granted = await grant(
        db, admin, 'later@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const declined = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'declined',
            at: declineAt,
        },
    );
    assertStrictEquals(declined.status, 200);
    await declined.body?.cancel();
    const refused = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'pending',
            type: 'member',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    await assertError(
        refused, 409,
        'no transition from declined to pending'
            + ' for the admin',
    );
    const head = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, name),
        admin,
    ));
    assertStrictEquals(head.status, 200);
    assertEquals(
        await membershipOf(head),
        expected(invitee.id, 'declined', declineAt),
    );
});

Deno.test('a grant on an accepted head is 409', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'seated@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'seated@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    assertStrictEquals(accepted.status, 200);
    await accepted.body?.cancel();
    const again = await grant(
        db, admin, 'seated@example.com',
        '2026-04-02T00:00:00.000000Z',
    );
    await assertError(
        again, 409,
        'no transition from accepted to pending'
            + ' for the admin',
    );
});

Deno.test('an invitee accept lands the membership and a seat',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'accept@example.com');
    const at = '2026-04-01T00:00:01.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'accept@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token,
        { state: 'accepted', at },
    );
    assertStrictEquals(accepted.status, 200);
    assertEquals(
        await membershipOf(accepted),
        expected(invitee.id, 'accepted', at),
    );
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'PUT', type: 'member' },
    );
});

Deno.test('an invitee decline lands declined and no seat',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'decline@example.com');
    const at = '2026-04-01T00:00:01.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'decline@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const declined = await putState(
        db, 'identities', invitee.id, name, invitee.token,
        { state: 'declined', at },
    );
    assertStrictEquals(declined.status, 200);
    assertEquals(
        await membershipOf(declined),
        expected(invitee.id, 'declined', at),
    );
    assertEquals(await seatHead(db, invitee.id), null);
});

Deno.test('an admin revoke lands revoked and no seat',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'revoke@example.com');
    const at = '2026-04-01T00:00:01.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'revoke@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const revoked = await putState(
        db, 'organizations', ORG, name, admin,
        { state: 'revoked', at },
    );
    assertStrictEquals(revoked.status, 200);
    assertEquals(
        await membershipOf(revoked),
        expected(invitee.id, 'revoked', at),
    );
    assertEquals(await seatHead(db, invitee.id), null);
});

Deno.test('an admin removal lands removed and deletes'
+ ' the seat', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'remove@example.com');
    const at = '2026-04-01T00:00:02.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'remove@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await accepted.body?.cancel();
    const removed = await putState(
        db, 'organizations', ORG, name, admin,
        { state: 'removed', at },
    );
    assertStrictEquals(removed.status, 200);
    assertEquals(
        await membershipOf(removed),
        expected(invitee.id, 'removed', at),
    );
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'DELETE' },
    );
});

Deno.test('an admin retype changes the type and the seat',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'retype@example.com');
    const at = '2026-04-01T00:00:02.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'retype@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await accepted.body?.cancel();
    const retyped = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'accepted', type: 'admin', at,
        },
    );
    assertStrictEquals(retyped.status, 200);
    assertEquals(
        await membershipOf(retyped),
        expected(invitee.id, 'accepted', at, 'admin'),
    );
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'PUT', type: 'admin' },
    );
});

Deno.test('the same type, or a missing type, is 409',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'sametype@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'sametype@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await accepted.body?.cancel();
    const same = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'accepted',
            type: 'member',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    await assertError(
        same, 409,
        'no transition from accepted to accepted'
            + ' for the admin',
    );
    const missing = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'accepted',
            at: '2026-04-01T00:00:03.000000Z',
        },
    );
    await assertError(
        missing, 409,
        'no transition from accepted to accepted'
            + ' for the admin',
    );
    assertStrictEquals(await putCount(db, name), 2);
});

Deno.test('a direct seat is 201 and lands a seat',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'direct@example.com');
    const at = '2026-04-01T00:00:00.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const created = await directSeat(
        db, admin, invitee.id, 'member', at,
    );
    assertStrictEquals(created.status, 201);
    assertEquals(
        created.headers.get('location'), null,
    );
    assertEquals(
        await membershipOf(created),
        expected(invitee.id, 'accepted', at),
    );
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'PUT', type: 'member' },
    );
    const starred = await handleRequest(db, req(
        'PUT',
        itemPath('organizations', ORG, name),
        admin,
        {
            state: 'accepted',
            type: 'admin',
            at: '2026-04-02T00:00:00.000000Z',
        },
        { 'If-None-Match': '*' },
    ));
    await assertError(
        starred, 412,
        'Document already exists at /invitations/'
            + name,
    );
    assertStrictEquals(await putCount(db, name), 1);
});

Deno.test('revoked to accepted lands a seat', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'back@example.com');
    const at = '2026-04-01T00:00:02.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'back@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const revoked = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'revoked',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await revoked.body?.cancel();
    const accepted = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'accepted', type: 'member', at,
        },
    );
    assertStrictEquals(accepted.status, 200);
    assertEquals(
        await membershipOf(accepted),
        expected(invitee.id, 'accepted', at),
    );
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'PUT', type: 'member' },
    );
});

Deno.test('removed to accepted restores the seat',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'restore@example.com');
    const at = '2026-04-01T00:00:03.000000Z';
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'restore@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await accepted.body?.cancel();
    const removed = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'removed',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    await removed.body?.cancel();
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'DELETE' },
    );
    const restored = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'accepted', type: 'member', at,
        },
    );
    assertStrictEquals(restored.status, 200);
    assertEquals(
        await membershipOf(restored),
        expected(invitee.id, 'accepted', at),
    );
    assertEquals(
        await seatHead(db, invitee.id),
        { method: 'PUT', type: 'member' },
    );
});

Deno.test('re-invite after decline, revoke, or removal'
+ ' lands pending on the same document', async () => {
    const { db, admin } = await basis();
    const cases = [
        'declined', 'revoked', 'removed',
    ] as const;
    for (const state of cases) {
        const invitee = await person(
            db, state + '@example.com',
        );
        const name = membershipNameOf(ORG, invitee.id);
        const granted = await grant(
            db, admin, state + '@example.com',
            '2026-04-01T00:00:00.000000Z',
        );
        await granted.body?.cancel();
        if (state === 'removed') {
            const accepted = await putState(
                db, 'identities', invitee.id, name,
                invitee.token, {
                    state: 'accepted',
                    at: '2026-04-01T00:00:01.000000Z',
                },
            );
            await accepted.body?.cancel();
        }
        const terminal = state === 'declined'
            ? await putState(
                db, 'identities', invitee.id, name,
                invitee.token, {
                    state: 'declined',
                    at: '2026-04-01T00:00:02.000000Z',
                },
            )
            : await putState(
                db, 'organizations', ORG, name, admin, {
                    state,
                    at: '2026-04-01T00:00:02.000000Z',
                },
            );
        await terminal.body?.cancel();
        const at = '2026-04-02T00:00:00.000000Z';
        const again = await grant(
            db, admin, state + '@example.com', at,
        );
        assertStrictEquals(again.status, 201);
        assertEquals(
            await membershipOf(again),
            expected(invitee.id, 'pending', at),
        );
        assertStrictEquals(
            await putCount(db, name),
            state === 'removed' ? 4 : 3,
        );
    }
});

Deno.test('a replay latched on the pending head is 412',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'stale@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'stale@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const path = itemPath('identities', invitee.id, name);
    const body = {
        state: 'accepted',
        at: '2026-04-01T00:00:01.000000Z',
    };
    const firstLatch = await invitationLatched(
        db, req('PUT', path, invitee.token, body),
    );
    const replay = await invitationLatched(
        db, req('PUT', path, invitee.token, body),
    );
    const first = await handleRequest(db, firstLatch);
    assertStrictEquals(first.status, 200);
    await first.body?.cancel();
    const second = await handleRequest(db, replay);
    await assertError(
        second, 412,
        'If-Match does not match the current'
            + ' document at /invitations/' + name,
    );
    assertStrictEquals(await putCount(db, name), 2);
});

Deno.test('a repeated accept on the current head is 409',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'repeat@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'repeat@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await accepted.body?.cancel();
    const again = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    await assertError(
        again, 409,
        'no transition from accepted to accepted'
            + ' for the invitee',
    );
});

Deno.test('an invitee asking for revoked is 409',
async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'nope@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'nope@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const refused = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'revoked',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await assertError(
        refused, 409,
        'no transition from pending to revoked'
            + ' for the invitee',
    );
});

Deno.test('only the invitee may accept', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'self@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, 'self@example.com',
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const refused = await putState(
        db, 'identities', invitee.id, name, admin, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await assertError(
        refused, 403,
        'forbidden: only the invitee may accept',
    );
});

Deno.test('a foreign organization half is 403 on every'
+ ' verb, and POST or DELETE of one\'s own name is 405',
async () => {
    const { db, admin } = await basis();
    const foreign = membershipNameOf(
        generateIdentifier(), TONY,
    );
    const own = membershipNameOf(ORG, TONY);
    const foreignError = 'forbidden: invitations/'
        + foreign
        + ' belongs to a different organization';
    for (const method of ['GET', 'PUT', 'POST', 'DELETE']) {
        const response = await handleRequest(db, req(
            method,
            itemPath('organizations', ORG, foreign),
            admin,
            method === 'PUT' || method === 'POST'
                ? { state: 'pending' }
                : undefined,
        ));
        await assertError(response, 403, foreignError);
    }
    for (const method of ['POST', 'DELETE']) {
        const path = itemPath('organizations', ORG, own);
        const response = await handleRequest(db, req(
            method, path, admin,
            method === 'POST' ? { email: 'x' } : undefined,
        ));
        await assertError(
            response, 405,
            'Method ' + method + ' not allowed on ' + path,
        );
    }
});

Deno.test('a foreign identity half is 404', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'half@example.com');
    const foreign = membershipNameOf(
        ORG, generateIdentifier(),
    );
    const paths = [
        itemPath('identities', invitee.id, foreign),
        itemPath('identities', invitee.id, foreign)
            + '/versions/',
        itemPath('identities', invitee.id, foreign)
            + '/versions/' + generateIdentifier(),
    ];
    for (const path of paths) {
        const response = await handleRequest(
            db, req('GET', path, admin),
        );
        await assertError(
            response, 404, 'Not found: ' + path,
        );
    }
    const put = await handleRequest(db, req(
        'PUT',
        itemPath('identities', invitee.id, foreign),
        admin,
        { state: 'accepted', at: '2026-04-01T00:00:00.000000Z' },
    ));
    await assertError(
        put, 404,
        'Not found: '
            + itemPath('identities', invitee.id, foreign),
    );
});

Deno.test('a malformed membership-id is 400', async () => {
    const { db, admin } = await basis();
    const bad = generateIdentifier();
    const paths = [
        itemPath('organizations', ORG, bad),
        itemPath('identities', TONY, bad),
    ];
    for (const path of paths) {
        const response = await handleRequest(
            db, req('GET', path, admin),
        );
        await assertError(response, 400, MALFORMED);
    }
});

Deno.test('removing or demoting the last accepted admin'
+ ' is 409, and removing another member deletes the seat',
async () => {
    const { db, admin } = await basis();
    const other = await person(db, 'other@example.com');
    const tonyAt = '2026-04-01T00:00:00.000000Z';
    const otherAt = '2026-04-01T00:00:01.000000Z';
    const tonySeat = await directSeat(
        db, admin, TONY, 'admin', tonyAt,
    );
    assertStrictEquals(tonySeat.status, 201);
    await tonySeat.body?.cancel();
    const otherSeat = await directSeat(
        db, admin, other.id, 'member', otherAt,
    );
    assertStrictEquals(otherSeat.status, 201);
    await otherSeat.body?.cancel();
    const tonyName = membershipNameOf(ORG, TONY);
    const otherName = membershipNameOf(ORG, other.id);
    const removed = await putState(
        db, 'organizations', ORG, otherName, admin, {
            state: 'removed',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();
    assertEquals(
        await seatHead(db, other.id),
        { method: 'DELETE' },
    );
    const tonyRemoved = await putState(
        db, 'organizations', ORG, tonyName, admin, {
            state: 'removed',
            at: '2026-04-01T00:00:03.000000Z',
        },
    );
    await assertError(tonyRemoved, 409, LAST_ADMIN);
    const demoted = await putState(
        db, 'organizations', ORG, tonyName, admin, {
            state: 'accepted',
            type: 'member',
            at: '2026-04-01T00:00:04.000000Z',
        },
    );
    await assertError(demoted, 409, LAST_ADMIN);
    assertEquals(
        await seatHead(db, TONY),
        { method: 'PUT', type: 'admin' },
    );
});

async function statesOf(
    response: Response,
): Promise<string[]> {
    const bodies = await partBodiesOf<MembershipEntity>(
        response,
    );
    return bodies.map((body) => body.state);
}

Deno.test('views filter by nest and state, an empty view'
+ ' is 204, and parts follow (response_at, id)',
async () => {
    const { db, admin } = await basis();
    const otherOrganization = generateIdentifier();
    await seedOrganizationDocument(db, otherOrganization, 'Other');
    const otherAdmin = await organizationToken(
        TONY, otherOrganization,
    );
    const empty = await handleRequest(db, req(
        'GET',
        '/organizations/' + otherOrganization + '/invitations/',
        otherAdmin,
    ));
    assertStrictEquals(empty.status, 204);
    assertEquals(await partsOf(empty), []);
    const lonely = generateIdentifier();
    const lonelyView = await handleRequest(db, req(
        'GET',
        '/identities/' + lonely + '/invitations/',
        admin,
    ));
    assertStrictEquals(lonelyView.status, 204);
    await lonelyView.body?.cancel();

    const pending = await person(db, 'view-p@example.com');
    const accepted = await person(db, 'view-a@example.com');
    const declined = await person(db, 'view-d@example.com');
    const revoked = await person(db, 'view-v@example.com');
    const removed = await person(db, 'view-r@example.com');
    const people = [
        pending, accepted, declined, revoked, removed,
    ];
    for (const invitee of people) {
        const granted = await grant(
            db, admin, invitee.email,
            '2026-04-01T00:00:00.000000Z',
        );
        assertStrictEquals(granted.status, 201);
        await granted.body?.cancel();
    }
    const move = async (
        invitee: { id: string; token: string },
        state: 'accepted' | 'declined',
    ): Promise<void> => {
        const moved = await putState(
            db, 'identities', invitee.id,
            membershipNameOf(ORG, invitee.id),
            invitee.token, {
                state,
                at: '2026-04-01T00:00:01.000000Z',
            },
        );
        assertStrictEquals(moved.status, 200);
        await moved.body?.cancel();
    };
    await move(accepted, 'accepted');
    await move(declined, 'declined');
    await move(removed, 'accepted');
    const revoke = await putState(
        db, 'organizations', ORG,
        membershipNameOf(ORG, revoked.id), admin, {
            state: 'revoked',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    assertStrictEquals(revoke.status, 200);
    await revoke.body?.cancel();
    const removal = await putState(
        db, 'organizations', ORG,
        membershipNameOf(ORG, removed.id), admin, {
            state: 'removed',
            at: '2026-04-01T00:00:03.000000Z',
        },
    );
    assertStrictEquals(removal.status, 200);
    await removal.body?.cancel();

    const everywhere = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORG + '/invitations/',
        admin,
    ));
    assertStrictEquals(everywhere.status, 200);
    const parts = await partsOf<MembershipEntity>(
        everywhere,
    );
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    assertEquals(
        parts.map((part) => part.body().toValue().state)
            .sort(),
        [
            'accepted', 'declined', 'pending',
            'removed', 'revoked',
        ],
    );
    for (const state of [
        'pending', 'accepted', 'declined',
        'revoked', 'removed',
    ] as const) {
        const filtered = await handleRequest(db, req(
            'GET',
            '/organizations/' + ORG
                + '/invitations/?state=' + state,
            admin,
        ));
        assertStrictEquals(filtered.status, 200);
        assertEquals(await statesOf(filtered), [state]);
    }

    const elsewhere = await grant(
        db, otherAdmin, pending.email,
        '2026-04-02T00:00:00.000000Z', otherOrganization,
    );
    assertStrictEquals(elsewhere.status, 201);
    await elsewhere.body?.cancel();
    const starkOnly = await partBodiesOf<MembershipEntity>(
        await handleRequest(db, req(
            'GET',
            '/organizations/' + ORG + '/invitations/',
            admin,
        )),
    );
    assert(
        starkOnly.every(
            (body) => body.organization_id === ORG,
        ),
    );
    const otherOnly = await partBodiesOf<MembershipEntity>(
        await handleRequest(db, req(
            'GET',
            '/organizations/' + otherOrganization + '/invitations/',
            otherAdmin,
        )),
    );
    assertStrictEquals(otherOnly.length, 1);
    assertStrictEquals(
        otherOnly[0]!.organization_id, otherOrganization,
    );
    const own = await partBodiesOf<MembershipEntity>(
        await handleRequest(db, req(
            'GET',
            '/identities/' + pending.id + '/invitations/',
            pending.token,
        )),
    );
    assertEquals(
        own.map((body) => body.organization_id).sort(),
        [ORG, otherOrganization].sort(),
    );
    const notOwn = await handleRequest(db, req(
        'GET',
        '/identities/' + pending.id + '/invitations/',
        accepted.token,
    ));
    await assertError(
        notOwn, 403,
        'forbidden: invitation list is self or admin',
    );
});

Deno.test('a bad view query is 400 before the member rule',
async () => {
    const { db, admin } = await basis();
    const member = await person(db, 'member@example.com');
    const badState = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORG
            + '/invitations/?state=nope',
        member.token,
    ));
    await assertError(
        badState, 400,
        'state must be one of pending, accepted,'
            + ' declined, revoked, removed',
    );
    const extra = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORG
            + '/invitations/?state=pending&extra=1',
        admin,
    ));
    await assertError(
        extra, 400,
        'a view takes one ?state= and nothing else',
    );
});

Deno.test('a member reads accepted and removed, and a'
+ ' pending item is 404', async () => {
    const { db, admin } = await basis();
    const member = await person(db, 'reader@example.com');
    const pending = await person(db, 'hidden@example.com');
    const seated = await directSeat(
        db, admin, member.id, 'member',
        '2026-04-01T00:00:00.000000Z',
    );
    assertStrictEquals(seated.status, 201);
    await seated.body?.cancel();
    const granted = await grant(
        db, admin, pending.email,
        '2026-04-01T00:00:01.000000Z',
    );
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const gone = await person(db, 'gone@example.com');
    const goneSeat = await directSeat(
        db, admin, gone.id, 'member',
        '2026-04-01T00:00:02.000000Z',
    );
    await goneSeat.body?.cancel();
    const removed = await putState(
        db, 'organizations', ORG,
        membershipNameOf(ORG, gone.id), admin, {
            state: 'removed',
            at: '2026-04-01T00:00:03.000000Z',
        },
    );
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();

    const list = '/organizations/' + ORG + '/invitations/';
    for (const search of [
        '', '?state=pending', '?state=declined',
        '?state=revoked',
    ]) {
        const refused = await handleRequest(db, req(
            'GET', list + search, member.token,
        ));
        await assertError(refused, 403, MEMBER_VIEW);
    }
    const acceptedView = await handleRequest(db, req(
        'GET', list + '?state=accepted', member.token,
    ));
    assertStrictEquals(acceptedView.status, 200);
    assertEquals(
        await statesOf(acceptedView), ['accepted'],
    );
    const removedView = await handleRequest(db, req(
        'GET', list + '?state=removed', member.token,
    ));
    assertStrictEquals(removedView.status, 200);
    assertEquals(
        await statesOf(removedView), ['removed'],
    );
    const pendingName = membershipNameOf(ORG, pending.id);
    const pendingItem = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, pendingName),
        member.token,
    ));
    await assertError(
        pendingItem, 404,
        'Not found: invitations/' + pendingName,
    );
    const pendingVersions = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, pendingName)
            + '/versions/',
        member.token,
    ));
    await assertError(
        pendingVersions, 404,
        'Not found: invitations/' + pendingName,
    );
    const adminItem = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, pendingName),
        admin,
    ));
    assertStrictEquals(adminItem.status, 200);
    assertEquals(
        await membershipOf(adminItem),
        expected(
            pending.id, 'pending',
            '2026-04-01T00:00:01.000000Z',
        ),
    );
});

Deno.test('re-invite after decline is one pending document'
+ ' in both views', async () => {
    const { db, admin } = await basis();
    const invitee = await person(db, 'return@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, invitee.email,
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const declined = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'declined',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await declined.body?.cancel();
    const at = '2026-04-02T00:00:00.000000Z';
    const again = await grant(db, admin, invitee.email, at);
    assertStrictEquals(again.status, 201);
    assertEquals(
        await membershipOf(again),
        expected(invitee.id, 'pending', at),
    );
    assertStrictEquals(await putCount(db, name), 3);
    const organizationView = await partBodiesOf<MembershipEntity>(
        await handleRequest(db, req(
            'GET',
            '/organizations/' + ORG
                + '/invitations/?state=pending',
            admin,
        )),
    );
    assertEquals(organizationView, [
        expected(invitee.id, 'pending', at),
    ]);
    const identityView = await partBodiesOf<
        MembershipEntity
    >(await handleRequest(db, req(
        'GET',
        '/identities/' + invitee.id + '/invitations/',
        invitee.token,
    )));
    assertEquals(identityView, [
        expected(invitee.id, 'pending', at),
    ]);
});

Deno.test('version routes 404 a name never written and a'
+ ' foreign tag, and parts equal the history, oldest'
+ ' first', async () => {
    const { db, admin } = await basis();
    const missing = membershipNameOf(
        ORG, generateIdentifier(),
    );
    const absent = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, missing)
            + '/versions/',
        admin,
    ));
    await assertError(
        absent, 404, 'Not found: invitations/' + missing,
    );
    const invitee = await person(db, 'versions@example.com');
    const name = membershipNameOf(ORG, invitee.id);
    const granted = await grant(
        db, admin, invitee.email,
        '2026-04-01T00:00:00.000000Z',
    );
    await granted.body?.cancel();
    const accepted = await putState(
        db, 'identities', invitee.id, name, invitee.token, {
            state: 'accepted',
            at: '2026-04-01T00:00:01.000000Z',
        },
    );
    await accepted.body?.cancel();
    const removed = await putState(
        db, 'organizations', ORG, name, admin, {
            state: 'removed',
            at: '2026-04-01T00:00:02.000000Z',
        },
    );
    await removed.body?.cancel();
    const tag = generateIdentifier();
    const foreign = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, name)
            + '/versions/' + tag,
        admin,
    ));
    await assertError(
        foreign, 404, 'Not found: invitations/' + tag,
    );
    const versions = await handleRequest(db, req(
        'GET',
        itemPath('organizations', ORG, name) + '/versions/',
        admin,
    ));
    assertStrictEquals(versions.status, 200);
    const parts = await partsOf<MembershipEntity>(versions);
    const history = await db.messagePairs
        .getDocumentHistory('/invitations/', name);
    const puts = history.filter(
        (row) => row.method === 'PUT',
    );
    assertStrictEquals(parts.length, puts.length);
    for (let index = 0; index < puts.length; index++) {
        assertEquals(
            parts[index]!.body().toValue(),
            bodyOf(
                puts[index]!.response,
            ) as unknown as MembershipEntity,
        );
    }
    assertEquals(
        parts.map((part) => part.body().toValue().state),
        ['pending', 'accepted', 'removed'],
    );
    const acceptedView = await partBodiesOf<
        MembershipEntity
    >(await handleRequest(db, req(
        'GET',
        '/organizations/' + ORG
            + '/invitations/?state=accepted',
        admin,
    )));
    assert(
        acceptedView.every((body) => body.id !== name),
    );
});
