import {
    assert,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { routes, matchRoute } from
    '../api/routes.ts';
import { pathSegmentsOf } from
    '../api/path-segments.ts';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import {
    claimToken,
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';
import {
    seedIdentityPii,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { messageStore } from '../api/message-store.ts';
import { seatsPrefixFor } from
    '../api/derive-memberships.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const ORGANIZATION_A = generateIdentifier();
const ORGANIZATION_B = generateIdentifier();
const DAVE = generateIdentifier();

function match(path: string) {
    return matchRoute(
        routes, pathSegmentsOf(path),
    );
}

Deno.test('idea versions list requires a slash',
() => {
    assert(match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/fndCYAsXazdzMUlEGMNIZw/'
            + 'versions/',
    ));
    assertStrictEquals(
        match(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'fndCYAsXazdzMUlEGMNIZw/versions',
        ),
        null,
    );
});

Deno.test('idea snapshot is :etag not :version',
() => {
    const row = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/fndCYAsXazdzMUlEGMNIZw/'
            + 'versions/YiJPbufDpkyrZcZCYbUJpg',
    );
    assert(row);
    assertStrictEquals(
        row.route.segments.at(-1),
        ':etag',
    );
});

Deno.test('work-order per-item history stays /history',
() => {
    assert(match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'xdaJyuuPyHfffCGLhqDrOQ/history',
    ));
    assertStrictEquals(
        match(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'xdaJyuuPyHfffCGLhqDrOQ'
                + '/versions/',
        ),
        null,
    );
});

function hasLiteral(pattern: string): boolean {
    const want = pattern.split('/');
    return routes.some((row) =>
        row.segments.length === want.length
        && row.segments.every(
            (seg, i) => seg === want[i],
        ),
    );
}

Deno.test('bulk work-order history is absent', () => {
    assertStrictEquals(
        hasLiteral(
            'organizations/:id/work-orders/history',
        ),
        false,
    );
    const captured = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/history',
    );
    assert(captured);
    assertStrictEquals(captured.route.segments.at(-1), ':id');
    assertStrictEquals(match('/work-orders/history'), null);
});

Deno.test('bulk objective versions is absent', () => {
    assertStrictEquals(
        hasLiteral(
            'organizations/:id/objectives/versions',
        ),
        false,
    );
    assertStrictEquals(
        match('/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/versions/'),
        null,
    );
    const slashless = match(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/versions',
    );
    assert(slashless);
    assertStrictEquals(slashless.route.segments.at(-1), ':id');
    assertStrictEquals(match('/objectives/versions'), null);
});

Deno.test('registered families offer versions/ and :etag',
() => {
    const lists = [
        '/identities/abc/versions/',
        '/ai-agents/UQTJZvCoKlFjEoDlDUwekw/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/mFNSxZqywTSMXhgUTdTqtA/'
            + 'versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
            + 'fndCYAsXazdzMUlEGMNIZw/versions/',
        '/identities/abc/invitations/fndCYAsXazdzMUlEGMNIZw/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/fndCYAsXazdzMUlEGMNIZw/'
            + 'versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rOEPOcVMQdJiiiMuiiEhlg/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/ZOousbbnzpqlxJExVAruYQ/'
            + 'versions/',
    ];
    const snapshots = [
        '/identities/abc/versions/YiJPbufDpkyrZcZCYbUJpg',
        '/ai-agents/UQTJZvCoKlFjEoDlDUwekw/versions/YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/mFNSxZqywTSMXhgUTdTqtA/'
            + 'versions/YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
            + 'fndCYAsXazdzMUlEGMNIZw/versions/YiJPbufDpkyrZcZCYbUJpg',
        '/identities/abc/invitations/fndCYAsXazdzMUlEGMNIZw/versions/'
            + 'YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/versions/'
            + 'YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/fndCYAsXazdzMUlEGMNIZw/'
            + 'versions/YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/versions/YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/versions/YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rOEPOcVMQdJiiiMuiiEhlg/versions/YiJPbufDpkyrZcZCYbUJpg',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/ZOousbbnzpqlxJExVAruYQ/'
            + 'versions/YiJPbufDpkyrZcZCYbUJpg',
    ];
    for (const path of lists) {
        const row = match(path);
        assert(row, path);
        assertStrictEquals(row.route.segments.at(-1), '');
    }
    for (const path of snapshots) {
        const row = match(path);
        assert(row, path);
        assertStrictEquals(
            row.route.segments.at(-1), ':etag', path,
        );
    }
});

