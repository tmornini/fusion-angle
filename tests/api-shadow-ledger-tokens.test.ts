import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { latestActionForJti } from '../api/identity-tokens.ts';
import {
    appendMessagePair, formAuthPair, responseFromStored,
} from '../api/message-pair.ts';
import type { AuthPairSeed } from '../api/message-pair.ts';
import {
    rotateRefreshJti,
    revokeTokenChain,
    tokenRevocationReason,
} from '../api/authentication.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    makeAssertionSigner,
} from './client-assertion-fixtures.ts';
import type { IdentityTokenEntity } from '../api/types.ts';
import {
    deriveIdentityToken,
    deriveIdentityTokens,
} from '../api/derive-identity-tokens.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ROOT_JTI = 'jti-root';

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
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = await freshDb();
    // Seeded via the PUT route (not a raw store write): Phase 13
    // Task 6 flips rotateRefreshJti/revokeTokenChain's PRE-TX
    // chain lookup onto the message ledger, so a pair-less row
    // is invisible to it — the PUT route forms both the row AND
    // its pair, the SAME mechanism a live write uses.
    await handleRequest(db, req(
        'PUT', '/identity-tokens/t-root', DEV_TOKEN, {
            jti: ROOT_JTI, identity_id: 'current',
            action: 'issued', chain_id: 'chain-1', at: AT,
        },
    ));
    return db;
}

function tokenFields(jti: string) {
    return {
        jti, identity_id: 'current', action: 'issued',
        chain_id: 'chain-x', at: AT,
    };
}

function revocationFields() {
    return { identity_id: 'current', at: AT };
}

// ── identity-tokens/:id — EVENT-APPEND (HistoryEntityStore) ──

test('PUT identity-tokens/:id appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-1', DEV_TOKEN,
        tokenFields('jti-1'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(requests[3]!.uri_prefix, '/identity-tokens/');
    assert.equal(requests[3]!.uri_id, 'tok-1');
    const domainRow = await deriveIdentityToken(db, 'tok-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('two PUTs to DIFFERENT identity-tokens/:id ids each'
+ ' form a genesis pair with no Supersedes on either — a'
+ ' ledger row is never revisited', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-2a', DEV_TOKEN,
        tokenFields('jti-2a'),
    ));
    const second = await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-2b', DEV_TOKEN,
        tokenFields('jti-2b'),
    ));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.headers.get('Supersedes'), null);
    assert.equal(second.headers.get('Supersedes'), null);
});

test('a second PUT to the SAME identity-tokens/:id id forms'
+ ' its OWN genesis pair — no Supersedes, this address never'
+ ' chains — and the DERIVED read reflects the LATEST pair at'
+ ' that address (deriveDocumentsAt\'s latest-per-uriId head'
+ ' resolution, never a ledger guard)', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-3', DEV_TOKEN,
        tokenFields('jti-3'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-3', DEV_TOKEN,
        tokenFields('jti-3-again'),
    ));
    assert.equal(second.status, 200);
    assert.notEqual(second.headers.get('Response-ID'), firstId);
    assert.equal(second.headers.get('Supersedes'), null);
    const domainRow = await deriveIdentityToken(db, 'tok-3');
    assert.equal(domainRow.jti, 'jti-3-again');
});

// ── identity-token-revocations/:id — EVENT-APPEND ──

test('PUT identity-token-revocations/:id appends its pair at'
+ ' the entity address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/rev-1', DEV_TOKEN,
        revocationFields(),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(
        requests[3]!.uri_prefix, '/identity-token-revocations/',
    );
    assert.equal(requests[3]!.uri_id, 'rev-1');
    const domainRow =
        await db.identityTokenRevocations.getById('rev-1');
    assert.deepEqual(await res.json(), domainRow);
});

// ── identity-tokens/:jti/rotation — REPLAY-EXEMPT operation
// address: the gate NEVER serves a stored response for a
// byte-identical resend of this route (message-pair.ts
// REPLAY_EXEMPT_ROUTE_PATTERNS), so a resent reuse attempt
// re-enters rotateRefreshJti's own 409 guard for real instead
// of silently replaying the first success.

