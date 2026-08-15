import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from '../api/backend-memory.ts';
import type { GuardedDbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { requestMessageHash } from '../api/message-form.ts';
import { hashPassword } from '../shared/password-hash.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { devToken } from './token-fixtures.ts';
import {
    makeAssertionSigner,
} from './client-assertion-fixtures.ts';
import type { NotificationEvent } from '../api/notifications.ts';
import { REQUEST_ID_HEADER } from '../api/request-context.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    seedClientRegistration,
    seedIdentityCredential,
    seedIdentityPii,
} from './identity-fixtures.ts';
import {
    TEST_OPERATION_ID,
    refreshTokenFromSetCookie,
    setCookieHeader,
} from './http-fixtures.ts';

// C1 discharge under the verbatim-storage contract: the
// /authentication/{token,authorize} message pairs carry live
// secrets in BOTH directions (a request's password/code/
// refresh_token, a response's minted tokens) and store them
// as wire bytes — accepted dev-tier plaintext ledger cost.
// This file proves pair plumbing (counts, addresses, genesis
// cols, domain-guard replays) and that live secrets DO land
// in the ledger. The two grant routes' own domain guards
// (double-spend, reuse) — not a stored-response replay —
// govern idempotency.

const BASE = 'http://localhost';
const PASSWORD = 'hunter2-s3cret';

