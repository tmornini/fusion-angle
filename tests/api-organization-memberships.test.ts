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
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest,
    partBodiesOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { captureConsole } from './fixtures/console-capture.ts';

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

function aiBody(id: string) {
    return {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: {
            name: 'Ops Assistant',
            description: 'Triage',
            skill_focus: 'routing',
            model: firstProviderModel().id,
        },
    };
}

function serviceBody(id: string) {
    return {
        id,
        kind: 'service',
        membership: { type: 'member', at: AT },
        service: {
            name: 'Nightly import',
            description: 'Loads the ledger export',
        },
    };
}

async function post(
    db: MemoryDbAdapter, token: string, body: unknown,
): Promise<Response> {
    return handleRequest(db, apiRequest({
        method: 'POST', path: nest('memberships'),
        token, body,
    }));
}

async function read(
    db: MemoryDbAdapter, token: string, path: string,
): Promise<Response> {
    return handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
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
            kind: 'human',
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

Deno.test('admin POST memberships creates one accepted AI',
async () => {
    const { db, admin, member } = await seeded();
    const id = generateIdentifier();
    const name = membershipNameOf(STARK, id);
    const body = aiBody(id);
    const created = await post(db, admin, body);
    assertStrictEquals(created.status, 201);
    assertStrictEquals(
        created.headers.get('location'),
        '/organizations/' + STARK + '/invitations/' + name,
    );
    assertEquals(await created.json(), {
        id: name, organization_id: STARK, identity_id: id,
        type: 'member', state: 'accepted', at: AT,
    });
    const identity = await read(
        db, admin, '/identities/' + id,
    );
    assertStrictEquals(identity.status, 200);
    assertEquals(
        await identity.json(), { id, kind: 'service' },
    );
    const agent = await read(
        db, admin,
        '/organizations/' + STARK + '/ai-agents/' + id,
    );
    assertStrictEquals(agent.status, 200);
    assertEquals(await agent.json(), { id, ...body.ai });
    assertStrictEquals(
        await db.messagePairs.getHeadPair(
            '/identities/' + id + '/', 'pii',
        ),
        null,
    );
    const count = (await db.messagePairs.getAll()).length;
    const resent = await post(db, admin, body);
    assertStrictEquals(resent.status, 409);
    await resent.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, count,
    );
    const forbidden = await post(
        db, member, aiBody(generateIdentifier()),
    );
    assertStrictEquals(forbidden.status, 403);
    await forbidden.body?.cancel();
});

Deno.test('admin POST memberships creates one accepted service',
async () => {
    const { db, admin, member } = await seeded();
    const id = generateIdentifier();
    const name = membershipNameOf(STARK, id);
    const body = serviceBody(id);
    const created = await post(db, admin, body);
    assertStrictEquals(created.status, 201);
    assertStrictEquals(
        created.headers.get('location'),
        '/organizations/' + STARK + '/invitations/' + name,
    );
    assertEquals(await created.json(), {
        id: name, organization_id: STARK, identity_id: id,
        type: 'member', state: 'accepted', at: AT,
    });
    const identity = await read(
        db, admin, '/identities/' + id,
    );
    assertStrictEquals(identity.status, 200);
    assertEquals(
        await identity.json(), { id, kind: 'service' },
    );
    const service = await read(
        db, admin,
        '/organizations/' + STARK + '/services/' + id,
    );
    assertStrictEquals(service.status, 200);
    assertEquals(
        await service.json(), { id, ...body.service },
    );
    assertStrictEquals(
        await db.messagePairs.getHeadPair(
            '/identities/' + id + '/', 'pii',
        ),
        null,
    );
    const count = (await db.messagePairs.getAll()).length;
    const resent = await post(db, admin, body);
    assertStrictEquals(resent.status, 409);
    await resent.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, count,
    );
    const forbidden = await post(
        db, member, serviceBody(generateIdentifier()),
    );
    assertStrictEquals(forbidden.status, 403);
    await forbidden.body?.cancel();
});