test('a rotation appends its pair at an operation address:'
+ ' uriId stays empty, and the wire {jti} equals the pair\'s'
+ ' own stored response body', async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 200);
    const wireBody = await res.json() as { jti: string };
    assert.notEqual(wireBody.jti, ROOT_JTI);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === `/identity-tokens/${ROOT_JTI}/rotation/`,
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    const stored = responses.find(r => r.id === row!.id);
    assert.ok(stored);
    const storedBody = await responseFromStored(stored!).json();
    assert.deepEqual(storedBody, wireBody);
    const rows = await deriveIdentityTokens(db);
    assert.equal(
        latestActionForJti(rows, wireBody.jti), 'issued');
});

test('a byte-identical second rotation of the SAME jti still'
+ ' 409s — the domain guard, NOT a replay of the first'
+ ' success — and appends NO further OPERATION pair, though'
+ ' its replay-branch revocation DOES grow the ledger by its'
+ ' own event pairs (Phase 13 Task 5: revocationAppends is not'
+ ' idempotent, and it now carries a pair per row)',
async () => {
    const db = await seededDb();
    const first = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(first.status, 200);
    const before = (await db.requests.getAll()).length;
    // Literally byte-identical: same jti, same {} body, same
    // bearer — exactly what a resend fast path would collapse
    // for a non-exempt route.
    const second = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(second.status, 409);
    const rows = await deriveIdentityTokens(db);
    assert.equal(latestActionForJti(rows, ROOT_JTI), 'revoked');
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    // +2: the chain's two distinct jtis (the seeded root, the
    // first rotation's successor) each gain a fresh 'revoked'
    // event pair on the replay branch — NO new operation pair
    // (the rotation route's own pair only ever appends on the
    // 'rotate' branch, unchanged).
    assert.equal(requests.length, before + 2);
});

test('rotating an unknown jti is a 409 that appends nothing',
async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'POST', '/identity-tokens/ghost/rotation',
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 409);
    // 3 bootstrap + seededDb's own pair-forming PUT (Phase 13
    // Task 6's seeding re-point) = 4; the 409 itself appends
    // nothing further.
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

// ── identity-tokens/:jti/revocation — operation address ──

test('a revocation appends its pair at an operation address:'
+ ' uriId stays empty', async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/revocation`,
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === `/identity-tokens/${ROOT_JTI}/revocation/`,
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
    const rows = await deriveIdentityTokens(db);
    assert.equal(latestActionForJti(rows, ROOT_JTI), 'revoked');
});

test('revoking an unknown jti is an idempotent 2xx no-op that'
+ ' STILL appends its own pair (the claim-op precedent)',
async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'POST', '/identity-tokens/ghost/revocation',
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/identity-tokens/ghost/revocation/',
    );
    assert.ok(row);
    // The domain ledger stays untouched by the no-op — only
    // the shadow pair records that the request happened.
    const rows = await deriveIdentityTokens(db);
    assert.equal(rows.length, 1);
});

test('a repeat idempotent revocation of the same chain still'
+ ' appends its own pair (no crash, counts stay balanced)',
async () => {
    const db = await seededDb();
    const first = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/revocation`,
        DEV_TOKEN, {},
    ));
    assert.equal(first.status, 204);
    // A distinguishing body keeps this a genuinely NEW request
    // rather than the byte-identical resend covered elsewhere
    // (the route ignores the body either way).
    const second = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/revocation`,
        DEV_TOKEN, { attempt: 2 },
    ));
    assert.equal(second.status, 204);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    const rows = requests.filter(
        r => r.uri_prefix
            === `/identity-tokens/${ROOT_JTI}/revocation/`,
    );
    assert.equal(rows.length, 2);
});

test('stored messages verify against their hashes',
async () => {
    const db = await seededDb();
    await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-9', DEV_TOKEN,
        tokenFields('jti-9'),
    ));
    await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/revocation`,
        DEV_TOKEN, {},
    ));
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('request and response counts stay equal across a mix'
+ ' including one failed identity-token-revocations PUT and'
+ ' one failed (reuse) rotation', async () => {
    const db = await seededDb();
    await handleRequest(db, req(
        'PUT', '/identity-tokens/tok-10', DEV_TOKEN,
        tokenFields('jti-10'),
    ));
    await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    const reused = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(reused.status, 409);
    const failed = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/rev-fail', DEV_TOKEN,
        { identity_id: 'current' }, // missing required `at`
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});

