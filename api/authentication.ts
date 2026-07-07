import { EntityNotFoundError } from './db.ts';
import type { DbAdapter } from './db.ts';
import {
    verifyClientAssertion,
} from './client-assertion.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    verifyAccessToken,
    revokedThroughSeconds,
} from './access-token.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import {
    nowUtc,
    nowEpochSeconds,
    type Id,
    type IdentityTokenEntity,
    type ClientEntity,
    type IdentityCredentialEntity,
    type IdentityPiiEntity,
} from './types.ts';
import { codeState } from './authorization-codes.ts';
import {
    planRotation,
    isTokenRevoked,
    chainIdForJti,
    identityForJti,
    revocationAppends,
} from './identity-tokens.ts';
import {
    hashPassword,
    verifyPassword,
} from '../shared/password-hash.ts';
import {
    currentDefaultOrganizationFor,
} from './authorization.ts';
import {
    deriveDefaultOrganization,
} from './derive-default-organization.ts';
import {
    latestByKey,
    findFirstByKey,
} from '../shared/ledger-reduction.ts';
import {
    appendMessagePair,
    formAuthPair,
} from './message-pair.ts';
import type { MessagePair, AuthPairSeed } from './message-pair.ts';

// The OAuth 2.1 token + authorize logic, kept out of the route
// table. Each function returns a RESULT (success | failure) — an
// expected grant failure is a handled outcome, not a crash — and
// the route handler maps a failure to its HTTP status. GRANT-
// FIRST: every primitive authenticates the presented grant
// BEFORE any side effect, so a failed grant appends zero rows and
// mints nothing.

export interface TokenResponse {
    readonly access_token: string;
    readonly refresh_token: string;
    readonly token_type: 'Bearer';
    readonly expires_in: number;
}

export type TokenResult =
    | {
        readonly ok: true;
        readonly response: TokenResponse;
        // The just-appended pair's request hash — undefined
        // only for exchangeBearerForOrganization's internal,
        // seedless hop (never a real /authentication/token
        // request, so it forms no pair). The dedicated gate
        // arm (api.ts) always supplies a seed, so a result it
        // sees always carries one — see storedPairResponse's
        // sibling crash-loud idiom.
        readonly requestHash: string | undefined;
    }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: string;
    };

function failure(status: number, error: string): TokenResult {
    return { ok: false, status, error };
}

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

// A token's display name = the identity's PII name when present,
// else the id (a presentation transform at the call site — a
// service identity has no PII). Never a stored default.
async function nameFor(
    adapter: DbAdapter,
    identityId: Id,
): Promise<string> {
    // The id IS the PII keyPath, so a point read replaces the
    // scan. An absent row (a service identity has no PII) 404s,
    // which falls back to the id — the same value the scan's
    // miss returned.
    try {
        return (
            await adapter.identityPii.getById(identityId)
        ).name;
    } catch (e) {
        if (e instanceof EntityNotFoundError) return identityId;
        throw e;
    }
}

