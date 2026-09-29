import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from '../api/backend-memory.ts';
import type { GuardedDbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { basicAuthorization } from
    '../api/authentication.ts';
import { requestHashOfStored } from './ledger-row.ts';
import {
    generateIdentifier,
    NIL_IDENTIFIER,
} from '../shared/identifier.ts';
import { testHashPassword } from './mock-seed.ts';
import {
    seedRootAdmin, seedSeat,
} from './root-admin-fixture.ts';
import { devToken } from './token-fixtures.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';
import {
    makeAssertionSigner,
} from './client-assertion-fixtures.ts';
import type { NotificationEvent } from '../shared/notifications.ts';
import {
    seedClientRegistration,
    seedIdentityCredential,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import {
    pairIdOf,
    presentedFields,
    refreshTokenFromSetCookie,
    setCookieHeader,
    framedRequest,
    withoutCredentialFields,
} from './http-fixtures.ts';

// C1 discharge under the verbatim-storage contract: the
// /authentication/{token,authorize} message pairs carry live
// secrets in BOTH directions (a request's password/code/
// refresh_token, a response's minted tokens) and store them
// as wire bytes — accepted dev-tier plaintext ledger cost.
// This file proves pair plumbing (counts, documents, genesis
// cols, domain-guard replays) and that live secrets DO land
// in the ledger. The two grant routes' own domain guards
// (double-spend, reuse) — not a stored-response replay —
// govern idempotency.

const BASE = 'http://localhost';
const PASSWORD = 'hunter2-s3cret';

function jsonPost(
    path: string,
    body: unknown,
): Request {
    const record = body !== null
        && typeof body === 'object'
        && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    const lifted = withoutCredentialFields(record);
    const raw = JSON.stringify(lifted.body);
    return framedRequest(`${BASE}/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'content-length': String(
                new TextEncoder().encode(raw).byteLength,
            ),
            'operation-id': generateIdentifier(),
            ...lifted.headers,
        },
        body: raw,
    });
}

// Below-facade pair formation (the identity-fixtures.ts idiom),
// re-pointed from a raw row-plane put (Phase 13 Task 8): the
// authorize grant's pii-by-email lookup and credential check now
// derive from the message ledger, so a pair-less row would go
// derivation-invisible even though it is the same row either
// way — dual-write keeps db.identityPii/identityCredentials
// readable exactly as before, only the write MECHANISM changes.
async function seedPasswordUser(
    db: GuardedDbAdapter,
): Promise<void> {
    await seedPersonIdentity(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await seedIdentityCredential(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'XXZruirZyAOoRpNxaDnpSA', kind: 'password',
        status: 'set',
        secret: await testHashPassword(PASSWORD),
        at: '2026-06-03T00:00:00.000000Z',
    });
}

async function dbWithPasswordUser(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedPasswordUser(db);
    return db;
}

// The same world, over a BackedDbAdapter constructed directly so
// the notify hook (its 4th ctor arg) can be a counting/collecting
// spy — MemoryDbAdapter's preset always wires a no-op there (the
// adapters-invitations.test.ts precedent).
async function dbWithPasswordUserAndNotify(
    notify: (event: NotificationEvent) => void,
): Promise<BackedDbAdapter> {
    const db = new BackedDbAdapter(
        new MemoryStorageBackend(),
        async () => {},
        async () => {},
        notify,
    );
    await db.postSchemaCreation();
    await seedPasswordUser(db);
    return db;
}

async function s256Fields(): Promise<{
    readonly verifier: string;
    readonly code_challenge: string;
    readonly code_challenge_method: 'S256';
}> {
    const verifier = 'pkce-verifier-ledger';
    return {
        verifier,
        code_challenge: bytesToBase64Url(
            await sha256Bytes(verifier),
        ),
        code_challenge_method: 'S256',
    };
}

async function fullLoginFlow(db: GuardedDbAdapter): Promise<{
    readonly code: string;
    readonly access_token: string;
    readonly refresh_token: string;
}> {
    const pkce = await s256Fields();
    const authorizeRes = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: PASSWORD, client_id: 'web',
            code_challenge: pkce.code_challenge,
            code_challenge_method:
                pkce.code_challenge_method,
        }));
    assertStrictEquals(authorizeRes.status, 200);
    const { code } = await presentedFields(authorizeRes) as {
        code: string;
    };
    const tokenRes = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'authorization_code', code,
            client_id: 'web',
            code_verifier: pkce.verifier,
        }));
    assertStrictEquals(tokenRes.status, 200);
    const grant = await presentedFields(tokenRes) as {
        access_token: string;
    };
    return {
        code,
        access_token: grant.access_token,
        refresh_token: refreshTokenFromSetCookie(tokenRes),
    };
}

Deno.test('live secrets land in the auth-flow ledger rows',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const { code, access_token, refresh_token } =
        await fullLoginFlow(db);
    const requests = await db.messagePairs.getAll();
    const responses = await db.messagePairs.getAll();
    const authFlowRows = [...requests, ...responses].filter(
        row => row.path === '/authentication/authorize/'
            || row.path === '/authentication/token/',
    );
    assertStrictEquals(authFlowRows.length, 4);
    const authorizeRequest = requests.find(
        r => r.path === '/authentication/authorize/');
    assert(authorizeRequest);
    assertStrictEquals(
        authorizeRequest!.request.includes(PASSWORD),
        false,
    );
    assert(
        authorizeRequest!.request_secrets.includes(
            'authorization:',
        ),
        'authorize secret missing the basic line',
    );
    const authorizeResponse = responses.find(
        r => r.path === '/authentication/authorize/');
    assert(authorizeResponse);
    assertStrictEquals(
        authorizeResponse!.response.includes(code),
        false,
    );
    assert(
        authorizeResponse!.response_secrets.includes(
            'code="' + code + '"',
        ),
        'authorize secret missing the code',
    );
    const tokenRequest = requests.find(
        r => r.path === '/authentication/token/');
    assert(tokenRequest);
    assertStrictEquals(
        tokenRequest!.request.includes(code),
        false,
    );
    assert(
        tokenRequest!.request_secrets.includes(
            'authorization:',
        ),
        'token secret missing the basic line',
    );
    const tokenResponse = responses.find(
        r => r.path === '/authentication/token/');
    assert(tokenResponse);
    assertStrictEquals(
        tokenResponse!.response.includes(access_token),
        false,
    );
    assert(
        tokenResponse!.response_secrets.includes(
            access_token,
        ),
        'token secret missing access_token',
    );
    assertStrictEquals(
        tokenResponse!.response.includes(refresh_token),
        false,
        'token stored JSON must omit refresh_token',
    );
    assert(
        tokenResponse!.response_secrets.includes(
            'set-cookie:',
        ),
        'token secret missing the refresh cookie',
    );
});

Deno.test('a full login flow keeps requests/responses balanced,'
+ ' one genesis pair per hop plus the token grant\'s own'
+ ' identity_tokens row event pair', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    await fullLoginFlow(db);
    const requests = await db.messagePairs.getAll();
    const responses = await db.messagePairs.getAll();

    // seedRootAdmin: org + membership (2)
    // + identity + pii + credential (3)
    // + rehash + authorize + code document
    // + code DELETE + issued event + token = 12.
    assertStrictEquals(requests.length, 12);
    // The AUTH hops stay operation documents (name '');
    // the issued event and the code document carry
    // non-empty names.
    const authHops = requests.slice(5).filter(
        row => row.path === '/authentication/authorize/'
            || row.path === '/authentication/token/',
    );
    assertStrictEquals(authHops.length, 2);
    for (const row of authHops) {
        assertStrictEquals(row.name, '');
    }
    const tokenEventRequest = requests.slice(5).find(
        row => row.path
            === '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/',
    );
    assert(tokenEventRequest);
    assertNotStrictEquals(tokenEventRequest!.name, '');
    // name mirrors the SAME partition the requests loop above
    // pins: the two AUTH hops stay operation-path, the token
    // grant's row event response carries its OWN row's (non-
    // empty) name — a request/response pair shares one `id`
    // AND one (path, name) document (appendMessagePairOnce),
    // so this is the identical classification, re-applied.
    const responseAuthHops = responses.slice(5).filter(
        row => row.path === '/authentication/authorize/'
            || row.path === '/authentication/token/',
    );
    assertStrictEquals(responseAuthHops.length, 2);
    for (const row of responseAuthHops) {
        assertStrictEquals(row.name, '');
    }
    const tokenEventResponse = responses.slice(5).find(
        row => row.path
            === '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/',
    );
    assert(tokenEventResponse);
    assertNotStrictEquals(tokenEventResponse!.name, '');
    const codePut = responses.find((row) =>
        row.path === '/authentication/authorization-codes/'
        && row.method === 'PUT'
    );
    const codeDelete = responses.find((row) =>
        row.path === '/authentication/authorization-codes/'
        && row.method === 'DELETE'
    );
    assert(codePut !== undefined);
    assert(codeDelete !== undefined);
    assertStrictEquals(codeDelete.supersedes, codePut.id);
    // The code DELETE is the one successor. Every other
    // row in this slice is a genesis.
    for (const row of responses.slice(6)) {
        if (row.id === codeDelete.id) continue;
        assertStrictEquals(row.supersedes, NIL_IDENTIFIER);
        assertStrictEquals('follows' in row, false);
    }
});

Deno.test('stored messages verify against their hashes', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    await fullLoginFlow(db);
    for (const row of await db.messagePairs.getAll()) {
        assertStrictEquals(
            await requestHashOfStored(row),
            row.request_hash,
        );
    }
});

Deno.test('a wrong password stores no NEW pair beyond the'
+ " fixture's own pii + credential seed", async () => {
    const db = await dbWithPasswordUser();
    const pkce = await s256Fields();
    const res = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: 'WRONG', client_id: 'web',
            code_challenge: pkce.code_challenge,
            code_challenge_method:
                pkce.code_challenge_method,
        }));
    assertStrictEquals(res.status, 401);
    // 3: the fixture's own identity + pii + credential pairs
    // (seedPersonIdentity/seedIdentityCredential) — the failed
    // attempt itself appends no further pair.
    assertStrictEquals((await db.messagePairs.getAll()).length, 4);
    assertStrictEquals((await db.messagePairs.getAll()).length, 4);
});

Deno.test('a double-spent authorization code stores nothing on'
+ ' the replay — the domain guard, not a stored-response'
+ ' replay, governs (REPLAY_EXEMPT_ROUTE_PATTERNS)',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const { code } = await fullLoginFlow(db);
    const before = (await db.messagePairs.getAll()).length;
    // jsonPost mints a fresh operation-id, so this replay
    // is not byte-identical to the original exchange.
    // Otherwise same-hash dedup would mask a regression
    // that appended a pair on a failing branch.
    const replay = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'authorization_code', code,
            client_id: 'web',
        }));
    assertStrictEquals(replay.status, 401);
    assertStrictEquals((await db.messagePairs.getAll()).length, before);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before);
});

Deno.test('the wire response on a 2xx carries an ETag and'
+ ' Date header derived from the stored pair',
async () => {
    const db = await dbWithPasswordUser();
    const pkce = await s256Fields();
    const res = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: PASSWORD, client_id: 'web',
            code_challenge: pkce.code_challenge,
            code_challenge_method:
                pkce.code_challenge_method,
        }));
    assertStrictEquals(res.status, 200);
    assert(pairIdOf(res));
    assert(res.headers.get('Date'));
});

Deno.test('an unsupported grant_type stores no NEW pair beyond the'
+ " fixture's own pii + credential seed", async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, jsonPost(
        'authentication/token', { grant_type: 'wat' }));
    assertStrictEquals(res.status, 400);
    // 3: the fixture's own identity + pii + credential pairs
    // (seedPersonIdentity/seedIdentityCredential) — the rejected
    // grant itself appends no further pair.
    assertStrictEquals((await db.messagePairs.getAll()).length, 4);
});

Deno.test('a refresh grant stores its own pair with live secrets',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const first = await fullLoginFlow(db);
    const res = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'refresh',
            refresh_token: first.refresh_token,
        }));
    assertStrictEquals(res.status, 200);
    const rotatedJson = await presentedFields(res) as {
        access_token: string;
    };
    const rotated = {
        access_token: rotatedJson.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
    const requests = await db.messagePairs.getAll();
    const responses = await db.messagePairs.getAll();

    // fullLoginFlow is 12 (code document PUT and DELETE
    // replace the spend marker). Refresh adds its own
    // pair plus the retired root and the issued
    // successor.
    assertStrictEquals(requests.length, 15);
    const cookieLine = 'cookie: refresh_token='
        + first.refresh_token;
    const refreshRequest = requests.find(
        (r) => r.path === '/authentication/token/'
            && (
                r.request_secrets.startsWith(cookieLine)
                || r.request_secrets.includes(
                    '\r\n' + cookieLine,
                )
            ),
    );
    assert(refreshRequest);
    const refreshResponse = responses.find(
        r => r.id === refreshRequest!.id,
    );
    assert(refreshResponse);
    assert(
        refreshResponse!.response_secrets.includes(
            rotated.access_token,
        ),
    );
    assertStrictEquals(
        refreshResponse!.response.includes(
            rotated.access_token,
        ),
        false,
    );
    assertStrictEquals(
        refreshResponse!.response.includes(rotated.refresh_token),
        false,
    );
});

Deno.test('a token-exchange grant stores its own pair with live'
+ ' secrets', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const subjectToken = await devToken('XXZruirZyAOoRpNxaDnpSA');
    const res = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'token-exchange',
            subject_token: subjectToken,
            actor_token: subjectToken,
        }));
    assertStrictEquals(res.status, 200);
    const bodyJson = await presentedFields(res) as {
        access_token: string;
        refresh_token?: unknown;
    };
    assertStrictEquals(bodyJson.refresh_token, undefined);
    assertStrictEquals(setCookieHeader(res), '');
    const requests = await db.messagePairs.getAll();
    const responses = await db.messagePairs.getAll();

    // 7: the fixture's own identity + pii + credential pairs
    // (3) + seedRootAdmin's 2 fixture pairs + the exchange's
    // own event pair (Phase 13 Task 5: issueTokenPair's root
    // gains its own pair at the row's document) + its operation
    // pair.
    assertStrictEquals(requests.length, 8);
    const exchangeRequest = requests.find(
        r => r.path === '/authentication/token/'
            && r.request_secrets.includes(subjectToken),
    );
    assert(exchangeRequest);
    const exchangeResponse = responses.find(
        r => r.id === exchangeRequest!.id,
    );
    assert(exchangeResponse);
    assert(
        exchangeResponse!.response_secrets.includes(
            bodyJson.access_token,
        ),
    );
    assertStrictEquals(
        exchangeResponse!.response.includes(
            bodyJson.access_token,
        ),
        false,
    );
    assertStrictEquals(
        exchangeResponse!.response.includes('refresh_token'),
        false,
    );
});

// Below-facade pair formation (the member-fixtures.ts idiom):
// the client_credentials grant's own admin role check derives
// from the message plane once role_grants/memberships flip, so a
// raw row here would go derivation-invisible. Every id/field
// value stays IDENTICAL to the raw puts these replace — only the
// write mechanism changes.
async function seedMembershipMessagePair(
    db: GuardedDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body.organization_id),
        String(body.identity_id),
        body.type as 'admin' | 'member',
        String(body.at),
    );
}


Deno.test('a client_credentials grant stores its own pair with live'
+ ' secrets', async () => {
    const db = await dbWithPasswordUser();
    await seedMembershipMessagePair(db, 'm-svc', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'uYaHKbNeVUcsFjuooOjMew',
        type: 'member',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const signer = await makeAssertionSigner('ES256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signer.sign({
        iss: 'uYaHKbNeVUcsFjuooOjMew', sub: 'uYaHKbNeVUcsFjuooOjMew',
        aud: 'fusion-angle',
        exp: now + 300, iat: now, jti: 'assert-shadow-1',
    });
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', {
        grant_types: 'client_credentials',
        redirect_uris: '', jwks: signer.jwks,
        aud: 'fusion-angle', status: 'active',
    });
    const res = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'client_credentials',
            client_id: 'uYaHKbNeVUcsFjuooOjMew',
            client_assertion: assertion,
        }));
    assertStrictEquals(res.status, 200);
    const bodyJson = await presentedFields(res) as {
        access_token: string;
    };
    const body = {
        access_token: bodyJson.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
    const requests = await db.messagePairs.getAll();
    const responses = await db.messagePairs.getAll();

    // 8: dbWithPasswordUser's own identity + pii + credential
    // pairs (3) + the fixture's own membership pair
    // (Phase 13 Task 1) + the registration-facet pair the
    // fixture seeds (clients elimination) precede the token
    // grant's spent-jti ticket, its own event pair (Phase 13
    // Task 5: the issued root's pair at the row's document),
    // and its operation message pair.
    assertStrictEquals(requests.length, 9);
    const credRequest = requests.find(
        r => r.path === '/authentication/token/'
            && r.request_secrets.includes(assertion),
    );
    assert(credRequest);
    const credResponse = responses.find(
        r => r.id === credRequest!.id,
    );
    assert(credResponse);
    assert(
        credResponse!.response_secrets.includes(
            body.access_token,
        ),
    );
    assertStrictEquals(
        credResponse!.response.includes(
            body.access_token,
        ),
        false,
    );
    assertStrictEquals(
        credResponse!.response.includes(body.refresh_token),
        false,
    );
});

// The dedicated arm's SUCCESS path falls through to the
// pre-existing authentication/token notification block (it does
// NOT return early — only a failed grant does) — see api.ts's
// POST arm. Pins that a real grant fires a real notification.
Deno.test('a successful authentication/token POST posts a scoped'
+ ' notification carrying the minted sub', async () => {
    const posted: NotificationEvent[] = [];
    const db = await dbWithPasswordUserAndNotify(
        e => posted.push(e));
    await seedRootAdmin(db);
    await fullLoginFlow(db);
    // authorize posts nothing (no UI subscribes to a bare
    // code); the token grant posts the one scoped notification.
    assertEquals(posted, [{
        kind: 'scoped',
        identityIds: ['XXZruirZyAOoRpNxaDnpSA'],
        organizationIds: ['AjdvjuECVZEgZoFajaIEkg'],
    }]);
});

Deno.test('the code grant Basic line is stored in request_secrets',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const pkce = await s256Fields();
    const authorizeRes = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: PASSWORD, client_id: 'web',
            code_challenge: pkce.code_challenge,
            code_challenge_method:
                pkce.code_challenge_method,
        }));
    const { code } = await presentedFields(authorizeRes) as {
        code: string;
    };
    const req = framedRequest(`${BASE}/authentication/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'authorization': basicAuthorization(
                code, pkce.verifier,
            ),
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: 'web',
        }),
    });
    const res = await handleRequest(db, req);
    assertStrictEquals(res.status, 200);
    const requests = await db.messagePairs.getAll();
    const row = requests.find(
        r => r.path === '/authentication/token/');
    assert(row);
    assert(row!.request_secrets.includes('authorization:'));
    assertStrictEquals(
        row!.request.includes(code), false,
    );
    assertStrictEquals(
        row!.response.includes(code), false,
    );
});

