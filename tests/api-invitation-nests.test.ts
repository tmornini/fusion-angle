import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('invitation /sent is absent', () => {
    assert.equal(
        match('/invitations/sent'), null,
    );
});

test('named invitation POST ops are absent',
() => {
    assert.equal(
        match('/invitations/fndCYAsXazdzMUlEGMNIZw/acceptance'),
        null,
    );
    assert.equal(
        match('/invitations/fndCYAsXazdzMUlEGMNIZw/decline'),
        null,
    );
    assert.equal(
        match('/invitations/fndCYAsXazdzMUlEGMNIZw/revocation'),
        null,
    );
});

test('unscoped GET /invitations/ is absent',
() => {
    assert.equal(match('/invitations/'), null);
    assert.equal(match('/invitations'), null);
});

test('organization nest offers GET POST on /'
    + ' and GET PUT on the item', () => {
    const col = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/',
    );
    assert.ok(col);
    assert.equal(typeof col.route.get, 'function');
    assert.equal(typeof col.route.post, 'function');
    const item = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
            + 'fndCYAsXazdzMUlEGMNIZw',
    );
    assert.ok(item);
    assert.equal(typeof item.route.get, 'function');
    assert.equal(typeof item.route.put, 'function');
});

test('identity nest offers GET on / and'
    + ' GET PUT on the item', () => {
    const col = match(
        '/identities/' + generateIdentifier() + '/invitations/',
    );
    assert.ok(col);
    assert.equal(typeof col.route.get, 'function');
    assert.equal(col.route.post, undefined);
    const item = match(
        '/identities/' + generateIdentifier()
            + '/invitations/fndCYAsXazdzMUlEGMNIZw',
    );
    assert.ok(item);
    assert.equal(typeof item.route.get, 'function');
    assert.equal(typeof item.route.put, 'function');
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

test('admin POST org nest grants pending',
async () => {
    const db = await seedWorld();
    const res = await grantWayne(
        db, 'sarah@x.com', INV_GRANT,
    );
    assert.equal(res.status, 200);
    const body = await res.json() as {
        id: string;
        state: string;
        organization_id: string;
        identity_id: string;
    };
    assert.equal(body.id, INV_GRANT);
    assert.equal(body.state, 'pending');
    assert.equal(body.organization_id, 'BBjWJsjYIDkTRKIIPrzWRw');
    assert.equal(body.identity_id, 'toccYYkLEABmlbpHJalgtQ');
    const row = (await deriveInvitations(db))[0]!;
    assert.equal(row.state, 'pending');
});

test('invitee PUT identity nest accepted writes'
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
    assert.equal(res.status, 204);
    assert.deepEqual(
        await membershipsFor(db, 'toccYYkLEABmlbpHJalgtQ'),
        ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
    );
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === 'hZjjtxCNiLqiQahFZuykvA')!;
    assert.equal(row.state, 'accepted');
});

test('invitee PUT declined', async () => {
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
    assert.equal(res.status, 204);
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === 'hgFLbVZKltowuLSHmjQVKw')!;
    assert.equal(row.state, 'declined');
    assert.deepEqual(
        await membershipsFor(db, DAVE),
        [],
    );
});

test('admin PUT org nest revoked', async () => {
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
    assert.equal(res.status, 204);
    const row = (await deriveInvitations(db))
        .find(inv => inv.id === 'isEimNpTpNyPKQzbcYxoiA')!;
    assert.equal(row.state, 'revoked');
});

test('invitee PUT revoked is 403', async () => {
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
    assert.equal(res.status, 403);
});

test('admin PUT accepted is 403', async () => {
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
    assert.equal(res.status, 403);
});

test('PUT from accepted is a no-op', async () => {
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
    assert.equal(first.status, 204);
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
    assert.equal(second.status, 204);
});

test('org-less invitee reaches identity nest',
async () => {
    const db = await seedWorld();
    await grantWayne(db, 'dave@x.com', 'hvIFfMMXNtqRPYXnChCzug');
    const token = await reachableToken(DAVE, []);
    const list = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/',
        token,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as {
        id: string;
        state: string;
    }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.state, 'pending');
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
    assert.equal(acc.status, 204);
    assert.deepEqual(
        await membershipsFor(db, DAVE),
        ['BBjWJsjYIDkTRKIIPrzWRw'],
    );
});
