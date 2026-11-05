import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    apiRequest,
    invitationLatched,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import { membershipNameOf } from '../shared/membership-name.ts';
import type {
    MembershipEntity,
    MembershipReadEntity,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';

// A memberships QUERY serves the memberships GET's joined
// parts whose memberships match the search text, best
// first, in the state the GET's ?state= names. A
// membership matches on its own fields, its join, and what
// its member's AI, service, or profile document serves
// this caller, never on a value the caller's GET would
// hide.

const TONY = 'XXZruirZyAOoRpNxaDnpSA';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const OTHER_ORGANIZATION = 'BBjWJsjYIDkTRKIIPrzWRw';
const AT = '2026-04-01T00:00:00.000000Z';
const MEMBERSHIPS = '/organizations/' + ORGANIZATION + '/memberships/';
const REMOVED = MEMBERSHIPS + '?state=removed';
const ENGINEER = { title: 'Engineer', department: 'Product' };

type Profile = {
    readonly title: string,
    readonly department: string,
};

type Seated = {
    readonly id: string,
    readonly name: string,
    readonly token: string,
};

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method, path, token,
        ...(body !== undefined ? { body } : {}),
    });
}

async function basis(): Promise<{
    db: MemoryDbAdapter;
    admin: string;
}> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, ORGANIZATION, 'Stark');
    await seedPersonIdentity(db, TONY, {
        name: 'Tony',
        email: 'tony@example.com',
        phone: '',
        bio: '',
    });
    return {
        db,
        admin: await organizationToken(TONY, ORGANIZATION),
    };
}

async function seat(
    db: MemoryDbAdapter,
    admin: string,
    body: Record<string, unknown>,
    type: MembershipEntity['type'],
): Promise<string> {
    const id = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST', MEMBERSHIPS, admin,
        { id, ...body, membership: { type, at: AT } },
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    return membershipNameOf(ORGANIZATION, id);
}

async function human(
    db: MemoryDbAdapter,
    admin: string,
    name: string,
    email: string,
    profile: Profile,
    type: MembershipEntity['type'],
): Promise<Seated> {
    const membership = await seat(db, admin, {
        kind: 'human',
        identity: { ...profile, strengths: [], team_dimensions: {} },
        pii: { name, email, phone: '', bio: '' },
    }, type);
    const id = membership.split(':')[1]!;
    return {
        id,
        name: membership,
        token: await organizationToken(id, ORGANIZATION),
    };
}

async function removed(
    db: MemoryDbAdapter,
    admin: string,
    membership: string,
): Promise<void> {
    const res = await handleRequest(db, await invitationLatched(
        db, req(
            'PUT',
            '/organizations/' + ORGANIZATION + '/invitations/' + membership,
            admin,
            { state: 'removed', at: '2026-04-01T00:00:09.000000Z' },
        ),
    ));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
}

type World = {
    readonly db: MemoryDbAdapter,
    readonly admin: string,
    readonly reader: Seated,
    readonly zebulon: Seated,
    readonly oriana: Seated,
    readonly ai: string,
    readonly service: string,
};

async function world(): Promise<World> {
    const { db, admin } = await basis();
    const reader = await human(
        db, admin, 'Reader Person', 'reader@example.com',
        ENGINEER, 'member',
    );
    const zebulon = await human(
        db, admin, 'Zebulon Quartermaine', 'zebulon@example.com',
        { title: 'Lighthouse Keeper', department: 'Maritime' },
        'member',
    );
    const oriana = await human(
        db, admin, 'Oriana Fallaci', 'oriana@example.com',
        ENGINEER, 'admin',
    );
    const ai = await seat(db, admin, {
        kind: 'ai',
        ai: {
            name: 'Ops Assistant',
            description: 'Triages the overnight queue',
            skill_focus: 'routing',
            model: firstProviderModel().id,
        },
    }, 'member');
    const service = await seat(db, admin, {
        kind: 'service',
        service: {
            name: 'Nightly import',
            description: 'Loads the ledger export',
        },
    }, 'member');
    return { db, admin, reader, zebulon, oriana, ai, service };
}

