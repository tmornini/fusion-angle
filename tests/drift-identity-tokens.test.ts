import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest, PUT } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import {
    base64UrlDecode,
    bytesToBase64Url,
} from '../shared/base64url.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { testHashPassword } from './mock-seed.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    seedIdentityPii,
    seedIdentityCredential,
} from './identity-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedMessageBodyText, storedPutBodyText,
    refreshTokenFromSetCookie,
} from './http-fixtures.ts';
import {
    deriveIdentityToken,
    deriveIdentityTokenEventsForJti,
    identityTokenEntityOf,
} from '../api/derive-identity-tokens.ts';
import {
    formTokenEventMessagePair,
    formWriteMessagePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import { WRITE_RESPONSE_SPECS } from '../api/routes.ts';
import {
    authorizationCodeSpent,
    deriveAuthorizationCodeId,
} from '../api/authentication.ts';

const JTI_ORDER = generateIdentifier();
const CHAIN_ORDER = generateIdentifier();
const TOK_ORDER = generateIdentifier();
const JTI_G4 = generateIdentifier();
const CHAIN_G4 = generateIdentifier();
const JTI_G4_SYNTH = generateIdentifier();
const CHAIN_G4_SYNTH = generateIdentifier();
const TOK_G4 = generateIdentifier();
const JTI_W3 = generateIdentifier();
const CHAIN_W3 = generateIdentifier();
const JTI_W1 = generateIdentifier();
const CHAIN_W = generateIdentifier();
const TOK_W1 = generateIdentifier();
const TOK_W2 = generateIdentifier();
const TOK_W3 = generateIdentifier();
const TOK_TX1 = generateIdentifier();
const TOK_TX2 = generateIdentifier();
const JTI_TX = generateIdentifier();
const CHAIN_TX = generateIdentifier();
const GHOST_JTI = generateIdentifier();
const JTI_OMIT = generateIdentifier();
const CHAIN_OMIT = generateIdentifier();
const JTI_FLAT = generateIdentifier();
const CHAIN_FLAT = generateIdentifier();

// Phase 13 Task 6/7 shipped two ledger-derived reads that replace
// row-plane lookups on Commandment II hot paths: the by-jti fold
// (deriveIdentityTokenEventsForJti, tokenRevocationReason's
// SECOND read) and the code-spend guard (authorizationCodeSpent,
// grantAuthorizationCode's PRE-tx fast-fail + IN-TX re-check).
// Both run PRE-TX AND IN-TX (Task 9a re-anchors the IN-TX legs
// onto the SAME derivations) — the pre-tx-vs-in-tx PARITY legs
// below prove the two call sites see identical results (the
// membershipExistsFor precedent).
//
// Task 9 retires the identity_tokens/authorization_codes ROW
// PLANE entirely (nothing has read either row-plane table since
// Tasks 6/7's own flips), so the row-plane-vs-derived-plane
// drift gate this file used to carry (comparing the derivation
// against a live db.identityTokens.getAll() oracle) retires with
// it. The wire-format proofs that oracle served survive here,
// re-anchored onto a LITERAL expected reconstruction instead —
// PUT/GET identity-tokens' row-write sweep is covered by
// tests/api-shadow-ledger-tokens.test.ts and tests/api-identity-
// token-rotation.test.ts (both re-anchored onto the derived plane
// this same task); the admin-only GET gating lives in tests/api-
// identity-spine-verb-gaps.test.ts.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-01-01T00:00:01.000000Z';

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

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function tokenGrant(
    db: DbAdapter, body: unknown,
): Promise<Response> {
    return handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    ));
}

async function s256Fields(): Promise<{
    readonly verifier: string;
    readonly code_challenge: string;
    readonly code_challenge_method: 'S256';
}> {
    const verifier = 'pkce-verifier-drift';
    return {
        verifier,
        code_challenge: bytesToBase64Url(
            await sha256Bytes(verifier),
        ),
        code_challenge_method: 'S256',
    };
}

