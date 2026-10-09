import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedPersonIdentity } from
    './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    apiRequest,
    partBodiesOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';
const DAVE = generateIdentifier();
const AT = '2026-01-01T00:00:00.000000Z';
const EXPIRES_AT = '2099-12-31T00:00:00.000000Z';
const INVITATION_ALPHABET =
    'state must be one of pending, declined, revoked';
const MEMBERSHIP_ALPHABET =
    'state must be one of accepted, removed';

function nest(
    view: 'memberships' | 'invitations',
    search = '',
): string {
    return '/organizations/' + STARK + '/' + view + '/'
        + search;
}

async function seeded(): Promise<{
    db: MemoryDbAdapter;
    admin: string;
    member: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedPersonIdentity(db, SARAH, {
        name: 'Sarah',
        email: 'sarah@x.com',
        phone: '',
        bio: '',
    });
    await seedSeat(db, STARK, SARAH, 'member', AT);
    await seedPersonIdentity(db, DAVE, {
        name: 'Dave',
        email: 'dave@x.com',
        phone: '',
        bio: '',
    });
    const admin = await organizationToken();
    const invited = await handleRequest(db, apiRequest({
        method: 'POST',
        path: nest('invitations'),
        token: admin,
        body: {
            email: 'dave@x.com',
            at: AT,
            expiresAt: EXPIRES_AT,
        },
    }));
    assertStrictEquals(invited.status, 201);
    await invited.body?.cancel();
    return {
        db,
        admin,
        member: await organizationToken(SARAH, STARK),
    };
}

async function statesOf(
    db: MemoryDbAdapter,
    path: string,
    token: string,
): Promise<{ status: number; states: string[] }> {
    const response = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    if (response.status !== 200) {
        const text = await response.text();
        return { status: response.status, states: [text] };
    }
    const rows = await partBodiesOf<{ state: string }>(
        response,
    );
    return {
        status: response.status,
        states: rows.map((row) => row.state),
    };
}

Deno.test('admin GET memberships defaults to accepted',
async () => {
    const { db, admin } = await seeded();
    const got = await statesOf(
        db, nest('memberships'), admin,
    );
    assertStrictEquals(got.status, 200);
    assert(got.states.length > 0);
    assert(got.states.every(
        (state) => state === 'accepted',
    ));
});

Deno.test('member GET memberships ?state=removed is'
    + ' the removed view', async () => {
    const { db, member } = await seeded();
    const response = await handleRequest(
        db, apiRequest({
            method: 'GET',
            path: nest('memberships', '?state=removed'),
            token: member,
        }),
    );
    assert(
        response.status === 200
            || response.status === 204,
    );
    if (response.status === 204) {
        await response.body?.cancel();
        return;
    }
    const rows = await partBodiesOf<{ state: string }>(
        response,
    );
    assert(rows.every((row) => row.state === 'removed'));
});

Deno.test('member GET memberships ?state=pending names'
    + ' the memberships alphabet', async () => {
    const { db, member } = await seeded();
    const response = await handleRequest(
        db, apiRequest({
            method: 'GET',
            path: nest('memberships', '?state=pending'),
            token: member,
        }),
    );
    assertStrictEquals(response.status, 400);
    assertEquals(await response.json(), {
        error: MEMBERSHIP_ALPHABET,
    });
});

Deno.test('admin GET invitations defaults to pending',
async () => {
    const { db, admin } = await seeded();
    const got = await statesOf(
        db, nest('invitations'), admin,
    );
    assert(
        got.status === 200 || got.status === 204,
    );
    if (got.status === 204) return;
    assert(got.states.length > 0);
    assert(got.states.every(
        (state) => state === 'pending',
    ));
});

Deno.test('member GET invitations is forbidden',
async () => {
    const { db, member } = await seeded();
    const response = await handleRequest(
        db, apiRequest({
            method: 'GET',
            path: nest('invitations'),
            token: member,
        }),
    );
    assertStrictEquals(response.status, 403);
    await response.body?.cancel();
});