// ── synthesized event pairs: the issued-root writers (Phase 13
// Task 5, Gate 7) — every identity_tokens row write now appends
// a matching event pair at 'identity-tokens/:id', in the SAME
// transaction as the row, distinct from whatever operation pair
// the grant's own /authentication/token request forms.

function postToken(
    db: MemoryDbAdapter, body: unknown,
): Promise<Response> {
    return handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    ));
}

// The ONE identity-token event a bare issuance grant forms has
// its own event pair at its own address — a genesis pair
// (identity-tokens/:id carries no DOCUMENT_CLASS entry, so no
// head-read ever chains it), whose stored response deep-equals
// the derived event itself.
async function assertRootEventPair(
    db: MemoryDbAdapter,
): Promise<void> {
    const rows = await deriveIdentityTokens(db);
    assert.equal(rows.length, 1);
    const root = rows[0]!;
    const requests = await db.requests.getAll();
    const eventRequest = requests.find(
        r => r.uri_prefix === '/identity-tokens/'
            && r.uri_id === root.id,
    );
    assert.ok(eventRequest, 'no event pair for the issued root');
    // requesterIdentityId is the event's OWN identity_id (the
    // affected identity) — the NAMED convention formTokenEventPair
    // implements, since no authenticated actor is in view at this
    // depth (message-pair.ts).
    assert.equal(
        eventRequest!.requester_identity_id, root.identity_id,
    );
    const responses = await db.responses.getAll();
    const eventResponse = responses.find(
        r => r.id === eventRequest!.id,
    );
    assert.ok(eventResponse);
    const eventBody =
        await responseFromStored(eventResponse!).json();
    assert.deepEqual(eventBody, root satisfies IdentityTokenEntity);
}

// Below-facade pair formation, mirroring authorizePassword's OWN
// storage effect (Phase 13 Task 7, Gate 3): grantAuthorizationCode
// 's pre-tx lookup scans the '/authentication/authorize/' response
// family for a stored pair whose (redacted) `code` field
// fingerprints to the presented code, so a bare pair — the SAME
// shape a real login forms (Phase 13 Task 9: the authorization_
// codes row half retired) — is all a seed needs.
async function seedAuthorizationCodePair(
    db: MemoryDbAdapter,
    code: string,
    identityId: string,
    clientId: string,
): Promise<void> {
    const seed: AuthPairSeed = {
        requestAt: AT,
        headerFields: [],
        method: 'POST',
        pathname: '/authentication/authorize',
        routePattern: 'authentication/authorize',
        routeSegments: ['authentication', 'authorize'],
        pathSegments: ['authentication', 'authorize'],
    };
    const requestBody = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: clientId,
    };
    const pair = await formAuthPair(
        seed, requestBody, identityId, 200, { code },
    );
    await appendMessagePair(db, pair);
}

test('an authorization_code grant appends its root\'s own'
+ ' event pair, distinct from the grant\'s operation pair',
async () => {
    const db = await freshDb();
    await seedAuthorizationCodePair(db, 'the-code', 'current', 'web');
    const res = await postToken(db, {
        grant_type: 'authorization_code', code: 'the-code',
    });
    assert.equal(res.status, 200);
    await assertRootEventPair(db);
    // KEY-BY-ANCHOR (Phase 13 Task 7, gate 3): the issued root's
    // row id is now the code's OWN sha256 digest, not a fresh
    // mint — the same value the SAME address's event pair uri_id
    // carries (assertRootEventPair's own uri_id match above).
    const [root] = await deriveIdentityTokens(db);
    assert.equal(root!.id, await sha256Hex('the-code'));
    const requests = await db.requests.getAll();
    const opPair = requests.find(
        r => r.uri_prefix === '/authentication/token/',
    );
    assert.ok(opPair);
    assert.equal(opPair!.uri_id, '');
    // 3 bootstrap + the seeded authorize pair (Phase 13 Task 7:
    // the pre-tx lookup now needs a real authorize pair, not a
    // raw authorizationCodes row alone) + the root's own event
    // pair + the grant's own operation pair.
    assert.equal(requests.length, 6);
});