function query(
    db: MemoryDbAdapter,
    token: string,
    path: string,
    body: unknown,
): Promise<Response> {
    return handleRequest(db, req('QUERY', path, token, body));
}

async function matchedIds(
    db: MemoryDbAdapter,
    token: string,
    path: string,
    text: string,
): Promise<string[]> {
    const res = await query(db, token, path, { q: text });
    if (res.status === 204) {
        await res.body?.cancel();
        return [];
    }
    assertStrictEquals(res.status, 200);
    return (await partsOf<{ id: string }>(res))
        .map((part) => part.body().toValue().id);
}

// The reader is a plain member: what it matches, any
// member's GET serves.
async function readerMatches(text: string): Promise<{
    w: World,
    ids: string[],
}> {
    const w = await world();
    return {
        w,
        ids: await matchedIds(
            w.db, w.reader.token, MEMBERSHIPS, text,
        ),
    };
}

Deno.test('matches a human by a typo in the name', async () => {
    const { w, ids } = await readerMatches('zebulun');
    assertEquals(ids, [w.zebulon.name]);
});

Deno.test('matches a human by email', async () => {
    const { w, ids } = await readerMatches('zebulon@example.com');
    assertEquals(ids, [w.zebulon.name]);
});

Deno.test('matches a human by identity id', async () => {
    const w = await world();
    assertEquals(
        await matchedIds(
            w.db, w.reader.token, MEMBERSHIPS, w.zebulon.id,
        ),
        [w.zebulon.name],
    );
});

Deno.test('matches a human by role', async () => {
    const { w, ids } = await readerMatches('admin');
    assertEquals(ids, [w.oriana.name]);
});

Deno.test('matches an AI by description', async () => {
    const { w, ids } = await readerMatches('overnight queue');
    assertEquals(ids, [w.ai]);
});

Deno.test('matches a service by name', async () => {
    const { w, ids } = await readerMatches('nightly import');
    assertEquals(ids, [w.service]);
});

Deno.test('ranks exact above typo', async () => {
    const { db, admin } = await basis();
    const typo = await human(
        db, admin, 'Kestral Moss', 'one@example.com',
        ENGINEER, 'member',
    );
    const exact = await human(
        db, admin, 'Kestrel Moss', 'two@example.com',
        ENGINEER, 'member',
    );
    const listed = await handleRequest(
        db, req('GET', MEMBERSHIPS, typo.token),
    );
    assertEquals(
        (await partsOf<{ id: string }>(listed))
            .map((part) => part.body().toValue().id),
        [typo.name, exact.name],
    );
    assertEquals(
        await matchedIds(db, typo.token, MEMBERSHIPS, 'kestrel'),
        [exact.name, typo.name],
    );
});

Deno.test('an erased member\'s email does not match', async () => {
    const w = await world();
    const erased = await handleRequest(w.db, req(
        'DELETE', '/identities/' + w.zebulon.id + '/pii', w.admin,
    ));
    assertStrictEquals(erased.status, 204);
    await erased.body?.cancel();
    const res = await query(
        w.db, w.reader.token, MEMBERSHIPS,
        { q: 'zebulon@example.com' },
    );
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
});

Deno.test('a member cannot match a profile title; an admin can',
async () => {
    const w = await world();
    const hidden = await query(
        w.db, w.reader.token, MEMBERSHIPS,
        { q: 'lighthouse keeper' },
    );
    assertStrictEquals(hidden.status, 204);
    await hidden.body?.cancel();
    assertEquals(
        await matchedIds(
            w.db, w.admin, MEMBERSHIPS, 'lighthouse keeper',
        ),
        [w.zebulon.name],
    );
    assertEquals(
        await matchedIds(w.db, w.admin, MEMBERSHIPS, 'maritime'),
        [w.zebulon.name],
    );
});

