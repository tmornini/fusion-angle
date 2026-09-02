import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { routes, matchRoute } from
    '../api/routes.ts';
import { pathSegmentsOf } from
    '../api/path-segments.ts';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken, reachableToken } from
    './token-fixtures.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';
import { seedIdentityPii } from
    './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import { deriveDocumentsAt } from
    '../api/derive-documents.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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
    assertStrictEquals(typeof col.route.get, 'function');
    assertStrictEquals(typeof col.route.post, 'function');
    const item = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
            + 'fndCYAsXazdzMUlEGMNIZw',
    );
    assert(item);
    assertStrictEquals(typeof item.route.get, 'function');
    assertStrictEquals(typeof item.route.put, 'function');
});

Deno.test('identity nest offers GET on / and'
    + ' GET PUT on the item', () => {
    const col = match(
        '/identities/' + generateIdentifier() + '/invitations/',
    );
    assert(col);
    assertStrictEquals(typeof col.route.get, 'function');
    assertStrictEquals(col.route.post, undefined);
    const item = match(
        '/identities/' + generateIdentifier()
            + '/invitations/fndCYAsXazdzMUlEGMNIZw',
    );
    assert(item);
    assertStrictEquals(typeof item.route.get, 'function');
    assertStrictEquals(typeof item.route.put, 'function');
});

const AT = '2026-01-01T00:00:00.000000Z';
const DAVE = generateIdentifier();
const INV_GRANT = generateIdentifier();
const MS_ACC = generateIdentifier();
const EV_ACC = generateIdentifier();
const EV_DEC = generateIdentifier();
const EV_REV = generateIdentifier();
const EV_BAD = generateIdentifier();
const MS_ADM = generateIdentifier();
const EV_ADM = generateIdentifier();
const MS_409 = generateIdentifier();
const EV_409 = generateIdentifier();
const MS_409B = generateIdentifier();
const EV_409B = generateIdentifier();
const MS_HOLE = generateIdentifier();
const EV_HOLE = generateIdentifier();

async function seedPerson(
    db: DbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await seedIdentityPii(db, id, {
        name, email, phone: '', bio: '',
    });
}

async function seedWorld(): Promise<DbAdapter> {
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
        operationId: TEST_OPERATION_ID,
    });
}

async function grantWayne(
    db: DbAdapter,
    email: string,
    invitationId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email,
            invitationId,
            grantEventId: 'ev-' + invitationId,
            grantAt: AT,
        },
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
                db.messagePairs.getAllWhere(
                    'uri_collection', seatPrefix,
                ),
                db.messagePairs.getAllWhere(
                    'uri_collection', seatPrefix,
                ),
            ]);
        for (const document of deriveDocumentsAt(
            seatRequests, seatPrefix,
        ).values()) {
            if (document.uriId === identityId) {
                ids.push(organization.id);
            }
        }
    }
    return ids.sort();
}

Deno.test('admin POST org nest grants pending',
async () => {
    const db = await seedWorld();
    const res = await grantWayne(
        db, 'sarah@x.com', INV_GRANT,
    );
    assertStrictEquals(res.status, 200);
    const body = await res.json() as {
        id: string;
        state: string;
        organization_id: string;
        identity_id: string;
    };
    assertStrictEquals(body.id, INV_GRANT);
    assertStrictEquals(body.state, 'pending');
    assertStrictEquals(body.organization_id, 'BBjWJsjYIDkTRKIIPrzWRw');
    assertStrictEquals(body.identity_id, 'toccYYkLEABmlbpHJalgtQ');
    const row = (await deriveInvitations(db))[0]!;
    assertStrictEquals(row.state, 'pending');
});

Deno.test('invitee PUT identity nest accepted writes'
    + ' the seat', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com', 'hZjjtxCNiLqiQahFZuykvA');
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hZjjtxCNiLqiQahFZuykvA',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_ACC,
            eventId: EV_ACC,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(res.status, 204);
    assertEquals(
        await membershipsFor(db, 'toccYYkLEABmlbpHJalgtQ'),
        ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
    );
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === 'hZjjtxCNiLqiQahFZuykvA')!;
    assertStrictEquals(row.state, 'accepted');
});

Deno.test('invitee PUT declined', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'dave@x.com', 'hgFLbVZKltowuLSHmjQVKw');
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/' + DAVE
            + '/invitations/hgFLbVZKltowuLSHmjQVKw',
        await organizationToken(DAVE, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'declined',
            eventId: EV_DEC,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(res.status, 204);
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === 'hgFLbVZKltowuLSHmjQVKw')!;
    assertStrictEquals(row.state, 'declined');
    assertEquals(
        await membershipsFor(db, DAVE),
        [],
    );
});

Deno.test('admin PUT org nest revoked', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com', 'isEimNpTpNyPKQzbcYxoiA');
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + 'isEimNpTpNyPKQzbcYxoiA',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            state: 'revoked',
            eventId: EV_REV,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(res.status, 204);
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === 'isEimNpTpNyPKQzbcYxoiA')!;
    assertStrictEquals(row.state, 'revoked');
});

Deno.test('invitee PUT revoked is 403', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com', 'hcTwUMjMVqkOKDsPOhKxiA');
    const res = await handleRequest(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hcTwUMjMVqkOKDsPOhKxiA',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'revoked',
            eventId: EV_BAD,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(res.status, 403);
});

Deno.test('admin PUT accepted is 403', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com', 'hadMASAdKHbHSgRNcCrndw');
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + 'hadMASAdKHbHSgRNcCrndw',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            state: 'accepted',
            membershipId: MS_ADM,
            eventId: EV_ADM,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(res.status, 403);
});

Deno.test('PUT from accepted is a no-op', async () => {
    const db = await seedWorld();
    await grantWayne(db, 'sarah@x.com', 'hXEuekgeiwIxOSyjdOQYQg');
    const first = await handleRequest(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hXEuekgeiwIxOSyjdOQYQg',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_409,
            eventId: EV_409,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(first.status, 204);
    const second = await handleRequest(db, req(
        'PUT',
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hXEuekgeiwIxOSyjdOQYQg',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_409B,
            eventId: EV_409B,
            at: '2026-01-01T00:00:02.000000Z',
        },
    ));
    assertStrictEquals(second.status, 204);
});

Deno.test('org-less invitee reaches identity nest',
async () => {
    const db = await seedWorld();
    await grantWayne(db, 'dave@x.com', 'hvIFfMMXNtqRPYXnChCzug');
    const token = await reachableToken(DAVE, []);
    const list = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/',
        token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as {
        id: string;
        state: string;
    }[];
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.state, 'pending');
    const acc = await handleRequest(db, req(
        'PUT',
        '/identities/' + DAVE
            + '/invitations/hvIFfMMXNtqRPYXnChCzug',
        token,
        {
            state: 'accepted',
            membershipId: MS_HOLE,
            eventId: EV_HOLE,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(acc.status, 204);
    assertEquals(
        await membershipsFor(db, DAVE),
        ['BBjWJsjYIDkTRKIIPrzWRw'],
    );
});