function jsonPost(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
): Request {
    return new Request(`${BASE}/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders,
        },
        body: JSON.stringify(body),
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
    await seedIdentityPii(db, 'current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await seedIdentityCredential(db, 'current', 'c1', {
        identity_id: 'current', kind: 'password',
        status: 'set', secret: await hashPassword(PASSWORD),
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

async function fullLoginFlow(db: GuardedDbAdapter): Promise<{
    readonly code: string;
    readonly access_token: string;
    readonly refresh_token: string;
}> {
    const authorizeRes = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: PASSWORD, client_id: 'web',
        }));
    assert.equal(authorizeRes.status, 201);
    const { code } = await authorizeRes.json() as {
        code: string;
    };
    const tokenRes = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'authorization_code', code,
            client_id: 'web',
        }));
    assert.equal(tokenRes.status, 201);
    const grant = await tokenRes.json() as {
        access_token: string;
    };
    return {
        code,
        access_token: grant.access_token,
        refresh_token: refreshTokenFromSetCookie(tokenRes),
    };
}

test('live secrets land in the auth-flow ledger rows',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const { code, access_token, refresh_token } =
        await fullLoginFlow(db);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    const authFlowRows = [...requests, ...responses].filter(
        row => row.uri_collection === '/authentication/authorize/'
            || row.uri_collection === '/authentication/token/',
    );
    assert.equal(authFlowRows.length, 4);
    const authorizeRequest = requests.find(
        r => r.uri_collection === '/authentication/authorize/');
    assert.ok(authorizeRequest);
    assert.ok(
        authorizeRequest!.message.includes(PASSWORD),
        'authorize request missing live password',
    );
    assert.ok(
        authorizeRequest!.message.includes('demo@example.com'),
        'authorize request missing live email',
    );
    const authorizeResponse = responses.find(
        r => r.uri_collection === '/authentication/authorize/');
    assert.ok(authorizeResponse);
    assert.ok(
        authorizeResponse!.message.includes(code),
        'authorize response missing live code',
    );
    const tokenRequest = requests.find(
        r => r.uri_collection === '/authentication/token/');
    assert.ok(tokenRequest);
    assert.ok(
        tokenRequest!.message.includes(code),
        'token request missing live code',
    );
    const tokenResponse = responses.find(
        r => r.uri_collection === '/authentication/token/');
    assert.ok(tokenResponse);
    assert.ok(
        tokenResponse!.message.includes(access_token),
        'token response missing access_token',
    );
    assert.equal(
        tokenResponse!.message.includes(refresh_token),
        false,
        'token stored JSON must omit refresh_token',
    );
});

test('a full login flow keeps requests/responses balanced,'
+ ' one genesis pair per hop plus the token grant\'s own'
+ ' identity_tokens row event pair', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    await fullLoginFlow(db);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    // seedRootAdmin: org + membership (2; role-grants retired)
    // + pii + credential (2) + authorize + token + token-event
    // (3) = 7.
    assert.equal(requests.length, 7);
    // The AUTH hops stay operation-addressed (uriId ''); the
    // token grant's row event pair rides its OWN row's address
    // instead, so it alone carries a non-empty uri_id in this
    // slice. Indices 4–5 are authorize + token.
    const authHops = requests.slice(4).filter(
        row => row.uri_collection === '/authentication/authorize/'
            || row.uri_collection === '/authentication/token/',
    );
    assert.equal(authHops.length, 2);
    for (const row of authHops) {
        assert.equal(row.uri_id, '');
    }
    const tokenEventRequest = requests.slice(4).find(
        row => row.uri_collection === '/identity-tokens/',
    );
    assert.ok(tokenEventRequest);
    assert.notEqual(tokenEventRequest!.uri_id, '');
    // uri_id mirrors the SAME partition the requests loop above
    // pins: the two AUTH hops stay operation-addressed, the token
    // grant's row event response carries its OWN row's (non-
    // empty) uri_id — a request/response pair shares one `id`
    // AND one (uri_collection, uri_id) address (appendMessagePair),
    // so this is the identical classification, re-applied.
    const responseAuthHops = responses.slice(4).filter(
        row => row.uri_collection === '/authentication/authorize/'
            || row.uri_collection === '/authentication/token/',
    );
    assert.equal(responseAuthHops.length, 2);
    for (const row of responseAuthHops) {
        assert.equal(row.uri_id, '');
    }
    const tokenEventResponse = responses.slice(4).find(
        row => row.uri_collection === '/identity-tokens/',
    );
    assert.ok(tokenEventResponse);
    assert.notEqual(tokenEventResponse!.uri_id, '');
    // Response rows carry no predecessor columns.
    for (const row of responses.slice(5)) {
        assert.equal('supersedes' in row, false);
        assert.equal('follows' in row, false);
    }
});

test('stored messages verify against their hashes', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    await fullLoginFlow(db);
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await requestMessageHash(row.message),
            row.message_hash);
    }
});

test('a wrong password stores no NEW pair beyond the'
+ " fixture's own pii + credential seed", async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: 'WRONG', client_id: 'web',
        }));
    assert.equal(res.status, 401);
    // 2: the fixture's own pii + credential pairs (Phase 13 Task
    // 8's seedIdentityPii/seedIdentityCredential re-point) — the
    // failed attempt itself appends no further pair.
    assert.equal((await db.requests.getAll()).length, 2);
    assert.equal((await db.responses.getAll()).length, 2);
});

test('a double-spent authorization code stores nothing on'
+ ' the replay — the domain guard, not a stored-response'
+ ' replay, governs (REPLAY_EXEMPT_ROUTE_PATTERNS)',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const { code } = await fullLoginFlow(db);
    const before = (await db.requests.getAll()).length;
    // A distinguishing header keeps this replay from being
    // byte-identical to the original exchange — otherwise
    // appendMessagePair's same-hash dedup (message-pair.ts)
    // would mask a regression that mistakenly appended a pair
    // on a failing branch: the row counts below would stay
    // flat whether or not a stray append fired.
    const replay = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'authorization_code', code,
            client_id: 'web',
        }, { [REQUEST_ID_HEADER]: 'replay-attempt' }));
    assert.equal(replay.status, 401);
    assert.equal((await db.requests.getAll()).length, before);
    assert.equal(
        (await db.responses.getAll()).length, before);
});

test('the wire response on a 2xx carries a Response-ID and'
+ ' Date header derived from the stored pair',
async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: PASSWORD, client_id: 'web',
        }));
    assert.equal(res.status, 201);
    assert.ok(res.headers.get('Response-ID'));
    assert.ok(res.headers.get('Date'));
});

test('an unsupported grant_type stores no NEW pair beyond the'
+ " fixture's own pii + credential seed", async () => {
    const db = await dbWithPasswordUser();
    const res = await handleRequest(db, jsonPost(
        'authentication/token', { grant_type: 'wat' }));
    assert.equal(res.status, 400);
    // 2: the fixture's own pii + credential pairs (Phase 13 Task
    // 8's seedIdentityPii/seedIdentityCredential re-point) — the
    // rejected grant itself appends no further pair.
    assert.equal((await db.requests.getAll()).length, 2);
});

test('a refresh grant stores its own pair with live secrets',
async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const first = await fullLoginFlow(db);
    const res = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'refresh',
            refresh_token: first.refresh_token,
        }));
    assert.equal(res.status, 201);
    const rotatedJson = await res.json() as {
        access_token: string;
    };
    const rotated = {
        access_token: rotatedJson.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    // 10: the fixture's own pii + credential pairs (2, Phase 13
    // Task 8) + seedRootAdmin's 2 fixture pairs + authorize +
    // token (the token hop's own event pair, Phase 13 Task 5,
    // brings fullLoginFlow's count to 7) + refresh's own
    // operation pair + refresh's rotate-branch event pairs (2:
    // the retired root, the issued successor — Phase 13 Task 5).
    assert.equal(requests.length, 10);
    const refreshRequest = requests.find(
        r => r.uri_collection === '/authentication/token/'
            && r.message.includes(first.refresh_token),
    );
    assert.ok(refreshRequest);
    const refreshResponse = responses.find(
        r => r.id === refreshRequest!.id,
    );
    assert.ok(refreshResponse);
    assert.ok(
        refreshResponse!.message.includes(rotated.access_token),
    );
    assert.equal(
        refreshResponse!.message.includes(rotated.refresh_token),
        false,
    );
});

test('a token-exchange grant stores its own pair with live'
+ ' secrets', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const subjectToken = await devToken('current');
    const res = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'token-exchange',
            subject_token: subjectToken,
            actor_token: subjectToken,
        }));
    assert.equal(res.status, 201);
    const bodyJson = await res.json() as {
        access_token: string;
        refresh_token?: unknown;
    };
    assert.equal(bodyJson.refresh_token, undefined);
    assert.equal(setCookieHeader(res), '');
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    // 6: the fixture's own pii + credential pairs (2, Phase 13
    // Task 8) + seedRootAdmin's 2 fixture pairs + the exchange's
    // own event pair (Phase 13 Task 5: issueTokenPair's root
    // gains its own pair at the row's address) + its operation
    // pair.
    assert.equal(requests.length, 6);
    const exchangeRequest = requests.find(
        r => r.uri_collection === '/authentication/token/'
            && r.message.includes(subjectToken),
    );
    assert.ok(exchangeRequest);
    const exchangeResponse = responses.find(
        r => r.id === exchangeRequest!.id,
    );
    assert.ok(exchangeResponse);
    assert.ok(
        exchangeResponse!.message.includes(
            bodyJson.access_token,
        ),
    );
    assert.equal(
        exchangeResponse!.message.includes('refresh_token'),
        false,
    );
});

// Below-facade pair formation (the member-fixtures.ts idiom):
// the client_credentials grant's own admin role check derives
// from the pair plane once role_grants/memberships flip, so a
// raw row here would go derivation-invisible. Every id/field
// value stays IDENTICAL to the raw puts these replace — only the
// write mechanism changes.
async function seedMembershipPair(
    db: GuardedDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}


test('a client_credentials grant stores its own pair with live'
+ ' secrets', async () => {
    const db = await dbWithPasswordUser();
    await seedMembershipPair(db, 'm-svc', {
        organization_id: '1',
        identity_id: 'svc-client',
        type: 'member',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const signer = await makeAssertionSigner('ES256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signer.sign({
        iss: 'svc-client', sub: 'svc-client',
        aud: 'fusion-ai-web',
        exp: now + 300, iat: now, jti: 'assert-shadow-1',
    });
    await seedClientRegistration(db, 'svc-client', {
        grant_types: 'client_credentials',
        redirect_uris: '', jwks: signer.jwks,
        aud: 'fusion-ai-web', status: 'active',
    });
    const res = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'client_credentials',
            client_id: 'svc-client',
            client_assertion: assertion,
        }));
    assert.equal(res.status, 201);
    const bodyJson = await res.json() as {
        access_token: string;
    };
    const body = {
        access_token: bodyJson.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    // 7: dbWithPasswordUser's own pii + credential pairs (2,
    // Phase 13 Task 8) + the fixture's own membership pair
    // (Phase 13 Task 1) + the registration-facet pair the
    // fixture seeds (clients elimination) precede the token
    // grant's spent-jti ticket, its own event pair (Phase 13
    // Task 5: the issued root's pair at the row's address),
    // and its operation pair.
    assert.equal(requests.length, 7);
    const credRequest = requests.find(
        r => r.uri_collection === '/authentication/token/'
            && r.message.includes(assertion),
    );
    assert.ok(credRequest);
    const credResponse = responses.find(
        r => r.id === credRequest!.id,
    );
    assert.ok(credResponse);
    assert.ok(
        credResponse!.message.includes(body.access_token),
    );
    assert.equal(
        credResponse!.message.includes(body.refresh_token),
        false,
    );
});

// The dedicated arm's SUCCESS path falls through to the
// pre-existing authentication/token notification block (it does
// NOT return early — only a failed grant does) — see api.ts's
// POST arm. Pins that a real grant fires a real notification.
test('a successful authentication/token POST posts a scoped'
+ ' notification carrying the minted sub', async () => {
    const posted: NotificationEvent[] = [];
    const db = await dbWithPasswordUserAndNotify(
        e => posted.push(e));
    await seedRootAdmin(db);
    await fullLoginFlow(db);
    // authorize posts nothing (no UI subscribes to a bare
    // code); the token grant posts the one scoped notification.
    assert.deepEqual(posted, [{
        kind: 'scoped',
        identityIds: ['current'],
        organizationIds: ['1'],
    }]);
});

test('an Authorization header sent alongside the token grant is'
+ ' stored verbatim', async () => {
    const db = await dbWithPasswordUser();
    await seedRootAdmin(db);
    const authorizeRes = await handleRequest(db, jsonPost(
        'authentication/authorize', {
            method: 'password', username: 'demo@example.com',
            password: PASSWORD, client_id: 'web',
        }));
    const { code } = await authorizeRes.json() as {
        code: string;
    };
    const req = new Request(`${BASE}/authentication/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer some-stale-caller-token',
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: 'web',
        }),
    });
    const res = await handleRequest(db, req);
    assert.equal(res.status, 201);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_collection === '/authentication/token/');
    assert.ok(row);
    assert.ok(
        row!.message.includes('some-stale-caller-token'));
});

