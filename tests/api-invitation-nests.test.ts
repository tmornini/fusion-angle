import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { routes, matchRoute } from
    '../api/routes.ts';
import { pathSegmentsOf } from
    '../api/path-segments.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken, reachableToken } from
    './token-fixtures.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';
import { seedPersonIdentity } from
    './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import { deriveDocumentsAt } from
    '../api/derive-documents.ts';
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

function match(path: string) {
    return matchRoute(
        routes, pathSegmentsOf(path),
    );
}

Deno.test('invitation /sent is absent', () => {
    assertStrictEquals(
        match('/invitations/sent'), null,
    );
});

Deno.test('named invitation POST ops are absent',
() => {
    assertStrictEquals(
        match('/invitations/fndCYAsXazdzMUlEGMNIZw/acceptance'),
        null,
    );
    assertStrictEquals(
        match('/invitations/fndCYAsXazdzMUlEGMNIZw/decline'),
        null,
    );
    assertStrictEquals(
        match('/invitations/fndCYAsXazdzMUlEGMNIZw/revocation'),
        null,
    );
});

Deno.test('unscoped GET /invitations/ is absent',
() => {
    assertStrictEquals(match('/invitations/'), null);
    assertStrictEquals(match('/invitations'), null);
});

Deno.test('organization nest offers GET POST on /'
    + ' and GET PUT on the item', () => {
    const col = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/',
    );
    assert(col);
    assertStrictEquals(typeof col.route.select, 'function');
    assertStrictEquals(col.route.get, undefined);
    assertStrictEquals(typeof col.route.post, 'function');
    const item = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
            + 'fndCYAsXazdzMUlEGMNIZw',
    );
    assert(item);
    assertStrictEquals(typeof item.route.select, 'function');
    assertStrictEquals(item.route.get, undefined);
    assertStrictEquals(typeof item.route.put, 'function');
});

Deno.test('identity nest offers GET on / and'
    + ' GET PUT on the item', () => {
    const col = match(
        '/identities/' + generateIdentifier() + '/invitations/',
    );
    assert(col);
    assertStrictEquals(typeof col.route.select, 'function');
    assertStrictEquals(col.route.get, undefined);
    assertStrictEquals(col.route.post, undefined);
    const item = match(
        '/identities/' + generateIdentifier()
            + '/invitations/fndCYAsXazdzMUlEGMNIZw',
    );
    assert(item);
    assertStrictEquals(typeof item.route.select, 'function');
    assertStrictEquals(item.route.get, undefined);
    assertStrictEquals(typeof item.route.put, 'function');
});

const AT = '2026-01-01T00:00:00.000000Z';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';
const DAVE = generateIdentifier();
const SARAH_WAYNE = membershipNameOf(WAYNE, SARAH);
const DAVE_WAYNE = membershipNameOf(WAYNE, DAVE);

async function seedPerson(
    db: DbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await seedPersonIdentity(db, id, {
        name, email, phone: '', bio: '',
    });
}

async function seedWorld(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'AjdvjuECVZEgZoFajaIEkg', 'Stark');
    await seedOrganizationDocument(db, 'BBjWJsjYIDkTRKIIPrzWRw', 'Wayne');
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        await seedSeat(
            db, organization, 'XXZruirZyAOoRpNxaDnpSA', 'admin', AT,
        );
    }
    await seedPerson(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'Tony', 'demo@example.com',
    );
    await seedPerson(
        db, 'toccYYkLEABmlbpHJalgtQ', 'Sarah', 'sarah@x.com',
    );
    await seedSeat(db, 'AjdvjuECVZEgZoFajaIEkg', 'toccYYkLEABmlbpHJalgtQ'
        , 'member', AT);
    await seedPerson(db, DAVE, 'Dave', 'dave@x.com');
    return db;
}

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

async function grantWayne(
    db: DbAdapter,
    email: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        { email, grantAt: AT },
    ));
}

async function membershipsFor(
    db: DbAdapter,
    identityId: string,
): Promise<string[]> {
    const organizations = await deriveOrganizations(db);
    const ids: string[] = [];
    for (const organization of organizations) {
        const seatPrefix = '/organizations/'
            + organization.id + '/members/';
        const [seatRequests] =
            await Promise.all([
                db.messagePairs.getCollectionPairs(seatPrefix,
                ),
                db.messagePairs.getCollectionPairs(seatPrefix,
                ),
            ]);
        for (const document of deriveDocumentsAt(
            seatRequests, seatPrefix,
        ).values()) {
            if (document.name === identityId) {
                ids.push(organization.id);
            }
        }
    }
    return ids.sort();
}