Deno.test('admin GET invitations ?state=declined is'
    + ' the declined view', async () => {
    const { db, admin } = await seeded();
    const response = await handleRequest(
        db, apiRequest({
            method: 'GET',
            path: nest('invitations', '?state=declined'),
            token: admin,
        }),
    );
    assert(
        response.status === 200
            || response.status === 204,
    );
    if (response.status === 204) {
        await response.body?.cancel();
        return;
    }
    const rows = await partBodiesOf<{ state: string }>(
        response,
    );
    assert(rows.every((row) => row.state === 'declined'));
});

Deno.test('admin GET invitations ?state=accepted names'
    + ' the invitations alphabet', async () => {
    const { db, admin } = await seeded();
    const response = await handleRequest(
        db, apiRequest({
            method: 'GET',
            path: nest('invitations', '?state=accepted'),
            token: admin,
        }),
    );
    assertStrictEquals(response.status, 400);
    assertEquals(await response.json(), {
        error: INVITATION_ALPHABET,
    });
});

Deno.test(
    'admin POST memberships creates one accepted'
    + ' person',
    async () => {
        const { db, admin, member } = await seeded();
        const id = generateIdentifier();
        const name = membershipNameOf(STARK, id);
        const body = {
            id,
            membership: { type: 'member', at: AT },
            identity: {
                title: 'Engineer',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
            pii: {
                name: 'Ada',
                email: 'ada@x.com',
                phone: '',
                bio: '',
            },
        };
        const created = await handleRequest(
            db, apiRequest({
                method: 'POST',
                path: nest('memberships'),
                token: admin,
                body,
            }),
        );
        assertStrictEquals(created.status, 201);
        assertStrictEquals(
            created.headers.get('location'),
            '/organizations/' + STARK
                + '/invitations/' + name,
        );
        const etag = created.headers.get('etag');
        assert(etag !== null && etag !== '');
        assertEquals(await created.json(), {
            id: name,
            organization_id: STARK,
            identity_id: id,
            type: 'member',
            state: 'accepted',
            at: AT,
        });
        const membership = await db.messagePairs
            .getHeadPair('/invitations/', name);
        assert(membership !== null);
        assertStrictEquals(
            etag, '"' + membership.id + '"',
        );
        const identity = await db.messagePairs
            .getHeadPair('/identities/', id);
        assert(identity !== null);
        const pii = await db.messagePairs.getHeadPair(
            '/identities/' + id + '/', 'pii',
        );
        assert(pii !== null);
        const count = (
            await db.messagePairs.getAll()
        ).length;
        const resent = await handleRequest(
            db, apiRequest({
                method: 'POST',
                path: nest('memberships'),
                token: admin,
                body,
            }),
        );
        assertStrictEquals(resent.status, 409);
        await resent.body?.cancel();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            count,
        );
        const forbidden = await handleRequest(
            db, apiRequest({
                method: 'POST',
                path: nest('memberships'),
                token: member,
                body: {
                    ...body,
                    id: generateIdentifier(),
                },
            }),
        );
        assertStrictEquals(forbidden.status, 403);
        await forbidden.body?.cancel();
        const incomplete = await handleRequest(
            db, apiRequest({
                method: 'POST',
                path: nest('memberships'),
                token: admin,
                body: {
                    ...body,
                    id: generateIdentifier(),
                    identity: {
                        department: 'Product',
                        strengths: [],
                        team_dimensions: {},
                    },
                },
            }),
        );
        assertStrictEquals(incomplete.status, 400);
        await incomplete.body?.cancel();
        const listed = await handleRequest(
            db, apiRequest({
                method: 'GET',
                path: nest('memberships'),
                token: admin,
            }),
        );
        assertStrictEquals(listed.status, 200);
        const rows = await partBodiesOf<{
            identity_id: string;
        }>(listed);
        assert(rows.some(
            (row) => row.identity_id === id,
        ));
    },
);