test('a token-exchange grant (a real /authentication/token'
+ ' request, not the internal org-exchange hop) appends its'
+ ' root\'s own event pair', async () => {
    const db = await freshDb();
    const subject = await devToken('current');
    const res = await postToken(db, {
        grant_type: 'token-exchange',
        subject_token: subject, actor_token: subject,
    });
    assert.equal(res.status, 200);
    await assertRootEventPair(db);
});

test('a client_credentials grant appends its root\'s own'
+ ' event pair', async () => {
    const db = await freshDb();
    const signer = await makeAssertionSigner('ES256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signer.sign({
        iss: 'svc-shadow', sub: 'svc-shadow',
        aud: 'fusion-ai-web',
        exp: now + 300, iat: now,
        jti: 'assert-shadow-tokens-1',
    });
    await db.clients.put('svc-shadow', {
        grant_types: 'client_credentials',
        redirect_uris: '', jwks: signer.jwks,
        aud: 'fusion-ai-web', status: 'active',
    });
    const res = await postToken(db, {
        grant_type: 'client_credentials',
        client_id: 'svc-shadow', client_assertion: assertion,
    });
    assert.equal(res.status, 200);
    await assertRootEventPair(db);
});

// ── synthesized event pairs: rotation and revocation (Phase 13
// Task 5, Gate 7's PRE-FORM + IN-TX VERIFY-OR-RETRY writers) —
// every row EITHER function writes gets its own event pair,
// distinct from the wired route's own operation pair.

// ANY identity_tokens row has its own event pair whose stored
// response deep-equals the row itself — the SAME shape
// assertRootEventPair checks for a bare issuance, generalized to
// an arbitrary row id (rotation and revocation can write more
// than one row per call).
async function assertEventPairForRow(
    db: MemoryDbAdapter, rowId: string,
): Promise<void> {
    const row = await deriveIdentityToken(db, rowId);
    const requests = await db.requests.getAll();
    const eventRequest = requests.find(
        r => r.uri_prefix === '/identity-tokens/'
            && r.uri_id === rowId,
    );
    assert.ok(eventRequest, 'no event pair for row ' + rowId);
    // requesterIdentityId is the event's OWN identity_id — same
    // NAMED convention as assertRootEventPair above.
    assert.equal(
        eventRequest!.requester_identity_id, row.identity_id,
    );
    const responses = await db.responses.getAll();
    const eventResponse = responses.find(
        r => r.id === eventRequest!.id,
    );
    assert.ok(eventResponse);
    const eventBody =
        await responseFromStored(eventResponse!).json();
    assert.deepEqual(eventBody, row satisfies IdentityTokenEntity);
}

test('a rotation\'s ROTATE branch appends an event pair for'
+ ' EACH of its two written rows (the retired presented jti,'
+ ' the issued successor), distinct from the rotation route\'s'
+ ' OWN operation pair', async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 200);
    const { jti: newJti } = await res.json() as { jti: string };
    const rows = await deriveIdentityTokens(db);
    const retired = rows.find(
        r => r.jti === ROOT_JTI && r.action === 'rotated',
    );
    const issued = rows.find(
        r => r.jti === newJti && r.action === 'issued',
    );
    assert.ok(retired);
    assert.ok(issued);
    await assertEventPairForRow(db, retired!.id);
    await assertEventPairForRow(db, issued!.id);
    const requests = await db.requests.getAll();
    const opPair = requests.find(
        r => r.uri_prefix
            === `/identity-tokens/${ROOT_JTI}/rotation/`,
    );
    assert.ok(opPair);
    assert.equal(opPair!.uri_id, '');
});

test('a rotation\'s REPLAY branch appends an event pair for'
+ ' EVERY jti the chain has ever held', async () => {
    const db = await seededDb();
    const first = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    const { jti: successorJti } =
        await first.json() as { jti: string };
    const replay = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(replay.status, 409);
    const rows = await deriveIdentityTokens(db);
    const revokedRoot = rows.find(
        r => r.jti === ROOT_JTI && r.action === 'revoked',
    );
    const revokedSuccessor = rows.find(
        r => r.jti === successorJti && r.action === 'revoked',
    );
    assert.ok(revokedRoot);
    assert.ok(revokedSuccessor);
    await assertEventPairForRow(db, revokedRoot!.id);
    await assertEventPairForRow(db, revokedSuccessor!.id);
});