// The subject's reachable orgs — every org it is a member of,
// derived fresh from the membership ledger (never cached). The
// source of the token's `orgs` claim and the exchange's
// member-check.
export async function subjectOrganizations(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id[]> {
    const rows = await adapter.memberships
        .getAllWhere('identity_id', identityId);
    return rows.map(m => m.organization_id);
}

// The org a flat (un-exchanged) token resolves to, server-side:
// the identity's SET default, else its PRIMARY membership, else
// null. The gate denies a null — there is no global default left
// to fall back on. Task 8 (Phase 11): the row source is the
// derived /identities/:id/default-org/ message-pair ledger
// (api/derive-default-organization.ts), never the
// identity_default_organizations table directly — the reducer
// below is UNCHANGED, and the primary-membership fallback stays
// verbatim.
export async function identityDefaultOrganization(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id | null> {
    const events = await deriveDefaultOrganization(
        adapter, identityId,
    );
    const chosen = currentDefaultOrganizationFor(events, identityId);
    if (chosen !== null) return chosen;
    return await primaryMembershipOrganization(adapter, identityId);
}

// The earliest org an identity joined. Equal join moments
// tie-break to the lexically lowest org id, so resolution is
// deterministic.
async function primaryMembershipOrganization(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id | null> {
    // The index already narrows to this identity's rows, so no
    // per-row identity guard after (trust the gate).
    const rows = await adapter.memberships
        .getAllWhere('identity_id', identityId);
    let best: { organization: Id; at: string } | null = null;
    for (const row of rows) {
        if (best === null
            || row.at < best.at
            || (row.at === best.at
                && row.organization_id < best.organization)) {
            best = { organization: row.organization_id, at: row.at };
        }
    }
    return best === null ? null : best.organization;
}

// Mint an access + refresh JWT pair. The access token gets a
// fresh short-lived jti; the refresh token carries `refreshJti`
// (its lifecycle is tracked separately in identity_tokens). The
// access token also carries the active `org` (when exchanged
// into a tenant) and the reachable `orgs` set; the refresh
// token stays org-agnostic so a tenant switch re-exchanges.
async function mintPair(
    identityId: Id,
    name: string,
    refreshJti: string,
    act?: { sub: Id },
    scope?: { organization?: Id; organizations?: readonly Id[] },
): Promise<TokenResponse> {
    const iat = nowEpochSeconds();
    const accessToken = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: identityId, roles: [], name, iat,
        ttlSeconds: ACCESS_TTL_SECONDS,
        jti: generateCryptoSafeBase62(),
        ...(act ? { act } : {}),
        ...(scope?.organization ? { organization: scope.organization } : {}),
        ...(scope?.organizations && scope.organizations.length > 0
            ? { organizations: scope.organizations } : {}),
    });
    const refreshToken = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: identityId, roles: [], name, iat,
        ttlSeconds: REFRESH_TTL_SECONDS, jti: refreshJti,
    });
    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_SECONDS,
    };
}

// Record a fresh chain root for a CALLER-SUPPLIED refresh jti —
// a pure DB write, safe to run inside a caller's transaction so
// the issue can be atomic with whatever the grant consumes. The
// jti itself is generated OUTSIDE, pre-tx (Task 3: every grant's
// TokenResponse — and the mintPair HMAC signing behind it — must
// be fully known before a transaction opens).
async function recordIssuedRoot(
    view: DbAdapter,
    identityId: Id,
    refreshJti: string,
): Promise<void> {
    await view.identityTokens.put(
        generateCryptoSafeBase62(), {
            jti: refreshJti,
            identity_id: identityId,
            action: 'issued',
            chain_id: generateCryptoSafeBase62(),
            at: nowUtc(),
        });
}