test('a reused (already-rotated-away) refresh token grant is a'
+ ' 401 that stores NO further operation pair — but its'
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
    const before = (await db.requests.getAll()).length;
    const opPairsBefore = (await db.requests.getAll()).filter(
        r => r.uri_collection === '/authentication/token/'
            && r.uri_id === '',
    ).length;
    // Same reasoning as the double-spent-code test above: a
    // distinguishing header keeps this reuse attempt from
    // being byte-identical to the rotation that already
    // stored a pair with the same body.
    const reused = await handleRequest(db, jsonPost(
        'authentication/token', {
            grant_type: 'refresh',
            refresh_token: first.refresh_token,
        }, { [REQUEST_ID_HEADER]: 'replay-attempt' }));
    assert.equal(reused.status, 401);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    const opPairsAfter = requests.filter(
        r => r.uri_collection === '/authentication/token/'
            && r.uri_id === '',
    ).length;
    assert.equal(
        opPairsAfter, opPairsBefore,
        'no NEW operation pair for the replay-branch 401',
    );
    // +2: the chain's two distinct jtis (the original root, the
    // rotate's successor) each gain a fresh 'revoked' event pair
    // — the replay branch's own no-operation-pair-but-growing-
    // event-pairs shape (Phase 13 Task 5).
    assert.equal(requests.length, before + 2);
});
