import {
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { bodyOf } from '../api/derive-documents.ts';
import { seedPersonIdentity } from
    './identity-fixtures.ts';
import {
    apiRequest,
    invitationLatched,
} from './http-fixtures.ts';
import {
    seedOrganizationDocument,
    seedSeat,
} from './root-admin-fixture.ts';
import { organizationToken } from './token-fixtures.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

const AT = '2020-01-01T00:00:00.000000Z';
const EXPIRED = '2020-06-01T00:00:00.000000Z';
const OPEN = '2099-01-01T00:00:00.000000Z';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const TONY = 'XXZruirZyAOoRpNxaDnpSA';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';
const NAME = membershipNameOf(STARK, SARAH);
const PENDING_KEYS = [
    'at',
    'expires_at',
    'id',
    'identity_id',
    'organization_id',
    'state',
    'type',
];
const SETTLED_KEYS = [
    'at',
    'id',
    'identity_id',
    'organization_id',
    'state',
    'type',
];

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({ method, path, token, body });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, STARK, 'Stark');
    await seedSeat(db, STARK, TONY, 'admin', AT);
    await seedPersonIdentity(db, TONY, {
        name: 'Tony',
        email: 'demo@example.com',
        phone: '',
        bio: '',
    });
    await seedPersonIdentity(db, SARAH, {
        name: 'Sarah',
        email: 'sarah@x.com',
        phone: '',
        bio: '',
    });
    return db;
}

async function invite(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<Response> {
    return handleRequest(db, req(
        'POST',
        '/organizations/' + STARK + '/invitations/',
        await organizationToken(),
        body,
    ));
}

async function answer(
    db: MemoryDbAdapter,
    state: 'accepted' | 'declined' | 'revoked',
    at: string,
): Promise<Response> {
    const invitee = state !== 'revoked';
    const path = invitee
        ? '/identities/' + SARAH + '/invitations/' + NAME
        : '/organizations/' + STARK
            + '/invitations/' + NAME;
    const token = invitee
        ? await organizationToken(SARAH, STARK)
        : await organizationToken();
    return handleRequest(db, await invitationLatched(
        db, req('PUT', path, token, { state, at }),
    ));
}

async function headBody(
    db: MemoryDbAdapter,
): Promise<Record<string, unknown>> {
    const head = await db.messagePairs.getHeadPair(
        '/invitations/', NAME,
    );
    if (head === null) {
        throw new Error('invitation head is missing');
    }
    return bodyOf(head.response);
}

Deno.test('an invitation POST without expiresAt is 400',
async () => {
    const db = await freshDb();
    const res = await invite(db, {
        email: 'sarah@x.com',
        at: AT,
    });
    const body = await res.json();
    assertStrictEquals(res.status, 400);
    assertEquals(body, {
        error: 'missing required key "expiresAt"'
            + ' for Invitation',
    });
});

Deno.test('an invitation POST stores expires_at on'
    + ' the pending head', async () => {
    const db = await freshDb();
    const res = await invite(db, {
        email: 'sarah@x.com',
        at: AT,
        expiresAt: OPEN,
    });
    const body = await res.json();
    assertStrictEquals(res.status, 201);
    assertEquals(Object.keys(body).sort(), PENDING_KEYS);
    assertStrictEquals(body.expires_at, OPEN);
    assertStrictEquals(body.state, 'pending');
    assertEquals(await headBody(db), body);
});

Deno.test('accept after expires_at is 409 and the'
    + ' head stays pending', async () => {
    const db = await freshDb();
    const granted = await invite(db, {
        email: 'sarah@x.com',
        at: AT,
        expiresAt: EXPIRED,
    });
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const res = await answer(
        db, 'accepted', '2026-10-09T00:00:00.000000Z',
    );
    const body = await res.json();
    assertStrictEquals(res.status, 409);
    assertEquals(body, {
        error: 'the invitation expired at ' + EXPIRED,
    });
    const head = await headBody(db);
    assertStrictEquals(head['state'], 'pending');
    assertStrictEquals(head['expires_at'], EXPIRED);
});

Deno.test('accept before expires_at drops the key',
async () => {
    const db = await freshDb();
    const granted = await invite(db, {
        email: 'sarah@x.com',
        at: AT,
        expiresAt: OPEN,
    });
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const res = await answer(
        db, 'accepted', '2026-10-09T00:00:00.000000Z',
    );
    const body = await res.json();
    assertStrictEquals(res.status, 200);
    assertEquals(Object.keys(body).sort(), SETTLED_KEYS);
    assertStrictEquals(body.expires_at, undefined);
    assertStrictEquals(body.state, 'accepted');
    assertEquals(await headBody(db), body);
});

Deno.test('decline after expiry still lands', async () => {
    const db = await freshDb();
    const granted = await invite(db, {
        email: 'sarah@x.com',
        at: AT,
        expiresAt: EXPIRED,
    });
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const res = await answer(
        db, 'declined', '2026-10-09T00:00:00.000000Z',
    );
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
    assertStrictEquals(
        (await headBody(db))['state'], 'declined',
    );
});

Deno.test('revoke after expiry still lands', async () => {
    const db = await freshDb();
    const granted = await invite(db, {
        email: 'sarah@x.com',
        at: AT,
        expiresAt: EXPIRED,
    });
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const res = await answer(
        db, 'revoked', '2026-10-09T00:00:00.000000Z',
    );
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
    assertStrictEquals(
        (await headBody(db))['state'], 'revoked',
    );
});
