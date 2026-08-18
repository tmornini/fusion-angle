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
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

function match(path: string) {
    return matchRoute(
        routes, pathSegmentsOf(path),
    );
}

test('idea versions list requires a slash',
() => {
    assert.ok(match(
        '/organizations/1/ideas/i1/versions/',
    ));
    assert.equal(
        match(
            '/organizations/1/ideas/i1/versions',
        ),
        null,
    );
});

test('idea snapshot is :etag not :version',
() => {
    const row = match(
        '/organizations/1/ideas/i1/versions/e1',
    );
    assert.ok(row);
    assert.equal(
        row.route.segments.at(-1),
        ':etag',
    );
});

test('work-order per-item history stays /history',
() => {
    assert.ok(match(
        '/organizations/1/work-orders/w1/history',
    ));
    assert.equal(
        match(
            '/organizations/1/work-orders/w1'
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

test('bulk work-order history is absent', () => {
    assert.equal(
        hasLiteral(
            'organizations/:id/work-orders/history',
        ),
        false,
    );
    const captured = match(
        '/organizations/1/work-orders/history',
    );
    assert.ok(captured);
    assert.equal(captured.route.segments.at(-1), ':id');
    assert.equal(match('/work-orders/history'), null);
});

test('bulk objective versions is absent', () => {
    assert.equal(
        hasLiteral(
            'organizations/:id/objectives/versions',
        ),
        false,
    );
    assert.equal(
        match('/organizations/1/objectives/versions/'),
        null,
    );
    const slashless = match(
        '/organizations/1/objectives/versions',
    );
    assert.ok(slashless);
    assert.equal(slashless.route.segments.at(-1), ':id');
    assert.equal(match('/objectives/versions'), null);
});

test('registered families offer versions/ and :etag',
() => {
    const lists = [
        '/identities/abc/versions/',
        '/ai-agents/a1/versions/',
        '/organizations/1/members/m1/versions/',
        '/organizations/1/invitations/i1/versions/',
        '/identities/abc/invitations/i1/versions/',
        '/organizations/1/versions/',
        '/organizations/1/ideas/i1/versions/',
        '/organizations/1/projects/p1/versions/',
        '/organizations/1/objectives/o1/versions/',
        '/organizations/1/record-types/r1/versions/',
        '/organizations/1/flows/f1/versions/',
    ];
    const snapshots = [
        '/identities/abc/versions/e1',
        '/ai-agents/a1/versions/e1',
        '/organizations/1/members/m1/versions/e1',
        '/organizations/1/invitations/i1/versions/e1',
        '/identities/abc/invitations/i1/versions/e1',
        '/organizations/1/versions/e1',
        '/organizations/1/ideas/i1/versions/e1',
        '/organizations/1/projects/p1/versions/e1',
        '/organizations/1/objectives/o1/versions/e1',
        '/organizations/1/record-types/r1/versions/e1',
        '/organizations/1/flows/f1/versions/e1',
    ];
    for (const path of lists) {
        const row = match(path);
        assert.ok(row, path);
        assert.equal(row.route.segments.at(-1), '');
    }
    for (const path of snapshots) {
        const row = match(path);
        assert.ok(row, path);
        assert.equal(
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
    await seedOrganizationDocument(db, '1', 'Stark');
    await seedOrganizationDocument(db, '2', 'Wayne');
    await seedSeat(db, '1', 'current', 'admin', AT);
    await seedSeat(db, '2', 'current', 'admin', AT);
    await seedPersonIdentity(db, 'current', {
        name: 'Tony', email: 'demo@example.com',
        phone: '', bio: '',
    });
    await seedIdentityPii(db, 'dave', {
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
        '/organizations/2/invitations/',
        await organizationToken('current', '2'),
        {
            email: 'dave@x.com',
            invitationId,
            grantEventId: 'ev-' + invitationId,
            grantAt: AT,
        },
    ));
    assert.equal(res.status, 200);
}

async function seedMemberOrganizations(): Promise<DbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedOrganizationDocument(db, 'B', 'Wayne');
    await seedSeat(db, 'A', 'current', 'admin', AT);
    await seedSeat(db, 'B', 'current', 'admin', AT);
    return db;
}

test('org-less invitee GET identity-nest versions is 200',
async () => {
    const db = await seedInviteeWorld();
    await grantDave(db, 'inv-hole');
    const token = await reachableToken('dave', []);
    const item = await handleRequest(db, req(
        'GET',
        '/identities/dave/invitations/inv-hole',
        token,
    ));
    assert.equal(item.status, 200);
    const list = await handleRequest(db, req(
        'GET',
        '/identities/dave/invitations/inv-hole'
            + '/versions/',
        token,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as unknown[];
    assert.ok(rows.length >= 1);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/identities/dave/invitations/inv-hole'
            + '/versions/missing-etag',
        token,
    ));
    assert.equal(snapshot.status, 404);
});

test('member of B GET B versions while fenced to A',
async () => {
    const db = await seedMemberOrganizations();
    const token = await claimToken({
        organization: 'A',
        organizations: ['A', 'B'],
        roles: ['admin:A', 'admin:B'],
    });
    const document = await handleRequest(db, req(
        'GET', '/organizations/B', token,
    ));
    assert.equal(document.status, 200);
    const list = await handleRequest(db, req(
        'GET', '/organizations/B/versions/', token,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as unknown[];
    assert.ok(rows.length >= 1);
    const stored = await messageStore(db).get(
        '/organizations/', 'B',
    );
    assert.ok(stored);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/B/versions/' + stored.version,
        token,
    ));
    assert.equal(snapshot.status, 200);
    const ideas = await handleRequest(db, req(
        'GET', '/organizations/B/ideas/', token,
    ));
    assert.equal(ideas.status, 403);
});

test('non-member GET B versions is 403 like the document',
async () => {
    const db = await seedMemberOrganizations();
    const token = await organizationToken('current', 'A');
    const document = await handleRequest(db, req(
        'GET', '/organizations/B', token,
    ));
    assert.equal(document.status, 403);
    const list = await handleRequest(db, req(
        'GET', '/organizations/B/versions/', token,
    ));
    assert.equal(list.status, 403);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/B/versions/missing-etag',
        token,
    ));
    assert.equal(snapshot.status, 403);
});

test('absent org versions is 404 not 403', async () => {
    const db = await seedMemberOrganizations();
    const token = await organizationToken('current', 'A');
    const list = await handleRequest(db, req(
        'GET',
        '/organizations/no-such-org/versions/',
        token,
    ));
    assert.equal(list.status, 404);
    const snapshot = await handleRequest(db, req(
        'GET',
        '/organizations/no-such-org/versions/e1',
        token,
    ));
    assert.equal(snapshot.status, 404);
});

test('identities, members, and identity-nest lists are 200',
async () => {
    const db = await seedInviteeWorld();
    await grantDave(db, 'inv-list');
    const token = await organizationToken('current', '1');
    const paths = [
        '/identities/current/versions/',
        '/organizations/1/members/current/versions/',
        '/identities/dave/invitations/inv-list/versions/',
    ];
    for (const path of paths) {
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assert.equal(res.status, 200, path);
        const rows = await res.json() as unknown[];
        assert.ok(rows.length >= 1, path);
    }
});
