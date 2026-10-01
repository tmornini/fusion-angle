import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { seededMockDb } from './mock-seed.ts';
import { DEV_TOKEN, organizationToken } from './token-fixtures.ts';
import { apiRequest, partsOf } from './http-fixtures.ts';
import { deriveCredentialsFor } from '../api/derive-identity-spine.ts';
import { bodyOf } from '../api/derive-documents.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import {
    ORGANIZATION_TWO,
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { nowUtc } from '../shared/types.ts';
import {
    attemptFor,
    canonicalPath,
    formWriteMessagePair,
    runWrite,
} from '../api/message-pair.ts';
import { CREDENTIAL_DETAIL_PATTERN } from
    '../api/family-registry.ts';
import { captureConsole } from './fixtures/console-capture.ts';

const ME = 'XXZruirZyAOoRpNxaDnpSA';

// An identity seated in one organization only, with PII: the
// subject a membership fence judges.
async function seedSeatedIdentity(
    db: Awaited<ReturnType<typeof seededMockDb>>,
    organization: string,
): Promise<string> {
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: 'Seated', email: id.toLowerCase() + '@example.com',
        phone: '', bio: '',
    });
    await seedSeat(db, organization, id, 'member');
    return id;
}

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

// The fence runs before the head is read, so a foreign
// identity's PII answers 403 live or erased: a 410 would tell
// a stranger the erasure happened.
Deno.test('a foreign identity\'s erased PII answers 403, never'
    + ' Gone', async () => {
    const db = await seededMockDb();
    const stranger = await organizationToken();
    const theirAdmin = await organizationToken(ME, ORGANIZATION_TWO);
    const theirs = await seedSeatedIdentity(db, ORGANIZATION_TWO);
    const path = '/identities/' + theirs + '/pii';
    const live = await handleRequest(db, apiRequest({
        method: 'GET', path, token: stranger,
    }));
    assertStrictEquals(live.status, 403);
    await live.body?.cancel();
    const erased = await handleRequest(db, apiRequest({
        method: 'DELETE', path, token: theirAdmin,
    }));
    assertStrictEquals(erased.status, 204);
    const gone = await handleRequest(db, apiRequest({
        method: 'GET', path, token: theirAdmin,
    }));
    assertStrictEquals(gone.status, 410);
    await gone.body?.cancel();
    const fenced = await handleRequest(db, apiRequest({
        method: 'GET', path, token: stranger,
    }));
    assertStrictEquals(fenced.status, 403);
    const { error } = await fenced.json() as { error: string };
    assertStrictEquals(error.startsWith('Gone:'), false);
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

async function stampedIdentityOfEachWrite(
    db: Awaited<ReturnType<typeof seededMockDb>>,
    identity: string,
): Promise<unknown[]> {
    const stamped: unknown[] = [];
    for (const { collection, body } of IDENTITY_EVENT_WRITES) {
        const prefix = '/identities/' + identity + '/' + collection
            + '/';
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
    return stamped;
}

Deno.test('every written token, revocation, and provider head'
    + ' stores its path identity', async () => {
    const db = await seededMockDb();
    assertEquals(
        await stampedIdentityOfEachWrite(db, ME), [ME, ME, ME],
    );
    // DEV_TOKEN's subject is ME: only at another identity's
    // prefix do the path and the actor disagree, so only there
    // does the stamp's source show.
    const other = await seedSeatedIdentity(db, STARK_ORGANIZATION);
    assertEquals(
        await stampedIdentityOfEachWrite(db, other),
        [other, other, other],
    );
});

// The nested reads reach no flat prefix: a provider pair at
// the retired /identity-providers/ path is invisible to
// identities/:id/providers/:eid and to its collection, so a
// fallback that returned would serve it.
Deno.test('a provider at the retired flat prefix is not served'
    + ' nested', async () => {
    const db = await seededMockDb();
    const eid = generateIdentifier();
    const body = {
        identity_id: ME, provider: 'google',
        provider_subject: 'sub-123', action: 'linked', at: AT,
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/identity-providers/' + eid,
        routePattern: 'identity-providers/:id',
        routeSegments: ['identity-providers', ':id'],
        pathSegments: ['identity-providers', eid],
        headerFields: [],
        body,
        requesterIdentityId: ME,
        requestAt: nowUtc(),
        organization: undefined,
        responseBody: { id: eid, ...body },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(db, attemptFor([messagePair]), [messagePair]);
    const flat = canonicalPath(undefined, '/identity-providers/');
    assertStrictEquals(
        (await db.messagePairs.getHeadPair(flat, eid))?.id,
        messagePair.id,
    );
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + ME + '/providers/' + eid,
        token: DEV_TOKEN,
    }));
    assertStrictEquals(got.status, 404);
    await got.body?.cancel();
    const collection = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + ME + '/providers/',
        token: DEV_TOKEN,
    }));
    assertEquals(
        (await partsOf<{ id: string }>(collection))
            .map((part) => part.body().toValue().id)
            .filter((id) => id === eid),
        [],
    );
});

