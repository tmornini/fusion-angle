import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest, PUT } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import { base64UrlDecode } from '../shared/base64url.ts';
import { hashPassword } from '../shared/password-hash.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    seedIdentityPii,
    seedIdentityCredential,
} from './identity-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    deriveIdentityToken,
    deriveIdentityTokenEventsForJti,
} from '../api/derive-identity-tokens.ts';
import {
    authorizationCodeSpent,
    deriveAuthorizationCodeId,
} from '../api/authentication.ts';

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
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
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

// -- 1: THE KEY-ORDER PROOF + the negative counter-example -----
// -- (self-contained: no row-plane oracle) ---------------------

test('KEY ORDER: the derived row is id-LAST — matching'
+ ' validateIdentityTokenEntity\'s own return-literal order —'
+ ' never the id-FIRST spread WRITE_RESPONSE_SPECS forms for the'
+ ' ledger\'s STORED RESPONSE message (the negative'
+ ' counter-example)', async () => {
    const db = await freshDb();
    await PUT(db, 'identity-tokens/tok-order', {
        jti: 'jti-order', identity_id: 'current',
        action: 'issued', chain_id: 'chain-order', at: AT,
    }, DEV_TOKEN);

    const derived = await deriveIdentityToken(db, 'tok-order');
    const expectedOrder = [
        'jti', 'identity_id', 'action', 'chain_id', 'at', 'id',
    ];
    assert.deepEqual(Object.keys(derived), expectedOrder);

    // The id-FIRST spread api/routes.ts's WRITE_RESPONSE_SPECS
    // ['identity-tokens/:id'].successBody literally forms for the
    // ledger's STORED RESPONSE message — same field VALUES
    // (deepEqual holds) but NOT the same bytes (JSON.stringify
    // preserves insertion order; `id` leads here instead of
    // trailing).
    const idFirst = {
        id: derived.id,
        jti: derived.jti,
        identity_id: derived.identity_id,
        action: derived.action,
        chain_id: derived.chain_id,
        at: derived.at,
    };
    assert.deepEqual(idFirst, derived);
    assert.notEqual(
        JSON.stringify(idFirst), JSON.stringify(derived),
    );
});

// -- 2: GET wire byte-parity — the ACTUAL flipped route against --
// -- a LITERAL id-LAST reconstruction of what was PUT: -----------
// -- byIdAscending collection order, and the 404 body -------------