const AT = '2026-01-01T00:00:00.000000Z';

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

async function seedInviteeWorld(): Promise<DbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'AjdvjuECVZEgZoFajaIEkg', 'Stark');
    await seedOrganizationDocument(db, 'BBjWJsjYIDkTRKIIPrzWRw', 'Wayne');
    await seedSeat(db, 'AjdvjuECVZEgZoFajaIEkg', 'XXZruirZyAOoRpNxaDnpSA'
        , 'admin', AT);
    await seedSeat(db, 'BBjWJsjYIDkTRKIIPrzWRw', 'XXZruirZyAOoRpNxaDnpSA'
        , 'admin', AT);
    await seedPersonIdentity(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Tony', email: 'demo@example.com',
        phone: '', bio: '',
    });
    await seedPersonIdentity(db, DAVE, {
        name: 'Dave', email: 'dave@x.com',
        phone: '', bio: '',
    });
    await seedIdentityPii(db, DAVE, {
        name: 'Dave', email: 'dave@x.com',
        phone: '', bio: '',
    });
    return db;
}

async function grantDave(
    db: DbAdapter,
    invitationId: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email: 'dave@x.com',
            invitationId,
            grantEventId: generateIdentifier(),
            grantAt: AT,
        },
    ));
    assertStrictEquals(res.status, 200);
}

async function seedMemberOrganizations(): Promise<DbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, ORGANIZATION_A, 'Acme');
    await seedOrganizationDocument(db, ORGANIZATION_B, 'Wayne');
    await seedSeat(
        db, ORGANIZATION_A, 'XXZruirZyAOoRpNxaDnpSA', 'admin', AT,
    );
    await seedSeat(
        db, ORGANIZATION_B, 'XXZruirZyAOoRpNxaDnpSA', 'admin', AT,
    );
    return db;
}

Deno.test('org-less invitee GET identity-nest versions is 200',
async () => {
    const db = await seedInviteeWorld();
    await grantDave(db, 'hvIFfMMXNtqRPYXnChCzug');
    const token = await reachableToken(DAVE, []);
    const item = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE
            + '/invitations/hvIFfMMXNtqRPYXnChCzug',
        token,
    ));
    assertStrictEquals(item.status, 200);
    const list = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE
            + '/invitations/hvIFfMMXNtqRPYXnChCzug'
            + '/versions/',
        token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as unknown[];
    assert(rows.length >= 1);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE
            + '/invitations/hvIFfMMXNtqRPYXnChCzug'
            + '/versions/nmPWmjhGfSUcdaEGaCyMZg',
        token,
    ));
    assertStrictEquals(snapshot.status, 404);
});

Deno.test('member of B GET B versions while fenced to A',
async () => {
    const db = await seedMemberOrganizations();
    const token = await claimToken({
        organization: ORGANIZATION_A,
        organizations: [ORGANIZATION_A, ORGANIZATION_B],
        roles: ['admin:' + ORGANIZATION_A, 'admin:' + ORGANIZATION_B],
    });
    const document = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_B, token,
    ));
    assertStrictEquals(document.status, 200);
    const list = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_B + '/versions/',
        token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as unknown[];
    assert(rows.length >= 1);
    const stored = await messageStore(db).get(
        '/organizations/', ORGANIZATION_B,
    );
    assert(stored);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_B + '/versions/'
            + stored.id,
        token,
    ));
    assertStrictEquals(snapshot.status, 200);
    const ideas = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_B + '/ideas/',
        token,
    ));
    assertStrictEquals(ideas.status, 403);
});

