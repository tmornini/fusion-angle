import {
    assert,
    assertEquals,
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
import {
    organizationRow,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    seedPersonIdentity,
} from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { firstProviderModel } from
    './member-fixtures.ts';
import { messageStore } from '../api/message-store.ts';
import {
    attemptFor,
    formWriteMessagePair,
    runWrite,
} from '../api/message-pair.ts';
import {
    apiRequest,
    messageOfResponse,
    pairIdOf,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { httpDateOf } from '../api/message-pair.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import type {
    MembershipEntity,
    OrganizationEntity,
} from '../shared/types.ts';

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

Deno.test('work-order versions are the history; /history'
+ ' matches nothing',
() => {
    const item = '/organizations/AjdvjuECVZEgZoFajaIEkg/'
        + 'work-orders/xdaJyuuPyHfffCGLhqDrOQ';
    assertStrictEquals(match(item + '/history'), null);
    assert(match(item + '/versions/'));
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
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'xdaJyuuPyHfffCGLhqDrOQ/versions/',
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
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'xdaJyuuPyHfffCGLhqDrOQ/versions/YiJPbufDpkyrZcZCYbUJpg',
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
    const tag = pairIdOf(document);
    assert(tag !== null);
    await document.body?.cancel();
    const list = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_B + '/versions/',
        token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await partsOf(list);
    assert(rows.length >= 1);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_B + '/versions/'
            + tag,
        token,
    ));
    assertStrictEquals(snapshot.status, 200);
    await snapshot.body?.cancel();
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

Deno.test(
    'two organization PUTs list oldest first,'
        + ' each part the item its tag serves',
    async () => {
        const db = await seedMemberOrganizations();
        const id = generateIdentifier();
        const token = await claimToken({
            organization: id,
            organizations: [id],
            roles: ['admin:' + id],
        });
        const path = '/organizations/' + id;
        const firstBody = organizationRow('First');
        const secondBody = organizationRow('Second');
        const first = await handleRequest(db, req(
            'PUT', path, token, firstBody,
        ));
        assertStrictEquals(first.status, 201);
        await first.body?.cancel();
        const second = await handleRequest(db, req(
            'PUT', path, token, secondBody,
        ));
        assertStrictEquals(second.status, 200);
        await second.body?.cancel();
        const list = await handleRequest(db, req(
            'GET', path + '/versions/', token,
        ));
        assertStrictEquals(list.status, 200);
        const versions = await partsOf<OrganizationEntity>(
            list,
        );
        assertStrictEquals(versions.length, 2);
        assertEquals(versions[0]!.body().toValue(), {
            id, ...firstBody,
        });
        assertEquals(versions[1]!.body().toValue(), {
            id, ...secondBody,
        });
        for (const part of versions) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(db, req(
                'GET', path + '/versions/' + tag, token,
            ));
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

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
    const identityParts = await partsOf(identityList);
    assert(identityParts.length >= 1, identityVersions);
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

// The identity document route offers no DELETE. A
// DELETE head is still Gone on both version routes:
// the ladder answers 410 before it looks at the tag.
async function deleteIdentityDocument(
    db: DbAdapter,
    id: string,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname: '/identities/' + id,
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', id],
        headerFields: [],
        body: {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-08-01T00:00:00.000000Z',
        organization: undefined,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    );
}

Deno.test(
    'a deleted identity answers 410 on both version'
        + ' routes',
    async () => {
        const db = await seedInviteeWorld();
        const token = await organizationToken();
        const id = generateIdentifier();
        const created = await handleRequest(db, req(
            'PUT', '/identities/' + id, token,
            { kind: 'person' },
        ));
        assertStrictEquals(created.status, 201);
        const tag = pairIdOf(created);
        assert(tag !== null);
        await created.body?.cancel();
        await deleteIdentityDocument(db, id);
        const listPath = '/identities/' + id + '/versions/';
        const list = await handleRequest(
            db, req('GET', listPath, token),
        );
        assertStrictEquals(list.status, 410);
        assertEquals(await list.json(), {
            error: 'Gone: identities/' + id,
        });
        const item = await handleRequest(db, req(
            'GET', listPath + tag, token,
        ));
        assertStrictEquals(item.status, 410);
        assertEquals(await item.json(), {
            error: 'Gone: identities/' + id,
        });
    },
);

Deno.test(
    'two identity PUTs list oldest first,'
        + ' each part the item its tag serves',
    async () => {
        const db = await seedInviteeWorld();
        const token = await organizationToken();
        const id = generateIdentifier();
        const path = '/identities/' + id;
        const first = await handleRequest(db, req(
            'PUT', path, token, { kind: 'person' },
        ));
        assertStrictEquals(first.status, 201);
        await first.body?.cancel();
        const second = await handleRequest(db, req(
            'PUT', path, token, { kind: 'service' },
        ));
        assertStrictEquals(second.status, 200);
        await second.body?.cancel();
        const list = await handleRequest(db, req(
            'GET', path + '/versions/', token,
        ));
        assertStrictEquals(list.status, 200);
        const versions = await partsOf<{
            id: string;
            kind: string;
        }>(list);
        assertStrictEquals(versions.length, 2);
        assertEquals(versions[0]!.body().toValue(), {
            id, kind: 'person',
        });
        assertEquals(versions[1]!.body().toValue(), {
            id, kind: 'service',
        });
        for (const part of versions) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(db, req(
                'GET', path + '/versions/' + tag, token,
            ));
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

// The AI agent document route offers no DELETE. A
// DELETE head is still Gone on both version routes:
// the ladder answers 410 before it looks at the tag.
function aiAgentDocument(name: string) {
    return {
        name,
        description: 'helper',
        skill_focus: 'ops',
        model: firstProviderModel().id,
    };
}

async function deleteAiAgentDocument(
    db: DbAdapter,
    id: string,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname: '/ai-agents/' + id,
        routePattern: 'ai-agents/:id',
        routeSegments: ['ai-agents', ':id'],
        pathSegments: ['ai-agents', id],
        headerFields: [],
        body: {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-08-01T00:00:00.000000Z',
        organization: undefined,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    );
}

Deno.test(
    'a deleted AI agent answers 410 on both version'
        + ' routes',
    async () => {
        const db = await seedInviteeWorld();
        const token = await organizationToken();
        const id = generateIdentifier();
        const created = await handleRequest(db, req(
            'PUT', '/ai-agents/' + id, token,
            aiAgentDocument('First'),
        ));
        assertStrictEquals(created.status, 201);
        const tag = pairIdOf(created);
        assert(tag !== null);
        await created.body?.cancel();
        await deleteAiAgentDocument(db, id);
        const listPath = '/ai-agents/' + id + '/versions/';
        const list = await handleRequest(
            db, req('GET', listPath, token),
        );
        assertStrictEquals(list.status, 410);
        assertEquals(await list.json(), {
            error: 'Gone: ai-agents/' + id,
        });
        const item = await handleRequest(db, req(
            'GET', listPath + tag, token,
        ));
        assertStrictEquals(item.status, 410);
        assertEquals(await item.json(), {
            error: 'Gone: ai-agents/' + id,
        });
    },
);

Deno.test(
    'two AI agent PUTs list oldest first,'
        + ' each part the item its tag serves',
    async () => {
        const db = await seedInviteeWorld();
        const token = await organizationToken();
        const id = generateIdentifier();
        const path = '/ai-agents/' + id;
        const firstBody = aiAgentDocument('First');
        const secondBody = aiAgentDocument('Second');
        const first = await handleRequest(db, req(
            'PUT', path, token, firstBody,
        ));
        assertStrictEquals(first.status, 201);
        await first.body?.cancel();
        const second = await handleRequest(db, req(
            'PUT', path, token, secondBody,
        ));
        assertStrictEquals(second.status, 200);
        await second.body?.cancel();
        const list = await handleRequest(db, req(
            'GET', path + '/versions/', token,
        ));
        assertStrictEquals(list.status, 200);
        const versions = await partsOf<{
            id: string;
            name: string;
            description: string;
            skill_focus: string;
            model: string;
        }>(list);
        assertStrictEquals(versions.length, 2);
        assertEquals(versions[0]!.body().toValue(), {
            id, ...firstBody,
        });
        assertEquals(versions[1]!.body().toValue(), {
            id, ...secondBody,
        });
        for (const part of versions) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(db, req(
                'GET', path + '/versions/' + tag, token,
            ));
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

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