test('a revocation appends an event pair for the revoked row,'
+ ' distinct from the revocation route\'s OWN operation pair',
async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/revocation`,
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 204);
    const rows = await deriveIdentityTokens(db);
    const revoked = rows.find(
        r => r.jti === ROOT_JTI && r.action === 'revoked',
    );
    assert.ok(revoked);
    await assertEventPairForRow(db, revoked!.id);
});

test('revoking an unknown jti appends NO event pair — only its'
+ ' own operation pair (the no-op precedent)', async () => {
    const db = await seededDb();
    const before = (await db.requests.getAll()).length;
    const res = await handleRequest(db, req(
        'POST', '/identity-tokens/ghost/revocation',
        DEV_TOKEN, {},
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // +1: only the operation pair — no row written, so no event
    // pair to match it.
    assert.equal(requests.length, before + 1);
    const rows = await deriveIdentityTokens(db);
    assert.equal(rows.length, 1);   // the seeded root, untouched
});

test('two concurrent rotations of one jti: exactly one'
+ ' \'rotate\' winner, the loser converges to the replay'
+ ' branch (chain revoked + 409) — today\'s exact outcome, now'
+ ' with pairs (the retry loop\'s divergence path)', async () => {
    const db = await seededDb();
    const before = await deriveIdentityTokens(db);
    const beforeIds = new Set(before.map(r => r.id));
    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
            DEV_TOKEN, {},
        )),
        handleRequest(db, req(
            'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
            DEV_TOKEN, {},
        )),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const winner = a.status === 200 ? a : b;
    const { jti: successorJti } =
        await winner.json() as { jti: string };
    const rows = await deriveIdentityTokens(db);
    // The whole chain ends up dead: the seeded root AND the
    // winner's own successor both revoked — the loser's replay
    // branch revoked everything the chain has ever held.
    assert.equal(
        latestActionForJti(rows, ROOT_JTI), 'revoked');
    assert.equal(
        latestActionForJti(rows, successorJti), 'revoked');
    // Every NEWLY written row (the winner's rotate pair, the
    // loser's replay revocations) carries its own event pair —
    // excluding the pre-existing seeded root, which predates any
    // pair-forming writer and so never got one.
    const newRows = rows.filter(r => !beforeIds.has(r.id));
    assert.equal(newRows.length, 4);
    for (const row of newRows) {
        await assertEventPairForRow(db, row.id);
    }
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});

// ── the org-exchange hop: issueTokenPair's SEEDLESS branch
// (Phase 13 Task 5's fourth commit) — exchangeBearerForOrganization
// forms no AUTH pair (it is never a real /authentication/token
// request), but the chain root it mints still gets its own event
// pair, decoupled from that seed.

test('the org-exchange facade hop mints its OWN chain root and'
+ ' appends that root\'s own event pair — even though it forms'
+ ' NO auth pair (never a real /authentication/token request)',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const flatToken = await devToken('current');
    const before = await deriveIdentityTokens(db);
    const beforeIds = new Set(before.map(r => r.id));
    const res = await handleRequest(db, new Request(
        `${BASE}/organizations/1/identity-tokens`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + flatToken },
        },
    ));
    assert.equal(res.status, 200);
    const after = await deriveIdentityTokens(db);
    const newRows = after.filter(r => !beforeIds.has(r.id));
    assert.equal(newRows.length, 1);
    await assertEventPairForRow(db, newRows[0]!.id);
    // NO auth pair: the exchange hop is an internal, non-route
    // hop — /authentication/token was never requested.
    const requests = await db.requests.getAll();
    assert.equal(
        requests.filter(
            r => r.uri_prefix === '/authentication/token/',
        ).length, 0,
    );
});

// ── revokeTokenChain's OWN divergence→retry branch — the two
// retry loops are hand-duplicated (Premature Generalization
// avoidance: two call sites, below the exploratory-duplication
// threshold), so the rotation-vs-rotation contention test above
// exercises ONLY rotateRefreshJti's copy. This races a chain
// revocation against a concurrent rotation of that SAME chain's
// live successor — the shape that can grow the chain between
// revokeTokenChain's pre-tx and in-tx reads (Author gate 4,
// lens-2 BLOCKING fix).

test('revokeTokenChain racing a concurrent rotateRefreshJti on'
+ ' the chain\'s live successor: the chain ends FULLY revoked'
+ ' regardless of which wins, including any jti the rotation'
+ ' minted mid-race, and the gate denies every one of them'
+ ' afterward', async () => {
    const db = await seededDb();
    // Establish a live successor first: rotate the seeded root
    // once, synchronously, so the chain has a rotated root AND a
    // live (issued) successor jti — "the chain's live successor"
    // the racing rotation below targets.
    const firstRotation = await handleRequest(db, req(
        'POST', `/identity-tokens/${ROOT_JTI}/rotation`,
        DEV_TOKEN, {},
    ));
    assert.equal(firstRotation.status, 200);
    const { jti: liveSuccessor } =
        await firstRotation.json() as { jti: string };
    const [revoke, rotate] = await Promise.all([
        handleRequest(db, req(
            'POST', `/identity-tokens/${ROOT_JTI}/revocation`,
            DEV_TOKEN, {},
        )),
        handleRequest(db, req(
            'POST', `/identity-tokens/${liveSuccessor}/rotation`,
            DEV_TOKEN, {},
        )),
    ]);
    // revokeTokenChain never fails (the claim-op 2xx precedent)
    // — this holds regardless of which side of the race wins.
    assert.equal(revoke.status, 204);
    assert.ok([200, 409].includes(rotate.status));
    const rows = await deriveIdentityTokens(db);
    const chainId = rows.find(r => r.jti === ROOT_JTI)!.chain_id;
    const everyJti = new Set(
        rows.filter(r => r.chain_id === chainId).map(r => r.jti),
    );
    // At least the seeded root and its first successor — plus a
    // SECOND (race-minted) successor if the racing rotation won.
    assert.ok(everyJti.size >= 2);
    for (const jti of everyJti) {
        assert.equal(latestActionForJti(rows, jti), 'revoked');
    }
    if (rotate.status === 200) {
        const { jti: raceSuccessor } =
            await rotate.json() as { jti: string };
        assert.ok(everyJti.has(raceSuccessor));
    }
    // The gate denies every jti in the chain afterward — driven
    // through the real gate-check function, not merely the
    // ledger-reduction it wraps.
    for (const jti of everyJti) {
        assert.equal(
            await tokenRevocationReason(db, 'current', 0, jti),
            'token chain revoked',
        );
    }
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});

// ── fault discrimination — the retry catch names ONLY the
// divergence sentinel (TokenPlanDivergedError, module-private to
// authentication.ts). Any OTHER thrown error — a genuine store
// fault, driven here behaviorally by faulting adapter.transaction
// itself, rather than exporting the sentinel class — must
// propagate on attempt 1: never retried (the Greedy Catch
// abomination this task's brief named explicitly), never
// swallowed, never converted into the operation's own ordinary
// failure shape (rotation's 409 outcome / revocation's silent
// void success).

function adapterWithFaultingTransaction(
    real: MemoryDbAdapter, fault: Error,
): { readonly adapter: DbAdapter; readonly calls: () => number } {
    let calls = 0;
    (real as unknown as {
        transaction: () => Promise<never>;
    }).transaction = async () => {
        calls += 1;
        throw fault;
    };
    return { adapter: real as unknown as DbAdapter, calls: () => calls };
}

test('rotateRefreshJti propagates a non-divergence transaction'
+ ' fault on attempt 1 — no retry, no swallow, no conversion'
+ ' to the 409 outcome', async () => {
    const db = await seededDb();
    const fault = new Error('store exploded');
    const faulting = adapterWithFaultingTransaction(db, fault);
    await assert.rejects(
        () => rotateRefreshJti(
            faulting.adapter, ROOT_JTI, 'newjti-fault',
        ),
        /store exploded/,
    );
    assert.equal(faulting.calls(), 1);
});

test('revokeTokenChain propagates a non-divergence transaction'
+ ' fault on attempt 1 — no retry, no swallow, no silent'
+ ' success', async () => {
    const db = await seededDb();
    const fault = new Error('store exploded');
    const faulting = adapterWithFaultingTransaction(db, fault);
    await assert.rejects(
        () => revokeTokenChain(faulting.adapter, ROOT_JTI),
        /store exploded/,
    );
    assert.equal(faulting.calls(), 1);
});
