import {
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { bodyOf } from '../api/derive-documents.ts';
import { seatsPrefixFor } from '../api/derive-memberships.ts';
import { membershipOf } from '../api/memberships.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import {
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const AT = '2026-04-01T00:00:00.000000Z';
const LATER = '2026-04-01T00:00:01.000000Z';

async function fresh(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// A live seat is a PUT head. membershipOf is null for
// every state but accepted, so absence agrees with a
// missing seat and with a DELETE head.
async function agree(
    db: MemoryDbAdapter,
    organization: string,
    identity: string,
): Promise<void> {
    const head = await db.messagePairs.getHeadPair(
        seatsPrefixFor(organization), identity,
    );
    const live = head !== null && head.method === 'PUT';
    const membership = await membershipOf(
        db, organization, identity,
    );
    assertStrictEquals(live, membership !== null);
    if (!live || membership === null || head === null) {
        return;
    }
    assertStrictEquals(
        bodyOf(head.response)['type'], membership.type,
    );
}

async function expectStatus(
    response: Response,
    status: number,
): Promise<void> {
    try {
        assertStrictEquals(response.status, status);
    } finally {
        await response.body?.cancel();
    }
}

function seatPath(identity: string): string {
    return '/organizations/' + ORGANIZATION
        + '/members/' + identity;
}

function itemPath(identity: string): string {
    const name = membershipNameOf(ORGANIZATION, identity);
    return '/organizations/' + ORGANIZATION
        + '/invitations/' + name;
}

async function person(
    db: MemoryDbAdapter,
    email: string,
): Promise<{ id: string; token: string }> {
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: email, email, phone: '', bio: '',
    });
    return {
        id,
        token: await organizationToken(id, ORGANIZATION),
    };
}

Deno.test('seedSeat genesis agrees with the membership',
async () => {
    const db = await fresh();
    const identity = generateIdentifier();
    await seedSeat(
        db, ORGANIZATION, identity, 'member', AT,
    );
    await agree(db, ORGANIZATION, identity);
});

Deno.test('a seat PUT changing type agrees', async () => {
    const db = await fresh();
    const identity = generateIdentifier();
    await seedSeat(
        db, ORGANIZATION, identity, 'member', AT,
    );
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'PUT',
        path: seatPath(identity),
        token: DEV_TOKEN,
        body: { type: 'admin', at: LATER },
    })), 200);
    await agree(db, ORGANIZATION, identity);
});

Deno.test('a seat DELETE through handleRequest agrees',
async () => {
    const db = await fresh();
    const identity = generateIdentifier();
    await seedSeat(
        db, ORGANIZATION, identity, 'member', AT,
    );
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'DELETE',
        path: seatPath(identity),
        token: DEV_TOKEN,
    })), 204);
    await agree(db, ORGANIZATION, identity);
});

Deno.test('a seat PUT re-seating agrees', async () => {
    const db = await fresh();
    const identity = generateIdentifier();
    await seedSeat(
        db, ORGANIZATION, identity, 'member', AT,
    );
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'DELETE',
        path: seatPath(identity),
        token: DEV_TOKEN,
    })), 204);
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'PUT',
        path: seatPath(identity),
        token: DEV_TOKEN,
        body: { type: 'admin', at: LATER },
    })), 201);
    await agree(db, ORGANIZATION, identity);
});

Deno.test(
    'a direct seat through the membership PUT agrees',
    async () => {
        const db = await fresh();
        const invitee = await person(db, 'direct@example.com');
        await expectStatus(await handleRequest(
            db, apiRequest({
                method: 'PUT',
                path: itemPath(invitee.id),
                token: DEV_TOKEN,
                body: {
                    state: 'accepted', type: 'member', at: AT,
                },
                headers: { 'If-None-Match': '*' },
            }),
        ), 201);
        await agree(db, ORGANIZATION, invitee.id);
    },
);

Deno.test('a grant then an accept agrees', async () => {
    const db = await fresh();
    const invitee = await person(db, 'accept@example.com');
    const name = membershipNameOf(
        ORGANIZATION, invitee.id,
    );
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + ORGANIZATION
            + '/invitations/',
        token: DEV_TOKEN,
        body: { email: 'accept@example.com', grantAt: AT },
    })), 201);
    await expectStatus(await handleRequest(
        db, await invitationLatched(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + invitee.id
                + '/invitations/' + name,
            token: invitee.token,
            body: { state: 'accepted', at: LATER },
        })),
    ), 200);
    await agree(db, ORGANIZATION, invitee.id);
});

Deno.test('a membership removal agrees', async () => {
    const db = await fresh();
    const invitee = await person(db, 'remove@example.com');
    const name = membershipNameOf(
        ORGANIZATION, invitee.id,
    );
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + ORGANIZATION
            + '/invitations/',
        token: DEV_TOKEN,
        body: { email: 'remove@example.com', grantAt: AT },
    })), 201);
    await expectStatus(await handleRequest(
        db, await invitationLatched(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + invitee.id
                + '/invitations/' + name,
            token: invitee.token,
            body: { state: 'accepted', at: LATER },
        })),
    ), 200);
    await expectStatus(await handleRequest(
        db, await invitationLatched(db, apiRequest({
            method: 'PUT',
            path: itemPath(invitee.id),
            token: DEV_TOKEN,
            body: {
                state: 'removed',
                at: '2026-04-01T00:00:02.000000Z',
            },
        })),
    ), 200);
    await agree(db, ORGANIZATION, invitee.id);
});

Deno.test('a membership type change agrees', async () => {
    const db = await fresh();
    const invitee = await person(db, 'retype@example.com');
    const name = membershipNameOf(
        ORGANIZATION, invitee.id,
    );
    await expectStatus(await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + ORGANIZATION
            + '/invitations/',
        token: DEV_TOKEN,
        body: { email: 'retype@example.com', grantAt: AT },
    })), 201);
    await expectStatus(await handleRequest(
        db, await invitationLatched(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + invitee.id
                + '/invitations/' + name,
            token: invitee.token,
            body: { state: 'accepted', at: LATER },
        })),
    ), 200);
    await expectStatus(await handleRequest(
        db, await invitationLatched(db, apiRequest({
            method: 'PUT',
            path: itemPath(invitee.id),
            token: DEV_TOKEN,
            body: {
                state: 'accepted',
                type: 'admin',
                at: '2026-04-01T00:00:02.000000Z',
            },
        })),
    ), 200);
    await agree(db, ORGANIZATION, invitee.id);
});