Deno.test('admin POST org nest grants pending',
async () => {
    const db = await seedWorld();
    const res = await grantWayne(db, 'sarah@x.com');
    assertStrictEquals(res.status, 201);
    const body = await res.json() as {
        id: string;
        state: string;
        organization_id: string;
        identity_id: string;
    };
    assertStrictEquals(body.id, SARAH_WAYNE);
    assertStrictEquals(body.state, 'pending');
    assertStrictEquals(body.organization_id, 'BBjWJsjYIDkTRKIIPrzWRw');
    assertStrictEquals(body.identity_id, 'toccYYkLEABmlbpHJalgtQ');
    const invitations = await deriveInvitations(db);
    assertStrictEquals(invitations.length, 4);
    const grant = invitations.find(
        (row) => row.id === SARAH_WAYNE,
    );
    assert(grant !== undefined);
    assertStrictEquals(grant.state, 'pending');
    const mirrored = [
        membershipNameOf(
            'AjdvjuECVZEgZoFajaIEkg',
            'XXZruirZyAOoRpNxaDnpSA',
        ),
        membershipNameOf(
            WAYNE, 'XXZruirZyAOoRpNxaDnpSA',
        ),
        membershipNameOf(
            'AjdvjuECVZEgZoFajaIEkg', SARAH,
        ),
    ];
    for (const id of mirrored) {
        const row = invitations.find(
            (item) => item.id === id,
        );
        assert(row !== undefined);
        assertStrictEquals(row.state, 'accepted');
    }
});

Deno.test('invitee PUT identity nest accepted writes'
    + ' the seat', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com');
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + SARAH_WAYNE,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(res.status, 200);
    assertEquals(
        await membershipsFor(db, 'toccYYkLEABmlbpHJalgtQ'),
        ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
    );
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === SARAH_WAYNE)!;
    assertStrictEquals(row.state, 'accepted');
});

Deno.test('invitee PUT declined', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'dave@x.com');
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + DAVE
            + '/invitations/' + DAVE_WAYNE,
        await organizationToken(DAVE, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'declined',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(res.status, 200);
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === DAVE_WAYNE)!;
    assertStrictEquals(row.state, 'declined');
    assertEquals(
        await membershipsFor(db, DAVE),
        [],
    );
});

Deno.test('admin PUT org nest revoked', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com');
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + SARAH_WAYNE,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            state: 'revoked',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(res.status, 200);
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === SARAH_WAYNE)!;
    assertStrictEquals(row.state, 'revoked');
});

Deno.test('invitee PUT revoked is 409', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com');
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + SARAH_WAYNE,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'revoked',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(res.status, 409);
    assertEquals(await res.json(), {
        error: 'no transition from pending to revoked'
            + ' for the invitee',
    });
});

Deno.test('admin PUT accepted on a pending head is 409',
async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com');
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + SARAH_WAYNE,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            state: 'accepted',
            type: 'member',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(res.status, 409);
    assertEquals(await res.json(), {
        error: 'no transition from pending to accepted'
            + ' for the admin',
    });
});

Deno.test('a second accept latched on the accepted head'
+ ' is 409 and stores nothing',
async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com');
    const first = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + SARAH_WAYNE,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(first.status, 200);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + SARAH_WAYNE,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:02.000000Z',
        },
    )));
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('org-less invitee reaches identity nest',
async () => {
    const db = await seedWorld();
    await grantWayne(db, 'dave@x.com');
    const token = await reachableToken(DAVE, []);
    const list = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/',
        token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await partsOf<MembershipEntity>(list);
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.body().toValue().state, 'pending');
    const acc = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + DAVE
            + '/invitations/' + DAVE_WAYNE,
        token,
        {
            state: 'accepted',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    assertStrictEquals(acc.status, 200);
    assertEquals(
        await membershipsFor(db, DAVE),
        ['BBjWJsjYIDkTRKIIPrzWRw'],
    );
});

Deno.test('the invitation item GETs carry their head\'s ETag',
async () => {
    const db = await seedWorld();
    const granted = await grantWayne(db, 'sarah@x.com');
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const head = await db.messagePairs.getHeadPair(
        '/invitations/', SARAH_WAYNE,
    );
    assert(head !== null);
    const invitee = await handleRequest(db, req(
        'GET',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + SARAH_WAYNE,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
    ));
    assertStrictEquals(invitee.status, 200);
    await invitee.body?.cancel();
    assertStrictEquals(
        invitee.headers.get('etag'), '"' + head.id + '"',
    );
    const admin = await handleRequest(db, req(
        'GET',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + SARAH_WAYNE,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
    ));
    assertStrictEquals(admin.status, 200);
    await admin.body?.cancel();
    assertStrictEquals(
        admin.headers.get('etag'), '"' + head.id + '"',
    );
});
