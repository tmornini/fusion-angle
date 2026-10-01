import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { PUT } from './in-page-facade.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    base64UrlDecode,
    bytesToBase64Url,
} from '../shared/base64url.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { testHashPassword } from './mock-seed.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    seedPersonIdentity,
    seedIdentityCredential,
} from './identity-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    apiRequest,
    storedMessageBodyText,
    storedPutBodyText,
    refreshTokenFromSetCookie,
    framedRequest,
    presentedFields,
    withoutCredentialFields,
} from './http-fixtures.ts';
import {
    deriveIdentityToken,
    identityTokenEntityOf,
    tokenHeadFor,
} from '../api/derive-identity-tokens.ts';
import { formStateWrite } from '../api/message-pair.ts';
import { WRITE_RESPONSE_SPECS } from '../api/routes.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


const JTI_ORDER = generateIdentifier();
const CHAIN_ORDER = generateIdentifier();
const JTI_G4 = generateIdentifier();
const CHAIN_G4 = generateIdentifier();
const JTI_G4_SYNTH = generateIdentifier();
const CHAIN_G4_SYNTH = generateIdentifier();
const JTI_W3 = generateIdentifier();
const CHAIN_W3 = generateIdentifier();
const JTI_W1 = generateIdentifier();
const CHAIN_W = generateIdentifier();
const JTI_W2 = generateIdentifier();
const CHAIN_W2 = generateIdentifier();
const JTI_TX = generateIdentifier();
const CHAIN_TX = generateIdentifier();
const GHOST_JTI = generateIdentifier();
const JTI_OMIT = generateIdentifier();
const CHAIN_OMIT = generateIdentifier();