Deno.test('non-member GET B versions is 403 like the document',
async () => {
    const db = await seedMemberOrganizations();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const document = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_B, token,
    ));
    assertStrictEquals(document.status, 403);
    const list = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_B + '/versions/',
        token,
    ));
    assertStrictEquals(list.status, 403);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_B
            + '/versions/nmPWmjhGfSUcdaEGaCyMZg',
        token,
    ));
    assertStrictEquals(snapshot.status, 403);
});

Deno.test('absent org versions is 404 not 403', async () => {
    const db = await seedMemberOrganizations();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const list = await handleRequest(db, req(
        'GET',
        '/organizations/oLbQcDdzGHmpcoUKyvlTnQ/versions/',
        token,
    ));
    assertStrictEquals(list.status, 404);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/oLbQcDdzGHmpcoUKyvlTnQ/versions/'
            + 'YiJPbufDpkyrZcZCYbUJpg',
        token,
    ));
    assertStrictEquals(snapshot.status, 404);
});

Deno.test('identities, members, and identity-nest lists are 200',
async () => {
    const db = await seedInviteeWorld();
    await grantDave(db, 'iBSjaSPKkHorkvpwZBBNFg');
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const paths = [
        '/identities/XXZruirZyAOoRpNxaDnpSA/versions/',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/XXZruirZyAOoRpNxaDnpSA/'
            + 'versions/',
        '/identities/' + DAVE
            + '/invitations/iBSjaSPKkHorkvpwZBBNFg/versions/',
    ];
    for (const path of paths) {
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assertStrictEquals(res.status, 200, path);
        const rows = await res.json() as unknown[];
        assert(rows.length >= 1, path);
    }
});

// Task 4 fix round 1, Finding 3: the member entity's OWN
// `at` (validateSeatDocumentBody's grant time, seatEntityOf
// derive-memberships.ts:127) and the versions row's `at`
// (the ledger's response_at, stamped by versionSnapshotsAt)
// are different facts that share a name. This pins the
// versions wire to the ledger fact and proves it is NOT the
// seat's own grant time.
Deno.test(
    'member versions at is the ledger arrival time,'
    + ' not the seat grant time',
    async () => {
        const db = await seedMemberOrganizations();
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
        );
        const list = await handleRequest(db, req(
            'GET',
            '/organizations/' + ORGANIZATION_A
                + '/members/XXZruirZyAOoRpNxaDnpSA/versions/',
            token,
        ));
        assertStrictEquals(list.status, 200);
        const rows = await list.json() as { at: string }[];
        assertStrictEquals(rows.length, 1);
        const stored = await messageStore(db).get(
            seatsPrefixFor(ORGANIZATION_A),
            'XXZruirZyAOoRpNxaDnpSA',
        );
        assert(stored);
        assertStrictEquals(rows[0]!.at, stored.response_at);
        assertNotStrictEquals(rows[0]!.at, AT);
    },
);

// Sibling to the member pin above: invitationDocumentEntity
// spreads document.body (carrying the invitation's OWN `at`,
// validated at write time by grantInvitation's
// validateTimestampField(body, 'grantAt', …)) before
// versionSnapshotsAt overwrites it with the ledger arrival
// time. This pins the versions wire to the ledger fact and
// proves it is NOT the invitation's own grant time.
Deno.test(
    'invitation versions at is the ledger arrival time,'
    + ' not the invitation grant time',
    async () => {
        const db = await seedInviteeWorld();
        const invitationId = generateIdentifier();
        await grantDave(db, invitationId);
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        );
        const list = await handleRequest(db, req(
            'GET',
            '/identities/' + DAVE + '/invitations/'
                + invitationId + '/versions/',
            token,
        ));
        assertStrictEquals(list.status, 200);
        const rows = await list.json() as { at: string }[];
        assertStrictEquals(rows.length, 1);
        const stored = await messageStore(db).get(
            '/invitations/', invitationId,
        );
        assert(stored);
        assertStrictEquals(rows[0]!.at, stored.response_at);
        assertNotStrictEquals(rows[0]!.at, AT);
    },
);
