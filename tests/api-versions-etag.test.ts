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
    seedPersonIdentity,
} from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { messageStore } from '../api/message-store.ts';
import {
    apiRequest,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { httpDateOf } from '../api/message-pair.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import type { MembershipEntity } from '../shared/types.ts';

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
    return db;
}

async function grantDave(db: DbAdapter): Promise<string> {
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        { email: 'dave@x.com', grantAt: AT },
    ));
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
    return membershipNameOf(
        'BBjWJsjYIDkTRKIIPrzWRw', DAVE,
    );
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
    const name = await grantDave(db);
    const token = await reachableToken(DAVE, []);
    const item = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/' + name,
        token,
    ));
    assertStrictEquals(item.status, 200);
    await item.body?.cancel();
    const list = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/' + name
            + '/versions/',
        token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await partsOf<MembershipEntity>(list);
    assert(rows.length >= 1);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/' + name
            + '/versions/nmPWmjhGfSUcdaEGaCyMZg',
        token,
    ));
    assertStrictEquals(snapshot.status, 404);
    await snapshot.body?.cancel();
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
    const stored = await messageStore(db).getDocumentHead(
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
    const name = await grantDave(db);
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const identityVersions =
        '/identities/XXZruirZyAOoRpNxaDnpSA/versions/';
    const identityList = await handleRequest(
        db, req('GET', identityVersions, token),
    );
    assertStrictEquals(identityList.status, 200, identityVersions);
    const rows = await identityList.json() as unknown[];
    assert(rows.length >= 1, identityVersions);
    const membershipName = membershipNameOf(
        'AjdvjuECVZEgZoFajaIEkg', 'XXZruirZyAOoRpNxaDnpSA',
    );
    const membershipVersions =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
        + membershipName + '/versions/';
    const membershipList = await handleRequest(
        db, req('GET', membershipVersions, token),
    );
    assertStrictEquals(
        membershipList.status, 200, membershipVersions,
    );
    const membershipParts = await partsOf(membershipList);
    assert(membershipParts.length >= 1, membershipVersions);
    const invitations = await handleRequest(db, req(
        'GET',
        '/identities/' + DAVE + '/invitations/' + name
            + '/versions/',
        token,
    ));
    assertStrictEquals(invitations.status, 200);
    const parts = await partsOf<MembershipEntity>(invitations);
    assert(parts.length >= 1);
});

// The body's at is the grant time the client sent.
// The stored date line is the statement's splice of
// response_at. The two clocks are different facts.
Deno.test(
    'the stored invitation date line is the statement'
    + ' splice, and body at is the grant time',
    async () => {
        const db = await seedInviteeWorld();
        const name = await grantDave(db);
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        );
        const list = await handleRequest(db, req(
            'GET',
            '/identities/' + DAVE + '/invitations/'
                + name + '/versions/',
            token,
        ));
        assertStrictEquals(list.status, 200);
        const parts = await partsOf<MembershipEntity>(list);
        assertStrictEquals(parts.length, 1);
        assertStrictEquals(parts[0]!.body().toValue().at, AT);
        const stored = await messageStore(db).getDocumentHead(
            '/invitations/', name,
        );
        assert(stored);
        assertNotStrictEquals(AT, stored.response_at);
        const date = HttpMessage.fromWire<unknown>(
            stored.response,
        ).query('header.date').toText();
        assertStrictEquals(date, httpDateOf(stored.response_at));
    },
);