// The credential PUT validator admits no body without its
// identity_id, so a stored head lacking it is the store's
// fault, never the reader's: the request crashes, as a state
// head with no state does.
Deno.test('a credential head without an identity answers 500',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const cid = generateIdentifier();
    const body = { kind: 'password', status: 'set', at: AT };
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/identities/' + ME + '/credentials/' + cid,
        routePattern: CREDENTIAL_DETAIL_PATTERN,
        routeSegments: ['identities', ':id', 'credentials', ':cid'],
        pathSegments: ['identities', ME, 'credentials', cid],
        headerFields: [],
        body,
        requesterIdentityId: ME,
        requestAt: nowUtc(),
        organization: undefined,
        responseBody: { id: cid, ...body },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(db, attemptFor([messagePair]), [messagePair]);
    const { result: got, calls } = await captureConsole(
        'error',
        () => handleRequest(db, apiRequest({
            method: 'GET',
            path: '/identities/' + ME + '/credentials/' + cid,
            token,
        })),
    );
    assertStrictEquals(got.status, 500);
    assertEquals(await got.json(), { error: 'internal error' });
    assertStrictEquals(calls.length, 1);
    const [event, , error] = calls[0]!;
    assertStrictEquals(event, 'request failed');
    assertMatch(
        (error as Error).message,
        new RegExp(ME + '/credentials/' + cid + '.*' + messagePair.id),
    );
});

// The fence judges the stored identity_id, the row plane's
// rule: a credential whose body names an identity seated
// elsewhere is foreign to the path identity's organization,
// whatever the path says.
Deno.test('a credential naming an identity seated elsewhere'
    + ' answers 403', async () => {
    const db = await seededMockDb();
    const elsewhere = await seedSeatedIdentity(db, ORGANIZATION_TWO);
    const cid = generateIdentifier();
    const path = '/identities/' + ME + '/credentials/' + cid;
    const put = await handleRequest(db, apiRequest({
        method: 'PUT', path, token: DEV_TOKEN,
        body: {
            identity_id: elsewhere, kind: 'password', status: 'set',
            secret: '$scrypt$ln=17,r=8,p=1$c2FsdA$aGFzaA', at: AT,
        },
    }));
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path, token: await organizationToken(),
    }));
    assertStrictEquals(got.status, 403);
    await got.body?.cancel();
});

// The fence precedes the head read: an absent foreign PII is
// 403, never the 404 that would say the identity has none.
Deno.test('a foreign identity\'s absent PII answers 403, never'
    + ' 404', async () => {
    const db = await seededMockDb();
    const seated = generateIdentifier();
    await seedSeat(db, ORGANIZATION_TWO, seated, 'member');
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: '/identities/' + seated + '/pii',
        token: await organizationToken(),
    }));
    assertStrictEquals(got.status, 403);
    await got.body?.cancel();
});