// The identities/:id GET names only an identity seated in
// the caller's organization, so no caller reads a former
// member's profile.
Deno.test('an admin cannot match a removed member\'s profile'
+ ' title', async () => {
    const w = await world();
    await removed(w.db, w.admin, w.zebulon.name);
    const profile = await query(
        w.db, w.admin, REMOVED, { q: 'lighthouse keeper' },
    );
    assertStrictEquals(profile.status, 204);
    await profile.body?.cancel();
    assertEquals(
        await matchedIds(w.db, w.admin, REMOVED, 'zebulon'),
        [w.zebulon.name],
    );
});

Deno.test('?state=removed searches former members', async () => {
    const w = await world();
    await removed(w.db, w.admin, w.zebulon.name);
    assertEquals(
        await matchedIds(w.db, w.reader.token, REMOVED, 'zebulon'),
        [w.zebulon.name],
    );
    assertEquals(
        await matchedIds(
            w.db, w.reader.token, MEMBERSHIPS, 'zebulon',
        ),
        [],
    );
    assertEquals(
        await matchedIds(w.db, w.reader.token, REMOVED, 'oriana'),
        [],
    );
});

// The GET's own judge refuses the state, in the GET's words.
Deno.test('?state=bogus is 400', async () => {
    const w = await world();
    const bogus = MEMBERSHIPS + '?state=bogus';
    const res = await query(
        w.db, w.reader.token, bogus, { q: 'zebulon' },
    );
    const got = await handleRequest(
        w.db, req('GET', bogus, w.reader.token),
    );
    assertStrictEquals(res.status, 400);
    assertStrictEquals(got.status, 400);
    const error = {
        error: 'state must be one of pending, accepted,'
            + ' declined, revoked, removed',
    };
    assertEquals(await res.json(), error);
    assertEquals(await got.json(), error);
});

Deno.test('nothing matches is 204', async () => {
    const w = await world();
    const res = await query(
        w.db, w.reader.token, MEMBERSHIPS,
        { q: 'xylophone quasar' },
    );
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
});

Deno.test('a bad body is 400', async () => {
    const w = await world();
    const res = await query(
        w.db, w.reader.token, MEMBERSHIPS, { q: 5 },
    );
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('a foreign path is 403', async () => {
    const w = await world();
    const res = await handleRequest(w.db, req(
        'QUERY', '/organizations/' + OTHER_ORGANIZATION + '/memberships/',
        w.reader.token, { q: 'zebulon' },
    ));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});

// Two transmissions of one message differ only in the
// lines that name each transmission.
function withoutTransmission(message: HttpMessage): string {
    return message.withFieldDeleted('date')
        .withFieldDeleted('request-id').toWire();
}

Deno.test('a part is the GET\'s joined part', async () => {
    const w = await world();
    const matched = await partsOf<{ id: string }>(
        await query(
            w.db, w.reader.token, MEMBERSHIPS, { q: 'zebulon' },
        ),
    );
    const listed = await partsOf<MembershipReadEntity>(
        await handleRequest(
            w.db, req('GET', MEMBERSHIPS, w.reader.token),
        ),
    );
    const listedPart = listed.find((part) =>
        part.body().toValue().id === w.zebulon.name);
    assert(listedPart !== undefined);
    assertEquals(
        listedPart.body().toValue(),
        {
            id: w.zebulon.name,
            organization_id: ORGANIZATION,
            identity_id: w.zebulon.id,
            type: 'member',
            at: AT,
            state: 'accepted',
            identity_kind: 'person',
            invitee_name: 'Zebulon Quartermaine',
            invitee_email: 'zebulon@example.com',
        },
    );
    assertEquals(
        matched.map(withoutTransmission),
        [withoutTransmission(listedPart)],
    );
});