function authorize(
    db: DbAdapter, body: unknown,
): Promise<Response> {
    return handleRequest(db, new Request(
        `${BASE}/authentication/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    ));
}

// A signed JWT's `jti` claim, read WITHOUT verification — test
// bookkeeping only (which live jti a mint just handed back), never
// a trust decision; every route under test still verifies the
// token for real.
function jtiOf(token: string): string {
    const payload = token.split('.')[1]!;
    const claims =
        JSON.parse(base64UrlDecode(payload)) as { jti: string };
    return claims.jti;
}

// -- 1: KEY ORDER — derived + stored PUT are id-LAST (G4) ------

test('KEY ORDER: the derived row is id-LAST — matching'
+ ' validateIdentityTokenEntity\'s own return-literal order',
async () => {
    const db = await freshDb();
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + TOK_ORDER, {
        jti: JTI_ORDER, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_ORDER, at: AT,
    }, DEV_TOKEN);

    const derived = await deriveIdentityToken(
        db, 'XXZruirZyAOoRpNxaDnpSA', TOK_ORDER,
    );
    const expectedOrder = [
        'jti', 'identity_id', 'action', 'chain_id', 'at', 'id',
    ];
    assert.deepEqual(Object.keys(derived), expectedOrder);
});

// G4: stored PUT = identityTokenEntityOf (id-last). GET wins.
// The id-first writer pin is deleted — writer matches GET.
test('stored PUT body equals identityTokenEntityOf id-last',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const fields = {
        jti: JTI_G4, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_G4, at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + id,
        DEV_TOKEN, fields,
    ));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', id,
        ),
    );
    const expected = identityTokenEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: fields,
    });
    assert.equal(Object.keys(expected).at(-1), 'id');
    assert.deepEqual(stored, expected);
    const derived = await deriveIdentityToken(
        db, 'XXZruirZyAOoRpNxaDnpSA', id,
    );
    assert.deepEqual(stored, derived);
    const wire = await put.json();
    assert.deepEqual(stored, wire);
});

test('formTokenEventMessagePair stored body equals '
+ 'identityTokenEntityOf id-last', async () => {
    const id = generateIdentifier();
    const event = {
        jti: JTI_G4_SYNTH, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued' as const,
        chain_id: CHAIN_G4_SYNTH, at: AT,
    };
    const messagePair = await formTokenEventMessagePair(
        id, event, TEST_OPERATION_ID,
    );
    const stored = JSON.parse(
        storedMessageBodyText(messagePair.responseMessage),
    );
    const expected = identityTokenEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: event,
    });
    assert.equal(Object.keys(expected).at(-1), 'id');
    assert.deepEqual(stored, expected);
});

// Writer matches GET: successBody is identityTokenEntityOf
// (id-last). The id-first pin is deleted.
test('identities/:id/tokens/:tid successBody is id-last',
() => {
    const entry =
        WRITE_RESPONSE_SPECS['identities/:id/tokens/:tid'];
    assert.ok(entry !== undefined && 'successBody' in entry);
    const body = entry.successBody!(
        ['XXZruirZyAOoRpNxaDnpSA', TOK_G4],
        {
            jti: JTI_G4, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_G4, at: AT,
        },
        'XXZruirZyAOoRpNxaDnpSA',
        undefined,
    ) as { id: string };
    assert.equal(Object.keys(body).at(-1), 'id');
    assert.equal(body.id, TOK_G4);
});

// -- 2: GET wire byte-parity — the ACTUAL flipped route against --
// -- a LITERAL id-LAST reconstruction of what was PUT: -----------
// -- byIdAscending collection order, and the 404 body -------------

test('GET /identities/:id/tokens + /:tid are wire'
+ ' byte-identical to a literal id-LAST reconstruction of'
+ ' what was PUT: byIdAscending collection order and the'
+ ' 404 body',
async () => {
    const db = await freshDb();
    // Inserted in NON-lex order (w3, then xdaJyuuPyHfffCGLhqDrOQ, then w2) so
    // the
    // memory backend's own insertion order and the derivation's
    // byIdAscending order genuinely diverge — a test that
    // inserted in lex order already would pass by ACCIDENT of
    // insertion order, never by the property it claims to prove.
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + TOK_W3, {
        jti: JTI_W3, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_W3, at: AT,
    }, DEV_TOKEN);
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + TOK_W1, {
        jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_W, at: AT,
    }, DEV_TOKEN);
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + TOK_W2, {
        jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'rotated', chain_id: CHAIN_W, at: AT2,
    }, DEV_TOKEN);

    // The literal id-LAST reconstruction of each PUT body,
    // identifier order (byIdAscending — the derivation's
    // own order, never the backend's) — the expected wire
    // text, independent of any stored row.
    const expected = [
        {
            jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_W, at: AT,
            id: TOK_W1,
        },
        {
            jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'rotated', chain_id: CHAIN_W, at: AT2,
            id: TOK_W2,
        },
        {
            jti: JTI_W3, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_W3, at: AT,
            id: TOK_W3,
        },
    ].sort((a, b) => compareIdentifiers(a.id, b.id));

    const collectionRes = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', DEV_TOKEN,
        ),
    );
    assert.equal(collectionRes.status, 200);
    assert.equal(
        await collectionRes.text(), JSON.stringify(expected),
    );

    for (const row of expected) {
        const singleRes = await handleRequest(db, req(
            'GET',
            '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + row.id,
            DEV_TOKEN,
        ));
        assert.equal(singleRes.status, 200);
        assert.equal(
            await singleRes.text(), JSON.stringify(row),
        );
    }

    const missingRes = await handleRequest(db, req(
        'GET',
        '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/oSBUDvuXylWVkqvrVHkJtA',
        DEV_TOKEN,
    ));
    assert.equal(missingRes.status, 404);
    const missingBody =
        await missingRes.json() as { error: string };
    assert.equal(
        missingBody.error,
        'Not found: identity_tokens/oSBUDvuXylWVkqvrVHkJtA',
    );
});

// -- 3: deriveIdentityTokenEventsForJti — pre-tx vs in-tx -------
// -- PARITY (the membershipExistsFor precedent, api/derive- -----
// -- memberships.ts's own leg-5 shape) -------------------------------

test('deriveIdentityTokenEventsForJti: byte-identical pre-tx'
+ ' (the plain adapter) vs in-tx (an open db.transaction view'
+ ' sharing rotateRefreshJti/revokeTokenChain\'s own table'
+ ' list) — the membershipExistsFor precedent', async () => {
    const db = await freshDb();
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + TOK_TX1, {
        jti: JTI_TX, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_TX, at: AT,
    }, DEV_TOKEN);
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + TOK_TX2, {
        jti: JTI_TX, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'rotated', chain_id: CHAIN_TX, at: AT2,
    }, DEV_TOKEN);

    const tokenTxTables = MESSAGE_TABLES;

    const preTx =
        await deriveIdentityTokenEventsForJti(db, JTI_TX);
    const inTx = await db.transaction(
        tokenTxTables,
        (view) =>
            deriveIdentityTokenEventsForJti(view, JTI_TX),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx.length, 2);

    const preTxMissing =
        await deriveIdentityTokenEventsForJti(db, GHOST_JTI);
    const inTxMissing = await db.transaction(
        tokenTxTables,
        (view) =>
            deriveIdentityTokenEventsForJti(view, GHOST_JTI),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});

// -- 4: THE SECURITY PIN — mint via a real grant, revoke the ----
// -- chain, the Bearer gate 401s on the DERIVED plane -----------
// -- (live-minted end-to-end; the fail-open hazard's regression --
// -- guard) -----------------------------------------------------------

const PASSWORD = 's3cret';

test('SECURITY NAMED COVENANT: a revoked chain\'s ACCESS'
+ ' token still passes the gate until exp; its REFRESH'
+ ' grant is 401ed (per-request revocation retired;'
+ ' mint-path checks remain)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedIdentityPii(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Security Pin', email: 'security-pin@example.com',
        phone: '', bio: '',
    });
    await seedIdentityCredential(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'cred-security-pin', {
            identity_id: 'XXZruirZyAOoRpNxaDnpSA', kind: 'password',
            status: 'set', secret: await testHashPassword(PASSWORD),
            at: AT,
        },
    );

    const pkce = await s256Fields();
    const authorizeRes = await authorize(db, {
        method: 'password', username: 'security-pin@example.com',
        password: PASSWORD, client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    });
    assert.equal(authorizeRes.status, 201);
    const { code } = await authorizeRes.json() as { code: string };
    const grantRes = await tokenGrant(db, {
        grant_type: 'authorization_code', code,
        client_id: 'web',
        code_verifier: pkce.verifier,
    });
    assert.equal(grantRes.status, 201);
    const { access_token: accessToken } =
        await grantRes.json() as { access_token: string };
    const refreshToken = refreshTokenFromSetCookie(grantRes);
    const rootJti = jtiOf(refreshToken);

    // Live BEFORE revocation: access token reaches admin route.
    const before = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', accessToken,
        ),
    );
    assert.equal(before.status, 200);

    // Revoke the whole chain.
    const revokeRes = await handleRequest(db, req(
        'POST',
        `/identities/XXZruirZyAOoRpNxaDnpSA/tokens/${rootJti}/revocation`,
        accessToken, {},
    ));
    assert.equal(revokeRes.status, 201);

    // ACCESS still passes the gate (≤15-min staleness covenant).
    const afterAccess = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', accessToken,
        ),
    );
    assert.equal(afterAccess.status, 200);

    // REFRESH grant is denied at mint path.
    const refreshRes = await tokenGrant(db, {
        grant_type: 'refresh',
        refresh_token: refreshToken,
    });
    assert.equal(refreshRes.status, 401);
});

// -- 5: GATE 3 (Phase 13 Task 7) — the code-spend guard's -------
// -- pre-tx-vs-in-tx PARITY ------------------------------------------

const CODE_PASSWORD = 's3cret-gate3';
const CODE_EMAIL = 'gate3-code@example.com';

async function dbWithCodeLoginUser(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedIdentityPii(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Gate 3', email: CODE_EMAIL,
        phone: '', bio: '',
    });
    await seedIdentityCredential(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'cred-gate3', {
            identity_id: 'XXZruirZyAOoRpNxaDnpSA', kind: 'password',
            status: 'set',
            secret: await testHashPassword(CODE_PASSWORD),
            at: AT,
        },
    );
    return db;
}

test('authorizationCodeSpent: byte-identical pre-tx (the plain'
+ ' adapter) vs in-tx (an open db.transaction view sharing'
+ ' grantAuthorizationCode\'s own table list) — the'
+ ' membershipExistsFor / deriveIdentityTokenEventsForJti'
+ ' precedent', async () => {
    const db = await dbWithCodeLoginUser();
    const pkce = await s256Fields();
    const authorizeRes = await authorize(db, {
        method: 'password', username: CODE_EMAIL,
        password: CODE_PASSWORD, client_id: 'web',
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method,
    });
    assert.equal(authorizeRes.status, 201);
    const { code } = await authorizeRes.json() as { code: string };
    const derivedId = await deriveAuthorizationCodeId(code);

    const grantTxTables = MESSAGE_TABLES;

    const preTxBefore = await authorizationCodeSpent(
        db, derivedId, 'XXZruirZyAOoRpNxaDnpSA',
    );
    const inTxBefore = await db.transaction(
        grantTxTables,
        (view) => authorizationCodeSpent(
            view, derivedId, 'XXZruirZyAOoRpNxaDnpSA',
        ),
    );
    assert.equal(inTxBefore, preTxBefore);
    assert.equal(preTxBefore, false);

    const grantRes = await tokenGrant(db, {
        grant_type: 'authorization_code', code,
        client_id: 'web',
        code_verifier: pkce.verifier,
    });
    assert.equal(grantRes.status, 201);

    const preTxAfter = await authorizationCodeSpent(
        db, derivedId, 'XXZruirZyAOoRpNxaDnpSA',
    );
    const inTxAfter = await db.transaction(
        grantTxTables,
        (view) => authorizationCodeSpent(
            view, derivedId, 'XXZruirZyAOoRpNxaDnpSA',
        ),
    );
    assert.equal(inTxAfter, preTxAfter);
    assert.equal(preTxAfter, true);
});

// -- 6: NESTED WIRE — collection under the identity; flat
// -- prefix RETIRED; omit-PUT stamps identity_id from path ----

test('GET /identities/XXZruirZyAOoRpNxaDnpSA/tokens is a 200 array',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            , DEV_TOKEN),
    );
    assert.equal(res.status, 200);
    const rows = await res.json() as unknown;
    assert.ok(Array.isArray(rows));
});

test('GET /identity-tokens is retired (router 404)',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, req('GET', '/identity-tokens', DEV_TOKEN),
    );
    assert.equal(res.status, 404);
});

test('GET stamps identity_id from the path when PUT omits it',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const withoutIdentity = {
        jti: JTI_OMIT, action: 'issued',
        chain_id: CHAIN_OMIT, at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + id,
        DEV_TOKEN, withoutIdentity,
    ));
    assert.ok(put.status === 200 || put.status === 201);
    const list = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            , DEV_TOKEN),
    );
    assert.equal(list.status, 200);
    const rows = await list.json() as readonly {
        readonly id: string;
        readonly identity_id: string;
    }[];
    const row = rows.find(r => r.id === id);
    assert.ok(row, 'omitted-id event is in the collection');
    assert.equal(row.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    const leaf = await handleRequest(db, req(
        'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + id, DEV_TOKEN,
    ));
    assert.equal(leaf.status, 200);
    const one = await leaf.json() as {
        readonly identity_id: string;
    };
    assert.equal(one.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
});

test('GET /identities/:id/tokens dual-reads leftover flat',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const fields = {
        jti: JTI_FLAT, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_FLAT, at: AT,
    };
    const flatPair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/identity-tokens/' + id,
        routePattern: 'identity-tokens/:id',
        routeSegments: ['identity-tokens', ':id'],
        pathSegments: ['identity-tokens', id],
        headerFields: [],
        body: fields,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT,
        organization: undefined,
        responseStatus: 200,
        responseBody: identityTokenEntityOf({
            uriId: id,
            messagePairId: id,
            method: 'PUT',
            body: fields,
        }),
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            await appendMessagePair(view, flatPair);
        },
    );
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            , DEV_TOKEN),
    );
    assert.equal(res.status, 200);
    const rows = await res.json() as readonly {
        readonly id: string;
        readonly identity_id: string;
    }[];
    const row = rows.find(r => r.id === id);
    assert.ok(row, 'leftover flat event is in the collection');
    assert.equal(row.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
});