// No default member kind: a body that names none is
// refused, never read as a human.
Deno.test('a memberships POST names its member kind',
async () => {
    const { db, admin } = await seeded();
    const { kind: _kind, ...kindless } = aiBody(
        generateIdentifier(),
    );
    for (const body of [
        kindless,
        { ...aiBody(generateIdentifier()), kind: 'robot' },
        { ...aiBody(generateIdentifier()), kind: 'service' },
    ]) {
        const res = await post(db, admin, body);
        assertStrictEquals(res.status, 400);
        await res.body?.cancel();
    }
});

Deno.test('a service member PUT edits its live document',
async () => {
    const { db, admin } = await seeded();
    const id = generateIdentifier();
    const created = await post(db, admin, serviceBody(id));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const path = '/organizations/' + STARK + '/services/' + id;
    const held = await read(db, admin, path);
    assertStrictEquals(held.status, 200);
    await held.body?.cancel();
    const edited = { name: 'Nightly import', description: 'v2' };
    const put = await handleRequest(db, apiRequest({
        method: 'PUT', path, token: admin, body: edited,
        headers: { 'If-Match': held.headers.get('ETag')! },
    }));
    assertStrictEquals(put.status, 200);
    assertEquals(await put.json(), { id, ...edited });
});

Deno.test('an AI or service member is never created an'
    + ' organization admin', async () => {
    const { db, admin } = await seeded();
    for (const body of [
        aiBody(generateIdentifier()),
        serviceBody(generateIdentifier()),
    ]) {
        const res = await post(db, admin, {
            ...body, membership: { type: 'admin', at: AT },
        });
        assertStrictEquals(res.status, 400);
        assertEquals(await res.json(), {
            error: 'an AI or service member cannot be an'
                + ' organization admin',
        });
        assertStrictEquals(
            await db.messagePairs.getHeadPair(
                '/invitations/',
                membershipNameOf(STARK, body.id),
            ),
            null,
        );
    }
});

// A membership read carries its identity's kind, derived
// when served and never stored: the one rule every roster
// reader sorts members by.
Deno.test('a membership read carries its identity\'s kind',
async () => {
    const { db, admin } = await seeded();
    const id = generateIdentifier();
    const name = membershipNameOf(STARK, id);
    const created = await post(db, admin, serviceBody(id));
    assertStrictEquals(created.status, 201);
    const stored = await created.json() as Record<
        string, unknown
    >;
    assertStrictEquals(stored['identity_kind'], undefined);
    const listed = await read(db, admin, nest('memberships'));
    assertStrictEquals(listed.status, 200);
    const rows = await partBodiesOf<{
        identity_id: string;
        identity_kind?: string;
    }>(listed);
    assertEquals(
        Object.fromEntries(rows.map(
            (row) => [row.identity_id, row.identity_kind],
        )),
        {
            XXZruirZyAOoRpNxaDnpSA: 'person',
            [SARAH]: 'person',
            [id]: 'service',
        },
    );
    const item = await read(
        db, admin, nest('invitations') + name,
    );
    assertStrictEquals(item.status, 200);
    const seat = await item.json() as Record<string, unknown>;
    assertStrictEquals(seat['identity_kind'], 'service');
});

// Every seat's identity has a document (memberGeneses and
// postBootstrapIn write both), so a seat without one is
// the store's bug: both reads refuse it with their
// evidence, never serve it as a person.
Deno.test('a seat whose identity has no document refuses'
    + ' the read',
async () => {
    const { db, admin } = await seeded();
    const ghost = generateIdentifier();
    const name = membershipNameOf(STARK, ghost);
    const seated = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: nest('invitations') + name,
        token: admin,
        body: { state: 'accepted', type: 'member', at: AT },
        headers: { 'If-None-Match': '*' },
    }));
    assertStrictEquals(seated.status, 201);
    await seated.body?.cancel();
    for (
        const path of [
            nest('memberships'), nest('invitations') + name,
        ]
    ) {
        const { result: got, calls } = await captureConsole(
            'error', () => read(db, admin, path),
        );
        assertStrictEquals(got.status, 500, path);
        assertEquals(await got.json(), { error: 'internal error' });
        assertStrictEquals(calls.length, 1, path);
        const [event, , error] = calls[0]!;
        assertStrictEquals(event, 'request failed');
        assertStrictEquals(
            (error as Error).message,
            'no identity document for ' + ghost,
        );
    }
});
