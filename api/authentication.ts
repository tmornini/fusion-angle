import type { DbAdapter } from './db.ts';
import {
    mintAccessToken,
    verifyAccessToken,
} from './access-token.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityTokenEntity,
    type ClientEntity,
    type IdentityCredentialEntity,
    type IdentityPiiEntity,
} from './types.ts';
import { codeState } from './authorization-codes.ts';
import { planRotation } from './identity-tokens.ts';
import { verifyPassword } from './password-hash.ts';

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
    | { readonly ok: true; readonly response: TokenResponse }
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
    const all = await adapter.identityPii.getAll();
    const pii = all.find(p => p.id === identityId);
    return pii?.name ?? identityId;
}

// Mint an access + refresh JWT pair. The access token gets a
// fresh short-lived jti; the refresh token carries `refreshJti`
// (its lifecycle is tracked separately in identity_tokens).
async function mintPair(
    identityId: Id,
    name: string,
    refreshJti: string,
    act?: { sub: Id },
): Promise<TokenResponse> {
    const iat = Math.floor(Date.now() / 1000);
    const accessToken = await mintAccessToken({
        sub: identityId, roles: [], name, iat,
        ttlSeconds: ACCESS_TTL_SECONDS,
        jti: generateCryptoSafeBase62(),
        ...(act ? { act } : {}),
    });
    const refreshToken = await mintAccessToken({
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

// Issue a pair on a NEW chain — the refresh jti is recorded as a
// fresh chain root. Used by grants that start a session.
async function issueTokenPair(
    adapter: DbAdapter,
    identityId: Id,
    name: string,
    act?: { sub: Id },
): Promise<TokenResponse> {
    const refreshJti = generateCryptoSafeBase62();
    await adapter.identityTokens.put(
        generateCryptoSafeBase62(), {
            jti: refreshJti,
            identity_id: identityId,
            action: 'issued',
            chain_id: generateCryptoSafeBase62(),
            parent_jti: '',
            at: nowUtc(),
        });
    return mintPair(identityId, name, refreshJti, act);
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

// refresh grant: rotate a live refresh jti (retire it, issue a
// successor in the same chain) and mint a new pair. A non-live
// jti is reuse — the whole chain is revoked, then 401. An
// invalid/unknown token mints nothing and appends nothing.
async function grantRefresh(
    adapter: DbAdapter,
    body: Record<string, unknown>,
): Promise<TokenResult> {
    const token = typeof body.refresh_token === 'string'
        ? body.refresh_token
        : '';
    const now = Math.floor(Date.now() / 1000);
    const verified = await verifyAccessToken(token, now);
    if (!verified.valid) {
        return failure(
            401, 'invalid refresh token: ' + verified.reason,
        );
    }
    const rows = await adapter.identityTokens.getAll();
    const plan = planRotation(
        rows, verified.claims.jti,
        generateCryptoSafeBase62(), nowUtc(),
    );
    if (plan.kind === 'rotate') {
        await appendEvents(adapter, plan.appends);
        const name = await nameFor(adapter, verified.claims.sub);
        return {
            ok: true,
            response: await mintPair(
                verified.claims.sub, name, plan.newJti,
            ),
        };
    }
    if (plan.kind === 'replay') {
        await appendEvents(adapter, plan.appends);
    }
    return failure(401, 'refresh token reuse or unknown');
}

// token-exchange (RFC 8693): mint a delegated token where sub =
// the subject and act = the acting party. Both subject_token and
// actor_token are VERIFIED (signature/exp/nbf/aud) — the same
// frozen HMAC the refresh grant checks, so this is not weaker
// than the rest of the gate. The remaining SEAM is the
// DELEGATION POLICY: whether `actor` may act-as `subject` is NOT
// yet enforced — that authorization lands with the server tier.
// The claim shape (sub, act.sub) is frozen now.
async function grantTokenExchange(
    adapter: DbAdapter,
    body: Record<string, unknown>,
): Promise<TokenResult> {
    const subjectToken =
        typeof body.subject_token === 'string'
            ? body.subject_token
            : '';
    const actorToken =
        typeof body.actor_token === 'string'
            ? body.actor_token
            : '';
    const now = Math.floor(Date.now() / 1000);
    const subjectV =
        await verifyAccessToken(subjectToken, now);
    const actorV = await verifyAccessToken(actorToken, now);
    if (!subjectV.valid || !actorV.valid) {
        return failure(
            401,
            'token-exchange needs valid subject/actor tokens',
        );
    }
    const subject = subjectV.claims.sub;
    const actor = actorV.claims.sub;
    const name = await nameFor(adapter, subject);
    return {
        ok: true,
        response: await issueTokenPair(
            adapter, subject, name, { sub: actor },
        ),
    };
}

// client_credentials via private_key_jwt: a headless client
// authenticates as itself. SEAM — the client_assertion is only
// structurally required (a three-segment JWT); real JWS
// signature verification against the client's JWKS is deferred
// to the server tier (spec lines 418-419). The token's sub is
// the client id (a service principal).
async function grantClientCredentials(
    adapter: DbAdapter,
    body: Record<string, unknown>,
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
    } catch {
        return failure(401, 'unknown client');
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
    if (assertion.split('.').length !== 3) {
        return failure(401, 'malformed client_assertion');
    }
    const name = await nameFor(adapter, clientId);
    return {
        ok: true,
        response: await issueTokenPair(adapter, clientId, name),
    };
}

// authorization_code grant: consume an ISSUED code, then issue a
// token pair. A consumed (replay) or unknown code is a clean 401
// that mints nothing and appends nothing (grant-first).
async function grantAuthorizationCode(
    adapter: DbAdapter,
    body: Record<string, unknown>,
): Promise<TokenResult> {
    const code = typeof body.code === 'string'
        ? body.code
        : '';
    const rows = await adapter.authorizationCodes.getAll();
    const state = codeState(rows, code);
    if (state === null || state.status !== 'issued') {
        return failure(
            401, 'invalid or used authorization code',
        );
    }
    await adapter.authorizationCodes.put(
        generateCryptoSafeBase62(), {
            code,
            identity_id: state.identityId,
            client_id: state.clientId,
            status: 'consumed',
            at: nowUtc(),
        });
    const name = await nameFor(adapter, state.identityId);
    return {
        ok: true,
        response: await issueTokenPair(
            adapter, state.identityId, name,
        ),
    };
}

// Dispatch on grant_type. Single-grant primitives are added one
// per commit; an unsupported grant is a clean 400 with no side
// effects.
export async function postToken(
    adapter: DbAdapter,
    body: Record<string, unknown>,
): Promise<TokenResult> {
    const grantType = typeof body.grant_type === 'string'
        ? body.grant_type
        : '';
    switch (grantType) {
        case 'authorization_code':
            return grantAuthorizationCode(adapter, body);
        case 'refresh':
            return grantRefresh(adapter, body);
        case 'token-exchange':
            return grantTokenExchange(adapter, body);
        case 'client_credentials':
            return grantClientCredentials(adapter, body);
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
    const pii = rows.find(p => p.email === email);
    if (pii === undefined) return null;
    return pii.id;
}

// The current (non-revoked) password PHC for an identity, or
// null if none — the latest password-kind credential event.
function currentPasswordSecret(
    rows: readonly IdentityCredentialEntity[],
    identityId: Id,
): string | null {
    let latest: IdentityCredentialEntity | null = null;
    for (const row of rows) {
        if (row.identity_id !== identityId) continue;
        if (row.kind !== 'password') continue;
        if (latest === null || row.at >= latest.at) {
            latest = row;
        }
    }
    if (latest === null || latest.status === 'revoked') {
        return null;
    }
    return latest.secret;
}

// The password loop: verify username + password, and on success
// issue an authorization code bound to (identity, client). Every
// failure returns the SAME 401 (no user enumeration) and appends
// nothing — grant-first, no-op on failure.
async function authorizePassword(
    adapter: DbAdapter,
    body: Record<string, unknown>,
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
    const piiRows = await adapter.identityPii.getAll();
    const identityId = identityByEmail(piiRows, username);
    if (identityId === null) return denied;
    const credRows =
        await adapter.identityCredentials.getAll();
    const secret =
        currentPasswordSecret(credRows, identityId);
    if (secret === null) return denied;
    if (!(await verifyPassword(password, secret))) {
        return denied;
    }
    const code = generateCryptoSafeBase62();
    await adapter.authorizationCodes.put(
        generateCryptoSafeBase62(), {
            code,
            identity_id: identityId,
            client_id: clientId,
            status: 'issued',
            at: nowUtc(),
        });
    return { ok: true, response: { code } };
}

// Interactive front door. The password loop is real; passkey,
// provider-IdP, and corporate-OIDC are documented 501 SEAMS —
// the real ceremony lands with the server tier.
export async function postAuthorize(
    adapter: DbAdapter,
    body: Record<string, unknown>,
): Promise<AuthorizeResult> {
    const method = typeof body.method === 'string'
        ? body.method
        : '';
    switch (method) {
        case 'password':
            return authorizePassword(adapter, body);
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
