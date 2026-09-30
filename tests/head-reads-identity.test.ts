import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { seededMockDb } from './mock-seed.ts';
import { DEV_TOKEN, organizationToken } from './token-fixtures.ts';
import { apiRequest } from './http-fixtures.ts';
import { deriveCredentialsFor } from '../api/derive-identity-spine.ts';
import { bodyOf } from '../api/derive-documents.ts';
import { generateIdentifier } from '../shared/identifier.ts';

const ME = 'XXZruirZyAOoRpNxaDnpSA';

Deno.test('an erased PII answers 410', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const path = '/identities/' + ME + '/pii';
    const before = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    assertStrictEquals(before.status, 200);
    await before.body?.cancel();
    const erased = await handleRequest(db, apiRequest({
        method: 'DELETE', path, token,
    }));
    assertStrictEquals(erased.status, 204);
    const after = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    assertStrictEquals(after.status, 410);
    assertEquals(await after.json(), {
        error: 'Gone: identity_pii/' + ME,
    });
});

Deno.test('a credential GET serves no secret to an admin',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const [credential] = (await deriveCredentialsFor(db, ME));
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + ME + '/credentials/'
            + credential!.id,
        token,
    }));
    assertStrictEquals(got.status, 200);
    const text = await got.text();
    assertStrictEquals(text.includes('"secret"'), false);
    assertStrictEquals(
        got.headers.get('content-length'),
        String(new TextEncoder().encode(text).byteLength),
    );
});

const AT = '2026-01-01T00:00:00.000000Z';

// No body names its identity: the path is the only source,
// so a writer that stopped stamping it would store none.
const IDENTITY_EVENT_WRITES = [
    {
        collection: 'tokens',
        body: {
            action: 'issued', chain_id: generateIdentifier(), at: AT,
        },
    },
    { collection: 'token-revocations', body: { at: AT } },
    {
        collection: 'providers',
        body: {
            provider: 'google', provider_subject: 'sub-123',
            action: 'linked', at: AT,
        },
    },
];

Deno.test('every written token, revocation, and provider head'
    + ' stores its path identity', async () => {
    const db = await seededMockDb();
    const stamped: unknown[] = [];
    for (const { collection, body } of IDENTITY_EVENT_WRITES) {
        const prefix = '/identities/' + ME + '/' + collection + '/';
        const name = generateIdentifier();
        const put = await handleRequest(db, apiRequest({
            method: 'PUT', path: prefix + name, token: DEV_TOKEN, body,
        }));
        assertStrictEquals(put.status, 201);
        await put.body?.cancel();
        const head = await db.messagePairs.getHeadPair(prefix, name);
        assert(head !== null);
        stamped.push(bodyOf(head.response)['identity_id']);
    }
    assertEquals(stamped, [ME, ME, ME]);
});