test('GET /identity-tokens + /:id are wire byte-identical to a'
+ ' literal id-LAST reconstruction of what was PUT:'
+ ' byIdAscending collection order and the 404 body',
async () => {
    const db = await freshDb();
    // Inserted in NON-lex order (w3, then w1, then w2) so the
    // memory backend's own insertion order and the derivation's
    // byIdAscending order genuinely diverge — a test that
    // inserted in lex order already would pass by ACCIDENT of
    // insertion order, never by the property it claims to prove.
    await PUT(db, 'identity-tokens/tok-w3', {
        jti: 'jti-w3', identity_id: 'current',
        action: 'issued', chain_id: 'chain-w3', at: AT,
    }, DEV_TOKEN);
    await PUT(db, 'identity-tokens/tok-w1', {
        jti: 'jti-w1', identity_id: 'current',
        action: 'issued', chain_id: 'chain-w', at: AT,
    }, DEV_TOKEN);
    await PUT(db, 'identity-tokens/tok-w2', {
        jti: 'jti-w1', identity_id: 'current',
        action: 'rotated', chain_id: 'chain-w', at: AT2,
    }, DEV_TOKEN);

    // The literal id-LAST reconstruction of each PUT body,
    // id-lex sorted (byIdAscending, == IndexedDB's own
    // production getAll order) — the expected wire text,
    // independent of any stored row.
    const expected = [
        {
            jti: 'jti-w1', identity_id: 'current',
            action: 'issued', chain_id: 'chain-w', at: AT,
            id: 'tok-w1',
        },
        {
            jti: 'jti-w1', identity_id: 'current',
            action: 'rotated', chain_id: 'chain-w', at: AT2,
            id: 'tok-w2',
        },
        {
            jti: 'jti-w3', identity_id: 'current',
            action: 'issued', chain_id: 'chain-w3', at: AT,
            id: 'tok-w3',
        },
    ];

    const collectionRes = await handleRequest(
        db, req('GET', '/identity-tokens', DEV_TOKEN),
    );
    assert.equal(collectionRes.status, 200);
    assert.equal(
        await collectionRes.text(), JSON.stringify(expected),
    );

    for (const row of expected) {
        const singleRes = await handleRequest(db, req(
            'GET', '/identity-tokens/' + row.id, DEV_TOKEN,
        ));
        assert.equal(singleRes.status, 200);
        assert.equal(
            await singleRes.text(), JSON.stringify(row),
        );
    }

    const missingRes = await handleRequest(db, req(
        'GET', '/identity-tokens/no-such-token', DEV_TOKEN,
    ));
    assert.equal(missingRes.status, 404);
    const missingBody =
        await missingRes.json() as { error: string };
    assert.equal(
        missingBody.error,
        'Not found: identity_tokens/no-such-token',
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
    await PUT(db, 'identity-tokens/tok-tx1', {
        jti: 'jti-tx', identity_id: 'current',
        action: 'issued', chain_id: 'chain-tx', at: AT,
    }, DEV_TOKEN);
    await PUT(db, 'identity-tokens/tok-tx2', {
        jti: 'jti-tx', identity_id: 'current',
        action: 'rotated', chain_id: 'chain-tx', at: AT2,
    }, DEV_TOKEN);

    const tokenTxTables = ['requests', 'responses'];

    const preTx =
        await deriveIdentityTokenEventsForJti(db, 'jti-tx');
    const inTx = await db.transaction(
        tokenTxTables,
        (view) =>
            deriveIdentityTokenEventsForJti(view, 'jti-tx'),
    );
    assert.deepEqual(inTx, preTx);
    assert.equal(preTx.length, 2);

    const preTxMissing =
        await deriveIdentityTokenEventsForJti(db, 'ghost-jti');
    const inTxMissing = await db.transaction(
        tokenTxTables,
        (view) =>
            deriveIdentityTokenEventsForJti(view, 'ghost-jti'),
    );
    assert.deepEqual(inTxMissing, preTxMissing);
    assert.deepEqual(preTxMissing, []);
});

// -- 4: THE SECURITY PIN — mint via a real grant, revoke the ----
// -- chain, the Bearer gate 401s on the DERIVED plane -----------
// -- (live-minted end-to-end; the fail-open hazard's regression --
// -- guard) -----------------------------------------------------------

const PASSWORD = 's3cret';

test('SECURITY: a session minted via a real grant is admitted'
+ ' by the Bearer gate; once its chain is revoked, the SAME'
+ ' refresh token — presented live, through authenticateRequest'
+ ' — is 401ed by tokenRevocationReason\'s by-jti fold, now'
+ ' running against the DERIVED plane (isTokenRevoked treats an'
+ ' unknown jti as NOT revoked, so a derivation miss here would'
+ ' fail OPEN)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedIdentityPii(db, 'current', {
        name: 'Security Pin', email: 'security-pin@example.com',
        phone: '', bio: '',
    });
    await seedIdentityCredential(
        db, 'current', 'cred-security-pin', {
            identity_id: 'current', kind: 'password',
            status: 'set', secret: await hashPassword(PASSWORD),
            at: AT,
        },
    );

    const authorizeRes = await authorize(db, {
        method: 'password', username: 'security-pin@example.com',
        password: PASSWORD, client_id: 'web',
    });
    assert.equal(authorizeRes.status, 200);
    const { code } = await authorizeRes.json() as { code: string };
    const grantRes = await tokenGrant(db, {
        grant_type: 'authorization_code', code,
        client_id: 'web',
    });
    assert.equal(grantRes.status, 200);
    const { refresh_token: refreshToken } =
        await grantRes.json() as { refresh_token: string };
    const rootJti = jtiOf(refreshToken);

    // Live BEFORE revocation: the refresh token itself, presented
    // as a Bearer through the REAL gate (authenticateRequest),
    // reaches an admin-only route.
    const before = await handleRequest(
        db, req('GET', '/identity-tokens', refreshToken),
    );
    assert.equal(before.status, 200);

    // Revoke the whole chain — any member-tier bearer may POST
    // the rotation/revocation sub-routes (MEMBER_VERBS
    // '/identity-tokens': ['POST']).
    const revokeRes = await handleRequest(db, req(
        'POST', `/identity-tokens/${rootJti}/revocation`,
        DEV_TOKEN, {},
    ));
    assert.equal(revokeRes.status, 204);

    // The SAME refresh token, re-presented: the gate denies it,
    // live end-to-end, on the DERIVED plane.
    const after = await handleRequest(
        db, req('GET', '/identity-tokens', refreshToken),
    );
    assert.equal(after.status, 401);
    const afterBody = await after.json() as { error: string };
    assert.equal(afterBody.error, 'token chain revoked');
});

// -- 5: GATE 3 (Phase 13 Task 7) — the code-spend guard's -------
// -- pre-tx-vs-in-tx PARITY ------------------------------------------

const CODE_PASSWORD = 's3cret-gate3';
const CODE_EMAIL = 'gate3-code@example.com';

async function dbWithCodeLoginUser(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedIdentityPii(db, 'current', {
        name: 'Gate 3', email: CODE_EMAIL,
        phone: '', bio: '',
    });
    await seedIdentityCredential(
        db, 'current', 'cred-gate3', {
            identity_id: 'current', kind: 'password',
            status: 'set',
            secret: await hashPassword(CODE_PASSWORD),
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
    const authorizeRes = await authorize(db, {
        method: 'password', username: CODE_EMAIL,
        password: CODE_PASSWORD, client_id: 'web',
    });
    assert.equal(authorizeRes.status, 200);
    const { code } = await authorizeRes.json() as { code: string };
    const derivedId = await deriveAuthorizationCodeId(code);

    const grantTxTables = ['requests', 'responses'];

    const preTxBefore = await authorizationCodeSpent(db, derivedId);
    const inTxBefore = await db.transaction(
        grantTxTables,
        (view) => authorizationCodeSpent(view, derivedId),
    );
    assert.equal(inTxBefore, preTxBefore);
    assert.equal(preTxBefore, false);

    const grantRes = await tokenGrant(db, {
        grant_type: 'authorization_code', code,
        client_id: 'web',
    });
    assert.equal(grantRes.status, 200);

    const preTxAfter = await authorizationCodeSpent(db, derivedId);
    const inTxAfter = await db.transaction(
        grantTxTables,
        (view) => authorizationCodeSpent(view, derivedId),
    );
    assert.equal(inTxAfter, preTxAfter);
    assert.equal(preTxAfter, true);
});