Deno.test('a reused (already-rotated-away) refresh token grant is a'
+ ' 401 that stores NO further operation message pair — but its'
+ ' replay-branch chain-revocation DOES grow the ledger by its'
+ ' own event pairs (Phase 13 Task 5: revocationAppends is not'
+ ' idempotent, and it now carries a pair per row)', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const first = await fullLoginFlow(db);
    await handleRequest(db, jsonPost('authentication/token', {
        grant_type: 'refresh',
        refresh_token: first.refresh_token,
    }));
    const before = (await db.messagePairs.getAll()).length;
    const operationMessagePairsBefore =
        (await db.messagePairs.getAll()).filter(
        r => r.path === '/authentication/token/'
            && r.name === '',
    ).length;
    // Same reasoning as the double-spent-code test above:
    // a fresh operation-id keeps this reuse from being
    // byte-identical to the rotation already stored.
    const reused = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'refresh',
            refresh_token: first.refresh_token,
        }));
    assertStrictEquals(reused.status, 401);
    const requests = await db.messagePairs.getAll();

    const operationMessagePairsAfter = requests.filter(
        r => r.path === '/authentication/token/'
            && r.name === '',
    ).length;
    assertStrictEquals(
        operationMessagePairsAfter,
        operationMessagePairsBefore,
        'no NEW operation message pair for the replay-branch 401',
    );
    // +2: the chain's two distinct jtis (the original root, the
    // rotate's successor) each gain a fresh 'revoked' event pair
    // — the replay branch's own no-operation-message-pair-but-
    // growing-event-pairs shape (Phase 13 Task 5).
    assertStrictEquals(requests.length, before + 2);
});