// The jti's head (tokenHeadFor, tokenRevocationReason's
// second read) is its whole state. One head per jti: the
// issued event is named by its jti.

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
    const record = body !== null
        && typeof body === 'object'
        && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    const lifted = withoutCredentialFields(record);
    const raw = JSON.stringify(lifted.body);
    return handleRequest(db, framedRequest(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...lifted.headers,
            },
            body: raw,
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
    const record = body !== null
        && typeof body === 'object'
        && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    const lifted = withoutCredentialFields(record);
    const raw = JSON.stringify(lifted.body);
    return handleRequest(db, framedRequest(
        `${BASE}/authentication/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...lifted.headers,
            },
            body: raw,
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

// -- 1: KEY ORDER — derived + stored PUT are id-FIRST (G4) -----

Deno.test('KEY ORDER: the derived row is id-FIRST — matching'
+ ' validateIdentityTokenEntity\'s own return-literal order'
+ ' after it',
async () => {
    const db = await freshDb();
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_ORDER, {
        jti: JTI_ORDER, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_ORDER, at: AT,
    }, DEV_TOKEN,
        operationIdHeader());

    const derived = await deriveIdentityToken(
        db, 'XXZruirZyAOoRpNxaDnpSA', JTI_ORDER,
    );
    const expectedOrder = [
        'id', 'jti', 'identity_id', 'action', 'chain_id', 'at',
    ];
    assertEquals(Object.keys(derived), expectedOrder);
});

// G4: stored PUT = identityTokenEntityOf (id-first). GET wins.
// The id-last writer pin is deleted — writer matches GET.
Deno.test('stored PUT body equals identityTokenEntityOf id-first',
async () => {
    const db = await freshDb();
    const fields = {
        jti: JTI_G4, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_G4, at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + JTI_G4,
        DEV_TOKEN, fields,
    ));
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', JTI_G4,
        ),
    );
    const expected = identityTokenEntityOf({
        name: JTI_G4,
        messagePairId: JTI_G4,
        method: 'PUT',
        body: fields,
    });
    assertStrictEquals(Object.keys(expected).at(0), 'id');
    assertEquals(stored, expected);
    const derived = await deriveIdentityToken(
        db, 'XXZruirZyAOoRpNxaDnpSA', JTI_G4,
    );
    assertEquals(stored, derived);
    const wire = await put.json();
    assertEquals(stored, wire);
});

Deno.test('a token event\'s stored body equals '
+ 'identityTokenEntityOf id-first', async () => {
    const event = {
        jti: JTI_G4_SYNTH, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued' as const,
        chain_id: CHAIN_G4_SYNTH, at: AT,
    };
    const formed = await formStateWrite({
        kind: 'events',
        context: {
            operationId: generateIdentifier(),
            requestId: generateIdentifier(),
            requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
            requestAt: AT,
        },
        siblings: [{
            method: 'PUT',
            path: '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/',
            name: JTI_G4_SYNTH,
            state: { id: JTI_G4_SYNTH, ...event },
            condition: { kind: 'genesis', declarer: 'handler' },
        }],
    });
    const row = formed.rows[0];
    assert(row !== undefined && 'responseMessage' in row);
    const stored = JSON.parse(
        storedMessageBodyText(row.responseMessage),
    );
    const expected = identityTokenEntityOf({
        name: JTI_G4_SYNTH,
        messagePairId: JTI_G4_SYNTH,
        method: 'PUT',
        body: event,
    });
    assertStrictEquals(Object.keys(expected).at(0), 'id');
    assertEquals(stored, expected);
});

// Writer matches GET: successBody is identityTokenEntityOf
// (id-first). The id-last pin is deleted.
Deno.test('identities/:id/tokens/:jti successBody is id-first',
() => {
    const entry =
        WRITE_RESPONSE_SPECS['identities/:id/tokens/:jti'];
    assert(entry !== undefined && 'successBody' in entry);
    const body = entry.successBody!(
        ['XXZruirZyAOoRpNxaDnpSA', JTI_G4],
        {
            jti: JTI_G4, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_G4, at: AT,
        },
        'XXZruirZyAOoRpNxaDnpSA',
        undefined,
    ) as { id: string };
    assertStrictEquals(Object.keys(body).at(0), 'id');
    assertStrictEquals(body.id, JTI_G4);
});

// -- 2: GET wire byte-parity — the ACTUAL flipped route against --
// -- a LITERAL id-FIRST reconstruction of what was PUT: ----------
// -- byIdAscending collection order, and the 404 body -------------

Deno.test('GET /identities/:id/tokens/:jti serves each jti\'s'
+ ' stored head; byIdAscending collection order and the'
+ ' 404 body',
async () => {
    const db = await freshDb();
    // THREE distinct jti documents, so byIdAscending genuinely
    // ORDERS the collection: with two names, insertion order is
    // already the sorted order half the time, and the test would
    // pass by coin flip rather than by the property it claims to
    // prove. The last PUT revisits the w1 jti's OWN document, so
    // the collection returns its 'rotated' HEAD.
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_W3, {
        jti: JTI_W3, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_W3, at: AT,
    }, DEV_TOKEN,
        operationIdHeader());
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_W1, {
        jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_W, at: AT,
    }, DEV_TOKEN,
        operationIdHeader());
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_W2, {
        jti: JTI_W2, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_W2, at: AT,
    }, DEV_TOKEN,
        operationIdHeader());
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_W1, {
        jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'rotated', chain_id: CHAIN_W, at: AT2,
    }, DEV_TOKEN,
        operationIdHeader());

    // The literal id-FIRST reconstruction of each document's
    // HEAD body, identifier order (byIdAscending — the
    // derivation's own order, never the backend's) — the
    // expected wire text, independent of any stored row.
    const expected = [
        {
            id: JTI_W1,
            jti: JTI_W1, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'rotated', chain_id: CHAIN_W, at: AT2,
        },
        {
            id: JTI_W2,
            jti: JTI_W2, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_W2, at: AT,
        },
        {
            id: JTI_W3,
            jti: JTI_W3, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_W3, at: AT,
        },
    ].sort((a, b) => compareIdentifiers(a.id, b.id));

    const collectionRes = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', DEV_TOKEN,
        ),
    );
    assertStrictEquals(collectionRes.status, 200);
    assertStrictEquals(
        await collectionRes.text(), JSON.stringify(expected),
    );

    for (const row of expected) {
        const singleRes = await handleRequest(db, req(
            'GET',
            '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + row.id,
            DEV_TOKEN,
        ));
        assertStrictEquals(singleRes.status, 200);
        assertStrictEquals(
            await singleRes.text(),
            await storedPutBodyText(
                db,
                '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/',
                row.id,
            ),
        );
    }

    const missingRes = await handleRequest(db, req(
        'GET',
        '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/oSBUDvuXylWVkqvrVHkJtA',
        DEV_TOKEN,
    ));
    assertStrictEquals(missingRes.status, 404);
    const missingBody =
        await missingRes.json() as { error: string };
    assertStrictEquals(
        missingBody.error,
        'Not found: identity_tokens/oSBUDvuXylWVkqvrVHkJtA',
    );
});

// -- 3: tokenHeadFor — pre-tx vs in-tx -------------------------
// -- PARITY (the membershipExistsFor precedent, api/derive- -----
// -- memberships.ts's own leg-5 shape) -------------------------------

Deno.test('tokenHeadFor: the later event is the head, identical'
+ ' pre-tx (the plain adapter) vs in-tx (an open db.transaction view'
+ ' sharing rotateRefreshJti/revokeTokenChain\'s own table'
+ ' list) — the membershipExistsFor precedent', async () => {
    const db = await freshDb();
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_TX, {
        jti: JTI_TX, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: CHAIN_TX, at: AT,
    }, DEV_TOKEN,
        operationIdHeader());
    await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
        + JTI_TX, {
        jti: JTI_TX, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'rotated', chain_id: CHAIN_TX, at: AT2,
    }, DEV_TOKEN,
        operationIdHeader());

    const preTx = await tokenHeadFor(
        db, 'XXZruirZyAOoRpNxaDnpSA', JTI_TX,
    );
    const inTx = await db.readTransaction(
        (view) => tokenHeadFor(
            view, 'XXZruirZyAOoRpNxaDnpSA', JTI_TX,
        ),
    );
    assertEquals(inTx, preTx);
    assert(preTx !== null);
    assertStrictEquals(preTx.entity.action, 'rotated');
    assertStrictEquals(preTx.entity.at, AT2);

    const preTxMissing = await tokenHeadFor(
        db, 'XXZruirZyAOoRpNxaDnpSA', GHOST_JTI,
    );
    const inTxMissing = await db.readTransaction(
        (view) => tokenHeadFor(
            view, 'XXZruirZyAOoRpNxaDnpSA', GHOST_JTI,
        ),
    );
    assertEquals(inTxMissing, preTxMissing);
    assertStrictEquals(preTxMissing, null);
});

// -- 4: THE SECURITY PIN — mint via a real grant, revoke the ----
// -- chain, the Bearer gate 401s on the DERIVED plane -----------
// -- (live-minted end-to-end; the fail-open hazard's regression --
// -- guard) -----------------------------------------------------------

const PASSWORD = 's3cret';

Deno.test('SECURITY NAMED COVENANT: a revoked chain\'s ACCESS'
+ ' token still passes the gate until exp; its REFRESH'
+ ' grant is 401ed (per-request revocation retired;'
+ ' mint-path checks remain)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedPersonIdentity(db, 'XXZruirZyAOoRpNxaDnpSA', {
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
    assertStrictEquals(authorizeRes.status, 200);
    const { code } = await presentedFields(authorizeRes) as {
        code: string;
    };
    const grantRes = await tokenGrant(db, {
        grant_type: 'authorization_code', code,
        client_id: 'web',
        code_verifier: pkce.verifier,
    });
    assertStrictEquals(grantRes.status, 200);
    const { access_token: accessToken } =
        await presentedFields(grantRes) as {
            access_token: string;
        };
    const refreshToken = refreshTokenFromSetCookie(grantRes);
    const rootJti = jtiOf(refreshToken);

    // Live BEFORE revocation: access token reaches admin route.
    const before = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', accessToken,
        ),
    );
    assertStrictEquals(before.status, 200);

    // Revoke the whole chain.
    const revokeRes = await handleRequest(db, req(
        'POST',
        `/identities/XXZruirZyAOoRpNxaDnpSA/tokens/${rootJti}/revocation`,
        accessToken, {},
    ));
    assertStrictEquals(revokeRes.status, 200);

    // ACCESS still passes the gate (≤15-min staleness covenant).
    const afterAccess = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', accessToken,
        ),
    );
    assertStrictEquals(afterAccess.status, 200);

    // REFRESH grant is denied at mint path.
    const refreshRes = await tokenGrant(db, {
        grant_type: 'refresh',
        refresh_token: refreshToken,
    });
    assertStrictEquals(refreshRes.status, 401);
});

// -- 6: NESTED WIRE — collection under the identity; flat
// -- prefix RETIRED; omit-PUT stamps identity_id from path ----

Deno.test('GET /identities/XXZruirZyAOoRpNxaDnpSA/tokens is a 200 array',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            , DEV_TOKEN),
    );
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as unknown;
    assert(Array.isArray(rows));
});

Deno.test('GET /identity-tokens is retired (router 404)',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, req('GET', '/identity-tokens', DEV_TOKEN),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET stamps identity_id from the path when PUT omits it',
async () => {
    const db = await freshDb();
    const withoutIdentity = {
        jti: JTI_OMIT, action: 'issued',
        chain_id: CHAIN_OMIT, at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + JTI_OMIT,
        DEV_TOKEN, withoutIdentity,
    ));
    assert(put.status === 200 || put.status === 201);
    const list = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            , DEV_TOKEN),
    );
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as readonly {
        readonly id: string;
        readonly identity_id: string;
    }[];
    const row = rows.find(r => r.id === JTI_OMIT);
    assert(row, 'omitted-id event is in the collection');
    assertStrictEquals(row.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    const leaf = await handleRequest(db, req(
        'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + JTI_OMIT,
        DEV_TOKEN,
    ));
    assertStrictEquals(leaf.status, 200);
    const one = await leaf.json() as {
        readonly identity_id: string;
    };
    assertStrictEquals(one.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('a PUT whose body jti disagrees with the path is 400',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + JTI_W1,
        DEV_TOKEN,
        {
            jti: generateIdentifier(),
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_W, at: AT,
        },
    ));
    assertStrictEquals(res.status, 400);
});