// Issue a pair on a NEW chain: the refresh jti is recorded as a
// fresh chain root. Used by grants that start a session without
// consuming a single-use resource. All crypto (jti generation,
// mintPair's HMAC signing, formAuthPair's fingerprinting) runs
// PRE-tx; the chain-root write and the pair append are this
// grant's only row writes, so they ride ONE minimal transaction
// (the default-organization no-change precedent) — a mid-write
// fault can never leave an issued chain root with no matching
// ledger pair. `seed` is undefined for
// exchangeBearerForOrganization's internal, non-route hop (the
// org-switch facade never was an /authentication/token request),
// so that caller mints its chain root with no pair at all —
// exactly as before Task 3.
async function issueTokenPair(
    adapter: DbAdapter,
    identityId: Id,
    name: string,
    body: Record<string, unknown>,
    seed: AuthPairSeed | undefined,
    act?: { sub: Id },
    organization?: Id,
): Promise<{
    readonly response: TokenResponse;
    readonly requestHash: string | undefined;
}> {
    const refreshJti = generateCryptoSafeBase62();
    const organizations =
        await subjectOrganizations(adapter, identityId);
    const response = await mintPair(identityId, name, refreshJti, act, {
        ...(organization ? { organization } : {}),
        organizations,
    });
    const pair = seed === undefined
        ? undefined
        : await formAuthPair(seed, body, identityId, 200, response);
    await adapter.transaction(
        ['identity_tokens', 'requests', 'responses'],
        async (view) => {
            await recordIssuedRoot(view, identityId, refreshJti);
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
    return { response, requestHash: pair?.requestHash };
}

async function appendEvents(
    adapter: DbAdapter,
    events: readonly Omit<IdentityTokenEntity, 'id'>[],
): Promise<void> {
    for (const event of events) {
        await adapter.identityTokens.put(
            generateCryptoSafeBase62(), event,
        );
    }
}

// Both revocation controls the gate enforces, in ONE place so
// every token-accepting path honors them: the coarse
// logout-everywhere stamp (a token whose iat does not postdate
// the revocation second is dead — shared seconds fail closed)
// and the per-jti chain. A mint path that skips these would
// launder a revoked-but-unexpired token into a fresh valid
// pair the gate then accepts.
export async function tokenRevocationReason(
    adapter: DbAdapter,
    sub: string,
    iat: number,
    jti: string,
): Promise<string | null> {
    const revs = await adapter.identityTokenRevocations
        .getAllWhere('identity_id', sub);
    const revokedThrough = revokedThroughSeconds(revs, sub);
    if (revokedThrough !== null && iat <= revokedThrough) {
        return 'token revoked';
    }
    // The gate check needs only THIS jti's events: a chain-wide
    // revoke writes a 'revoked' event per jti, so the latest
    // action for the presented jti already reflects it.
    const events = await adapter.identityTokens
        .getAllWhere('jti', jti);
    if (isTokenRevoked(events, jti)) {
        return 'token chain revoked';
    }
    return null;
}

// The outcome of an atomic rotation attempt. 'rotate' carries
// the successor jti; 'fail' covers reuse and unknown — on
// reuse the whole chain's revocation has already landed in
// the same transaction.
export type RotationOutcome =
    | { readonly kind: 'rotate'; readonly newJti: string }
    | { readonly kind: 'fail' };

// Read the token ledger, plan the rotation, and append its
// events in ONE transaction — a concurrent reuse of the same
// jti can not double-rotate. Shared by the refresh grant and
// the POST identity-tokens/:jti/rotation route: one truth for
// the atomic rotate. `newJti` is caller-supplied (synchronous
// generateCryptoSafeBase62() is safe on either side of the
// tx boundary) rather than minted internally, so the route can
// pre-mint it at the gate and thread the SAME value through;
// `pair` is optional and appends as the LAST act, ONLY on the
// 'rotate' branch — a 409 (reuse or unknown) stores no pair
// even though the reuse branch still revokes the chain for
// real. The route is REPLAY_EXEMPT_ROUTE_PATTERNS-wired
// (message-pair.ts / api.ts): the gate never serves a stored
// response for a byte-identical resend of this route, so a
// resent reuse attempt genuinely re-enters this function and
// re-fails 409 — this function's own re-check IS the guard the
// exemption relies on; it must stay live on every call.
export function rotateRefreshJti(
    adapter: DbAdapter,
    presentedJti: string,
    newJti: string,
    pair?: MessagePair,
): Promise<RotationOutcome> {
    return adapter.transaction(
        ['identity_tokens', 'requests', 'responses'],
        async (view) => {
            // Two-step narrow: find the presented jti's chain,
            // then read the WHOLE chain — planRotation's replay
            // path revokes every jti in it, so a jti-only read
            // would under-revoke. Both reads are index hits in
            // the open tx (no interleaved non-IDB await).
            const tokens = view.identityTokens;
            const byJti = await tokens.getAllWhere(
                'jti', presentedJti);
            const chainId = chainIdForJti(
                byJti, presentedJti);
            const rows = chainId === null
                ? byJti
                : await tokens.getAllWhere(
                    'chain_id', chainId);
            const plan = planRotation(
                rows, presentedJti, newJti, nowUtc(),
            );
            if (plan.kind === 'rotate') {
                await appendEvents(view, plan.appends);
                if (pair !== undefined) {
                    await appendMessagePair(view, pair);
                }
                return {
                    kind: 'rotate' as const,
                    newJti: plan.newJti,
                };
            }
            if (plan.kind === 'replay') {
                await appendEvents(view, plan.appends);
            }
            return { kind: 'fail' as const };
        },
    );
}

// Revoke every jti in the chain `jti` belongs to (logging out
// one session). Read and appends ride the same transaction, so
// a concurrent rotation cannot slip a fresh successor past the
// revoke. A no-op for an unknown jti — `pair` still appends on
// BOTH exit paths (the claim-op precedent: a 2xx no-op is not
// a failure).
export function revokeTokenChain(
    adapter: DbAdapter,
    jti: string,
    pair?: MessagePair,
): Promise<void> {
    return adapter.transaction(
        ['identity_tokens', 'requests', 'responses'],
        async (view) => {
            const tokens = view.identityTokens;
            const byJti = await tokens.getAllWhere('jti', jti);
            const chainId = chainIdForJti(byJti, jti);
            const identityId = identityForJti(byJti, jti);
            if (chainId === null || identityId === null) {
                if (pair !== undefined) {
                    await appendMessagePair(view, pair);
                }
                return;
            }
            const rows = await tokens.getAllWhere(
                'chain_id', chainId);
            await appendEvents(view, revocationAppends(
                rows, chainId, identityId, nowUtc(),
            ));
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// refresh grant: rotate a live refresh jti (retire it, issue a
// successor in the same chain) and mint a new pair. A non-live
// jti is reuse — the whole chain is revoked, then 401. An
// invalid/unknown token mints nothing and appends nothing. The
// successor jti, the TokenResponse (mintPair's HMAC signing),
// and the pair are all resolved PRE-tx — rotateRefreshJti
// already accepts a caller-supplied jti and an optional
// pre-formed pair, appending the pair itself ONLY on the
// 'rotate' branch of its own transaction, so a reuse re-check
// that loses the race discards the pre-minted pair (wasted
// crypto, never observed) rather than ever storing it.
async function grantRefresh(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<TokenResult> {
    const token = typeof body.refresh_token === 'string'
        ? body.refresh_token
        : '';
    const now = nowEpochSeconds();
    const verified = await verifyAccessToken(token, now);
    if (!verified.valid) {
        return failure(
            401, 'invalid refresh token: ' + verified.reason,
        );
    }
    const refreshRev = await tokenRevocationReason(
        adapter, verified.claims.sub,
        verified.claims.iat, verified.claims.jti,
    );
    if (refreshRev !== null) {
        return failure(401, refreshRev);
    }
    const newJti = generateCryptoSafeBase62();
    const name = await nameFor(adapter, verified.claims.sub);
    const organizations = await subjectOrganizations(
        adapter, verified.claims.sub);
    const response = await mintPair(
        verified.claims.sub, name, newJti,
        undefined, { organizations },
    );
    const pair = await formAuthPair(
        seed, body, verified.claims.sub, 200, response,
    );
    const outcome = await rotateRefreshJti(
        adapter, verified.claims.jti, newJti, pair,
    );
    if (outcome.kind === 'rotate') {
        return { ok: true, response, requestHash: pair.requestHash };
    }
    return failure(401, 'refresh token reuse or unknown');
}

// token-exchange (RFC 8693): mint a delegated token where sub =
// the subject and act = the acting party. Both subject_token and
// actor_token are VERIFIED (signature/exp/nbf/aud) AND
// revocation-checked — the same frozen HMAC the refresh grant
// checks, so this is not weaker than the rest of the gate.
// DELEGATION POLICY: self-delegation ONLY (subject === actor).
// A cross-party exchange has no delegation ledger to authorize
// act-as, so it fails closed — 403, minting nothing — until
// that ledger lands with the server tier.
// The claim shape (sub, act.sub) is frozen now.
async function grantTokenExchange(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed?: AuthPairSeed,
): Promise<TokenResult> {
    const subjectToken =
        typeof body.subject_token === 'string'
            ? body.subject_token
            : '';
    const actorToken =
        typeof body.actor_token === 'string'
            ? body.actor_token
            : '';
    const now = nowEpochSeconds();
    const subjectV =
        await verifyAccessToken(subjectToken, now);
    const actorV = await verifyAccessToken(actorToken, now);
    if (!subjectV.valid || !actorV.valid) {
        return failure(
            401,
            'token-exchange needs valid subject/actor tokens',
        );
    }
    const subjectRev = await tokenRevocationReason(
        adapter, subjectV.claims.sub,
        subjectV.claims.iat, subjectV.claims.jti,
    );
    if (subjectRev !== null) {
        return failure(401, subjectRev);
    }
    const actorRev = await tokenRevocationReason(
        adapter, actorV.claims.sub,
        actorV.claims.iat, actorV.claims.jti,
    );
    if (actorRev !== null) {
        return failure(401, actorRev);
    }
    const subject = subjectV.claims.sub;
    const actor = actorV.claims.sub;
    if (subject !== actor) {
        return failure(
            403,
            'token-exchange is limited to self-delegation'
                + ' (subject must equal actor)',
        );
    }
    const organization =
        typeof body.organization === 'string'
            ? body.organization
            : '';
    if (organization !== '') {
        const organizations = await subjectOrganizations(adapter, subject);
        if (!organizations.includes(organization)) {
            return failure(
                403,
                'subject is not a member of'
                + ' the organization',
            );
        }
    }
    const name = await nameFor(adapter, subject);
    const issued = await issueTokenPair(
        adapter, subject, name, body, seed,
        { sub: actor },
        organization === '' ? undefined : organization,
    );
    return {
        ok: true,
        response: issued.response,
        requestHash: issued.requestHash,
    };
}

// The facade's self-delegation: a caller exchanges its own
// bearer for a token scoped to `org` (subject == actor == the
// caller). Returns 403, minting nothing, when the caller is
// not a member — the gate's tenant fence. This is an INTERNAL
// hop (api.ts's facadeRequest), never a real
// /authentication/token request, so it supplies no seed —
// issueTokenPair forms no pair for it, exactly as before Task 3.
export async function exchangeBearerForOrganization(
    adapter: DbAdapter,
    bearer: string,
    organization: Id,
): Promise<TokenResult> {
    return grantTokenExchange(adapter, {
        subject_token: bearer,
        actor_token: bearer,
        organization: organization,
    });
}

// client_credentials via private_key_jwt: a headless client
// authenticates as itself. The client_assertion is REALLY
// verified — JWS signature against the client's registered
// JWKS (RS256/ES256, WebCrypto) plus the RFC 7523 claim
// checks, in api/client-assertion.ts. The remaining seam is
// jti replay tracking (server tier). The token's sub is the
// client id (a service principal).
async function grantClientCredentials(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<TokenResult> {
    const clientId = typeof body.client_id === 'string'
        ? body.client_id
        : '';
    const assertion =
        typeof body.client_assertion === 'string'
            ? body.client_assertion
            : '';
    let client: ClientEntity;
    try {
        client = await adapter.clients.getById(clientId);
    } catch (e) {
        if (e instanceof EntityNotFoundError) {
            return failure(401, 'unknown client');
        }
        throw e;
    }
    if (client.status !== 'active') {
        return failure(401, 'client is disabled');
    }
    if (!client.grant_types.split(' ')
        .includes('client_credentials')) {
        return failure(
            400, 'client may not use client_credentials',
        );
    }
    const verdict = await verifyClientAssertion(
        assertion, client,
        nowEpochSeconds(),
    );
    if (!verdict.valid) {
        return failure(
            401,
            'invalid client_assertion: ' + verdict.reason,
        );
    }
    const name = await nameFor(adapter, clientId);
    const issued = await issueTokenPair(
        adapter, clientId, name, body, seed,
    );
    return {
        ok: true,
        response: issued.response,
        requestHash: issued.requestHash,
    };
}

// authorization_code grant: consume an ISSUED code, then issue a
// token pair. A consumed (replay) or unknown code is a clean 401
// that mints nothing and appends nothing (grant-first). PRE-tx:
// read the code state (mintPair's inputs beyond the jti come
// from the identity this read alone discovers), mint the
// refresh jti and the full TokenResponse, and form the pair —
// all before any transaction opens. Then ONE tx RE-READS the
// code and RE-RUNS codeState: a concurrent consumer may have
// won the race between the pre-tx read and here, in which case
// this call aborts (401, mints nothing further, appends
// nothing — the pre-minted response and pair above are simply
// discarded, wasted crypto on the losing side of the race)
// exactly as the pre-restructure single-tx version did.
async function grantAuthorizationCode(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<TokenResult> {
    const code = typeof body.code === 'string'
        ? body.code
        : '';
    const rows = await adapter.authorizationCodes
        .getAllWhere('code', code);
    const state = codeState(rows, code);
    if (state === null || state.status !== 'issued') {
        return failure(
            401, 'invalid or used authorization code',
        );
    }
    const refreshJti = generateCryptoSafeBase62();
    const name = await nameFor(adapter, state.identityId);
    const organizations =
        await subjectOrganizations(adapter, state.identityId);
    const response = await mintPair(
        state.identityId, name, refreshJti,
        undefined, { organizations },
    );
    const pair = await formAuthPair(
        seed, body, state.identityId, 200, response,
    );
    const consumed = await adapter.transaction(
        [
            'authorization_codes', 'identity_tokens',
            'requests', 'responses',
        ],
        async (view) => {
            const freshRows = await view.authorizationCodes
                .getAllWhere('code', code);
            const fresh = codeState(freshRows, code);
            if (fresh === null || fresh.status !== 'issued') {
                return false;
            }
            await view.authorizationCodes.put(
                generateCryptoSafeBase62(), {
                    code,
                    identity_id: fresh.identityId,
                    client_id: fresh.clientId,
                    status: 'consumed',
                    at: nowUtc(),
                });
            await recordIssuedRoot(
                view, fresh.identityId, refreshJti,
            );
            await appendMessagePair(view, pair);
            return true;
        },
    );
    if (!consumed) {
        return failure(
            401, 'invalid or used authorization code',
        );
    }
    return { ok: true, response, requestHash: pair.requestHash };
}

// Dispatch on grant_type. Single-grant primitives are added one
// per commit; an unsupported grant is a clean 400 with no side
// effects. `seed` seeds every grant's own pair — see
// AuthPairSeed and api.ts's dedicated authentication arm.
export async function postToken(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<TokenResult> {
    const grantType = typeof body.grant_type === 'string'
        ? body.grant_type
        : '';
    switch (grantType) {
        case 'authorization_code':
            return grantAuthorizationCode(adapter, body, seed);
        case 'refresh':
            return grantRefresh(adapter, body, seed);
        case 'token-exchange':
            return grantTokenExchange(adapter, body, seed);
        case 'client_credentials':
            return grantClientCredentials(adapter, body, seed);
        default:
            return failure(
                400, 'unsupported grant_type: ' + grantType,
            );
    }
}

export interface AuthorizeResponse {
    readonly code: string;
}

export type AuthorizeResult =
    | {
        readonly ok: true;
        readonly response: AuthorizeResponse;
        readonly requestHash: string;
    }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: string;
    };

// The identity that owns an email login (null if none).
function identityByEmail(
    rows: readonly IdentityPiiEntity[],
    email: string,
): Id | null {
    return findFirstByKey(
        rows, p => p.email === email, p => p.id,
    );
}

// The current (non-revoked) password PHC for an identity, or
// null if none — the latest password-kind credential event.
// latestByKey's default >= tiebreak keeps the later-appended
// event on a same-`at` tie.
function currentPasswordSecret(
    rows: readonly IdentityCredentialEntity[],
    identityId: Id,
): string | null {
    const passwords = rows.filter(
        row => row.identity_id === identityId
            && row.kind === 'password',
    );
    const latest = latestByKey(passwords, row => row.identity_id)
        .get(identityId);
    if (latest === undefined || latest.status === 'revoked') {
        return null;
    }
    return latest.secret;
}

// A real PHC over a throwaway secret, hashed ONCE then cached.
// The unknown-user and missing-secret paths verify the
// presented password against THIS before the identical 401, so
// a failed login costs the same PBKDF2 work whether or not the
// user exists — closing the timing channel a uniform 401 body
// cannot. Lazy-init of a derived constant, not a measured cache.
let timingEqualizerPhc: string | null = null;
async function equalizeFailureTiming(
    password: string,
): Promise<void> {
    if (timingEqualizerPhc === null) {
        timingEqualizerPhc =
            await hashPassword('timing-equalizer');
    }
    await verifyPassword(password, timingEqualizerPhc);
}

// The password loop: verify username + password, and on success
// issue an authorization code bound to (identity, client). Every
// failure returns the SAME 401 (no user enumeration) and appends
// nothing — grant-first, no-op on failure. On success there is
// no prior state to race (a fresh code always issues cleanly),
// so — unlike grantAuthorizationCode's consume path — the store
// put and the pair append simply ride ONE transaction, no in-tx
// re-check needed. The stored request carries the PBKDF2-
// fingerprinted password and the stored response the sha256-
// fingerprinted code (redactAuthenticationRequest/Response,
// applied inside formAuthPair) — never the live values.
async function authorizePassword(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<AuthorizeResult> {
    const username = typeof body.username === 'string'
        ? body.username
        : '';
    const password = typeof body.password === 'string'
        ? body.password
        : '';
    const clientId = typeof body.client_id === 'string'
        ? body.client_id
        : '';
    const denied: AuthorizeResult = {
        ok: false, status: 401, error: 'invalid credentials',
    };
    const piiRows = await adapter.identityPii
        .getAllWhere('email', username);
    const identityId = identityByEmail(piiRows, username);
    if (identityId === null) {
        await equalizeFailureTiming(password);
        return denied;
    }
    const credRows = await adapter.identityCredentials
        .getAllWhere('identity_id', identityId);
    const secret =
        currentPasswordSecret(credRows, identityId);
    if (secret === null) {
        await equalizeFailureTiming(password);
        return denied;
    }
    if (!(await verifyPassword(password, secret))) {
        return denied;
    }
    const code = generateCryptoSafeBase62();
    const response: AuthorizeResponse = { code };
    const pair = await formAuthPair(
        seed, body, identityId, 200, response,
    );
    await adapter.transaction(
        ['authorization_codes', 'requests', 'responses'],
        async (view) => {
            await view.authorizationCodes.put(
                generateCryptoSafeBase62(), {
                    code,
                    identity_id: identityId,
                    client_id: clientId,
                    status: 'issued',
                    at: nowUtc(),
                });
            await appendMessagePair(view, pair);
        },
    );
    return { ok: true, response, requestHash: pair.requestHash };
}

// Interactive front door. The password loop is real; passkey,
// provider-IdP, and corporate-OIDC are documented 501 SEAMS —
// the real ceremony lands with the server tier.
export async function postAuthorize(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<AuthorizeResult> {
    const method = typeof body.method === 'string'
        ? body.method
        : '';
    switch (method) {
        case 'password':
            return authorizePassword(adapter, body, seed);
        case 'passkey':
        case 'provider':
        case 'oidc':
            return {
                ok: false, status: 501,
                error: method + ' auth is a server-tier seam',
            };
        default:
            return {
                ok: false, status: 400,
                error: 'unsupported method: ' + method,
            };
    }
}
