import {
    EntityNotFoundError,
} from './db.ts';
import type {
    DbAdapter,
    StorageBackend,
    Tx,
} from './db.ts';
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
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';
import { generateSecret } from
    '../shared/secret.ts';
import { sha256Bytes, sha256Hex } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';
import {
    nowUtc,
    nowEpochSeconds,
    msSinceUtc,
    MS_PER_SECOND,
    type Id,
    type IdentityTokenEntity,
    type ClientRegistrationEntity,
    type IdentityCredentialEntity,
    type IdentityPiiEntity,
    type MessagePairEntity,
} from './types.ts';
import {
    pickString,
    validateIdentityCredentialEntity,
} from './validators.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import {
    planRotation,
    isTokenRevoked,
    chainIdForJti,
    latestActionForJti,
    revocationAppends,
    jtiSetsEqual,
} from './identity-tokens.ts';
import type { RotationPlan } from './identity-tokens.ts';
import {
    hashPassword,
    verifyPassword,
} from '../shared/password-hash.ts';
import {
    composeClaimRole,
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
    attemptFor,
    runWrite,
    ownWireOf,
    canonicalPath,
    formAuthMessagePair,
    formAuthorizationCodeMarkerPair,
    formTokenEventMessagePair,
    formWriteMessagePair,
} from './message-pair.ts';
import { messageStore } from './message-store.ts';
import type {
    MessagePair, AuthMessagePairSeed,
} from './message-pair.ts';
import {
    deriveMembershipsForIdentity,
    membershipExistsFor,
} from './derive-memberships.ts';
import {
    deriveCredentialsFor,
    deriveClientRegistration,
    deriveIdentityPii,
    deriveIdentityPiiRows,
    deriveTokenRevocationsFor,
} from './derive-identity-spine.ts';
import {
    deriveIdentityTokensFor,
    deriveIdentityTokenEventsForJti,
} from './derive-identity-tokens.ts';
import {
    HTTP_BAD_REQUEST,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_NOT_IMPLEMENTED,
} from './http-errors.ts';

// The OAuth 2.1 token + authorize logic, kept out of the route
// table. Each function returns a RESULT (success | failure) — an
// expected grant failure is a handled outcome, not a crash — and
// the route handler maps a failure to its HTTP status. GRANT-
// FIRST: every primitive authenticates the presented grant
// BEFORE any side effect, so a failed grant appends zero rows and
// mints nothing.

export interface TokenResponse {
    readonly access_token: string;
    readonly token_type: 'Bearer';
    readonly expires_in: number;
}

export type TokenResult =
    | {
        readonly ok: true;
        readonly response: TokenResponse;
        // Minted refresh JWT — send-time Set-Cookie only.
        // Never serialized into the stored pair / wire JSON.
        readonly refreshToken: string;
        // The just-stored AUTH pair's id — undefined only for
        // exchangeBearerForOrganization's internal, seedless hop
        // (never a real /authentication/token request, so it
        // forms no AUTH pair; its issued root's OWN event pair
        // still lands, Phase 13 Task 5, but this field tracks
        // the auth-pair id specifically). The dedicated gate
        // arm (api.ts) always supplies a seed, so a result it
        // sees always carries one — resolved by getById.
        readonly messagePairId: string | undefined;
        readonly wire: Response | undefined;
    }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: string;
    };

function failure(status: number, error: string): TokenResult {
    return { ok: false, status, error };
}

// Grant 401s: named class on the wire; reason stays on the
// TokenResult / AuthorizeResult for logs at the HTTP arm.
export function wireGrantError(error: string): string {
    if (error.startsWith('invalid client_assertion')) {
        return 'invalid_client';
    }
    if (
        error === 'invalid credentials'
        || error === 'invalid or used authorization code'
        || error === 'invalid_grant'
    ) {
        return 'invalid_grant';
    }
    return error;
}

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/authentication';

function refreshCookieAttributes(
    request: Request,
    extra: readonly string[],
): string {
    void request;
    return [
        'HttpOnly',
        'SameSite=Strict',
        'Path=' + REFRESH_COOKIE_PATH,
        ...extra,
        'Secure',
    ].join('; ');
}

export function refreshSetCookie(
    refreshToken: string,
    request: Request,
): string {
    return REFRESH_COOKIE_NAME + '=' + refreshToken
        + '; ' + refreshCookieAttributes(request, []);
}

export function refreshClearCookie(
    request: Request,
): string {
    return REFRESH_COOKIE_NAME + '=; '
        + refreshCookieAttributes(request, ['Max-Age=0']);
}

export function refreshTokenFromCookieHeader(
    header: string | null,
): string {
    if (header === null || header === '') {
        return '';
    }
    for (const part of header.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const name = trimmed.slice(0, eq).trim();
        if (name !== REFRESH_COOKIE_NAME) continue;
        return trimmed.slice(eq + 1).trim();
    }
    return '';
}

export function basicAuthorization(
    userId: string,
    password: string,
): string {
    if (userId.includes(':')) {
        throw new Error('user-id contains a colon');
    }
    const bytes = new TextEncoder().encode(
        userId + ':' + password,
    );
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return 'Basic ' + btoa(binary);
}

export function parseBasic(
    header: string | null,
): {
    readonly userId: string;
    readonly password: string;
} | null {
    if (header === null || header === '') return null;
    const space = header.indexOf(' ');
    if (space <= 0) return null;
    if (header.slice(0, space).toLowerCase() !== 'basic') {
        return null;
    }
    const token = header.slice(space + 1).trim();
    if (token === '') return null;
    let binary: string;
    try {
        binary = atob(token);
    } catch {
        return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const colon = bytes.indexOf(0x3a);
    if (colon < 0) return null;
    const decoder = new TextDecoder();
    return {
        userId: decoder.decode(bytes.subarray(0, colon)),
        password: decoder.decode(
            bytes.subarray(colon + 1),
        ),
    };
}

function bearerCredential(header: string | null): string {
    if (header === null) return '';
    const space = header.indexOf(' ');
    if (space <= 0) return '';
    if (header.slice(0, space).toLowerCase() !== 'bearer') {
        return '';
    }
    return header.slice(space + 1).trim();
}

const AUTHORIZATION_BODY_FIELDS = [
    'username',
    'password',
    'code',
    'code_verifier',
    'subject_token',
    'actor_token',
    'client_assertion',
] as const;

function credentialRides(
    body: Record<string, unknown>,
): string | null {
    for (const name of AUTHORIZATION_BODY_FIELDS) {
        if (name in body) {
            return name + ' rides the Authorization line';
        }
    }
    if ('refresh_token' in body) {
        return 'refresh_token rides the Cookie line';
    }
    return null;
}

function quotedAuthParam(
    name: string,
    value: string,
): string {
    if (value.includes('"') || value.includes('\\')) {
        throw new Error(
            name + ' contains a quote or backslash',
        );
    }
    return name + '="' + value + '"';
}

function publicTokenBody(
    response: TokenResponse,
): {
    readonly token_type: 'Bearer';
    readonly expires_in: number;
} {
    return {
        token_type: response.token_type,
        expires_in: response.expires_in,
    };
}

function tokenAnswerFields(
    accessToken: string,
    refreshCookie: string | undefined,
): { readonly name: string; readonly value: string }[] {
    const fields: {
        readonly name: string;
        readonly value: string;
    }[] = [{
        name: 'authentication-info',
        value: quotedAuthParam(
            'access_token', accessToken,
        ),
    }];
    if (refreshCookie !== undefined) {
        fields.push({
            name: 'set-cookie',
            value: refreshCookie,
        });
    }
    return fields;
}

function codeFromSecret(secret: string): string | null {
    const splitAt = secret.indexOf('\r\n\r\n');
    const response = splitAt >= 0
        ? secret.slice(splitAt + 4)
        : (secret.startsWith('\r\n')
            ? secret.slice(2)
            : '');
    if (response === '') return null;
    const prefix = 'authentication-info: ';
    for (const line of response.split('\r\n')) {
        if (!line.startsWith(prefix)) continue;
        const value = line.slice(prefix.length);
        const marker = 'code="';
        if (
            !value.startsWith(marker)
            || !value.endsWith('"')
        ) {
            return null;
        }
        return value.slice(marker.length, -1);
    }
    return null;
}

export function attachSetCookie(
    response: Response,
    cookie: string,
): Response {
    const headers = new Headers(response.headers);
    headers.append('Set-Cookie', cookie);
    return new Response(response.body, {
        status: response.status,
        headers,
    });
}

// A token's display name = the identity's PII name when present,
// else the id (a presentation transform at the call site — a
// service identity has no PII). Never a stored default.
async function nameFor(
    adapter: DbAdapter,
    identityId: Id,
): Promise<string> {
    // FLIPPED (Phase 13 Task 8): deriveIdentityPii reads the
    // identity's own /pii prefix — a targeted, identity-keyed
    // read, never a full-ledger scan — and throws
    // EntityNotFoundError('identity_pii', id) on absence (a
    // service identity has no PII) exactly as the row-plane
    // point read it replaces did, so the catch below is
    // unchanged.
    try {
        return (
            await deriveIdentityPii(adapter, identityId)
        ).name;
    } catch (e) {
        if (e instanceof EntityNotFoundError) return identityId;
        throw e;
    }
}

// The subject's reachable orgs and mint-time claim roles —
// one `{type}:{organization_id}` per live seat — from a
// single membership derivation. Source of the token's
// `orgs` claim and the exchange's member-check. Mint-time
// only — the gate reads claims.
export async function subjectClaims(
    adapter: DbAdapter,
    identityId: Id,
): Promise<{
    readonly organizations: Id[];
    readonly roles: string[];
}> {
    const rows = await deriveMembershipsForIdentity(
        adapter, identityId,
    );
    return {
        organizations: rows.map(
            m => m.organization_id,
        ),
        roles: rows.map(
            m => composeClaimRole(
                m.type, m.organization_id,
            ),
        ),
    };
}

// Thin wrapper over subjectClaims for callers that need
// only the reachable organization ids.
export async function subjectOrganizations(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id[]> {
    return (await subjectClaims(adapter, identityId))
        .organizations;
}

// The org a flat (un-exchanged) token resolves to, server-side:
// the SET default-organization document if that organization
// is a live seat, else PRIMARY (earliest remaining join `at`,
// lex organization id on tie), else null. The gate denies a
// null — there is no global default left to fall back on.
// Revoke does not rewrite the SET document; this read skips
// a SET that is no longer a live seat.
export async function identityDefaultOrganization(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id | null> {
    const events = await deriveDefaultOrganization(
        adapter, identityId,
    );
    const chosen = currentDefaultOrganizationFor(
        events, identityId,
    );
    if (
        chosen !== null
        && await membershipExistsFor(
            adapter, chosen, identityId,
        )
    ) {
        return chosen;
    }
    return await primaryMembershipOrganization(
        adapter, identityId,
    );
}

// The earliest org an identity joined. Equal join moments
// tie-break to the lowest org id by identifier order, so
// resolution is deterministic.
async function primaryMembershipOrganization(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id | null> {
    // The index already narrows to this identity's rows, so no
    // per-row identity guard after (trust the gate).
    const rows = await deriveMembershipsForIdentity(
        adapter, identityId);
    let best: { organization: Id; at: string } | null = null;
    for (const row of rows) {
        if (best === null
            || row.at < best.at
            || (row.at === best.at
                && compareIdentifiers(
                    row.organization_id,
                    best.organization) < 0)) {
            best = { organization: row.organization_id, at: row.at };
        }
    }
    return best === null ? null : best.organization;
}

// Mint an access + refresh JWT pair. The access token gets a
// fresh short-lived jti; the refresh token carries `refreshJti`
// (its lifecycle is tracked separately in identity_tokens). The
// access token carries claim roles (`{type}:{org}`), the active
// `org` (when exchanged into a tenant), and the reachable
// `orgs` set; the refresh token stays org/role-agnostic so a
// tenant switch re-exchanges and the next access mint re-bakes.
async function mintPair(
    identityId: Id,
    name: string,
    refreshJti: string,
    act?: { sub: Id },
    scope?: {
        organization?: Id;
        organizations?: readonly Id[];
        roles?: readonly string[];
    },
): Promise<{
    readonly response: TokenResponse;
    readonly refreshToken: string;
}> {
    const iat = nowEpochSeconds();
    const roles = scope?.roles ?? [];
    const accessToken = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: identityId, roles, name, iat,
        ttlSeconds: ACCESS_TTL_SECONDS,
        jti: generateIdentifier(),
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
        response: {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TTL_SECONDS,
        },
        refreshToken,
    };
}

// Issue a pair on a NEW chain: the refresh jti anchors a fresh
// chain root, recorded PAIR-ONLY (Phase 13 Task 9: the row half
// retires here — nothing has read identity_tokens rows since
// Task 6). Used by grants that start a session without consuming
// a single-use resource. All crypto (jti generation, mintPair's
// HMAC signing, formAuthMessagePair's and
// formTokenEventMessagePair's hashing)
// runs PRE-tx; the root's own event pair (plus the auth pair,
// when seeded) is this grant's only write, so it rides ONE
// minimal transaction (the default-organization no-change
// precedent) — a mid-write fault can never leave one pair stored
// without the other. `seed` is undefined for
// exchangeBearerForOrganization's internal, non-route hop (the
// org-switch facade never was an /authentication/token request),
// so that caller mints its chain root with no AUTH pair — exactly
// as before Task 3. The root's OWN event pair is UNGATED (Phase
// 13 Task 5): the chain root is recorded either way, so the
// ledger visibility the event pair grants must too — the exchange
// hop's own election, decoupled from whether an
// /authentication/token request occasioned the mint.
async function issueTokenPair(
    adapter: DbAdapter,
    identityId: Id,
    name: string,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed | undefined,
    act?: { sub: Id },
    organization?: Id,
    claims?: {
        readonly organizations: readonly Id[];
        readonly roles: readonly string[];
    },
): Promise<{
    readonly response: TokenResponse;
    readonly refreshToken: string;
    readonly messagePairId: string | undefined;
    readonly wire: Response | undefined;
}> {
    const refreshJti = generateIdentifier();
    const chainId = generateIdentifier();
    const at = nowUtc();
    const resolved = claims ?? await subjectClaims(
        adapter, identityId,
    );
    const minted = await mintPair(
        identityId, name, refreshJti, act, {
            ...(organization ? { organization } : {}),
            organizations: resolved.organizations,
            roles: resolved.roles,
        },
    );
    const response = minted.response;
    const messagePair = seed === undefined
        ? undefined
        : await formAuthMessagePair(
            seed, body, identityId,
            publicTokenBody(response),
            seed.operationId, seed.requestId,
            tokenAnswerFields(
                response.access_token, undefined,
            ),
        );
    // Copy the envelope id: hoisted header when the client
    // sent one, else formAuthMessagePair's named mint. Seedless
    // exchange has no AUTH pair — mint one id for the
    // event pair alone.
    const operationId = messagePair?.operationId
        ?? generateIdentifier();
    const requestId = messagePair?.requestId
        ?? generateIdentifier();
    const eventMessagePair = await formTokenEventMessagePair(
        refreshJti, {
            jti: refreshJti, identity_id: identityId,
            action: 'issued', chain_id: chainId, at,
        }, operationId, requestId,
    );
    const pairs = [eventMessagePair];
    if (messagePair !== undefined) {
        pairs.push(messagePair);
    }
    await runWrite(
        adapter, attemptFor(pairs), pairs,
    );
    return {
        response,
        refreshToken: minted.refreshToken,
        messagePairId: messagePair?.id,
        wire: messagePair === undefined
            ? undefined
            : ownWireOf(messagePair),
    };
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
    // FIRST read FLIPPED (Phase 13 Task 4): derived via
    // deriveTokenRevocationsFor — row-identical to the
    // getAllWhere on identity_id it replaces.
    const revs = await deriveTokenRevocationsFor(adapter, sub);
    const revokedThrough = revokedThroughSeconds(revs, sub);
    if (revokedThrough !== null && iat <= revokedThrough) {
        return 'token revoked';
    }
    // SECOND read FLIPPED (Phase 13 Task 6, gate 7 discharged):
    // derived via deriveIdentityTokenEventsForJti — row-identical
    // to the getAllWhere on jti it replaces, now that
    // every identity_tokens writer forms its own event pair
    // (Phase 13 Task 5). The gate check needs only THIS jti's
    // events: a chain-wide revoke writes a 'revoked' event per
    // jti, so the latest action for the presented jti already
    // reflects it.
    const events =
        await deriveIdentityTokenEventsForJti(
            adapter, jti, sub,
        );
    if (isTokenRevoked(events, jti)) {
        return 'token chain revoked';
    }
    return null;
}

// The collection read a replay rotation and an explicit
// revocation share, run BOTH pre-tx and in-tx: ONE collection
// read of the identity's own tokens (deriveIdentityTokensFor
// — one head per jti document at the nested prefix), folded
// in memory first for the presented jti's chain_id, then for
// every row of that chain — planRotation's replay path and
// an explicit revocation act on every jti the chain has ever
// held, so a jti-only fold would under-revoke. A jti absent
// from this identity's collection is unknown: chainId null,
// rows empty. The refresh grant already verified the JWT
// (claims.sub); the rotation and revocation routes carry the
// identity on their path. Never the whole plane (spec
// 2026-09-15 exact-read folds § 1).
async function readTokenChainFromLedger(
    db: DbAdapter,
    identityId: Id,
    jti: string,
): Promise<{
    readonly chainId: string | null;
    readonly rows: readonly IdentityTokenEntity[];
}> {
    const collection = await deriveIdentityTokensFor(
        db, identityId,
    );
    const chainId = chainIdForJti(collection, jti);
    const rows = chainId === null
        ? []
        : collection.filter((row) => row.chain_id === chainId);
    return { chainId, rows };
}

// Each append's event, paired with its OWN event pair at the
// jti's document. Formed pre-tx — crypto, hashing, and timers
// never run inside an open transaction (AGENTS.md §
// Transaction bodies await only row ops).
interface TokenEventWrite {
    readonly event: Omit<IdentityTokenEntity, 'id'>;
    readonly messagePair: MessagePair;
}

async function formTokenEventWrites(
    appends: readonly Omit<IdentityTokenEntity, 'id'>[],
    operationId: string,
    requestId: string,
): Promise<TokenEventWrite[]> {
    const writes: TokenEventWrite[] = [];
    for (const event of appends) {
        writes.push({
            event,
            messagePair: await formTokenEventMessagePair(
                event.jti, event, operationId, requestId,
            ),
        });
    }
    return writes;
}

// The retry budget shared by rotation and revocation's verify-
// or-retry loops (the doctrine's default): a diverged attempt
// aborts its transaction and retries with a WHOLLY FRESH attempt
// — re-reading, re-planning, and re-forming pairs from scratch,
// never reusing a prior attempt's stale snapshot.
const MAX_TOKEN_WRITE_ATTEMPTS = 3;

// Thrown INSIDE an attempt's transaction body when the in-tx
// re-plan's jti SET diverges from the pre-formed writes' jti set
// — a concurrent sibling wrote between this attempt's pre-tx read
// and its transaction opening. The throw aborts the attempt's
// transaction (the backends' proven abort path: a thrown body
// never flushes); the retry loops below catch ONLY this class and
// retry — any other throw (a store fault, a validation error) is
// a real failure and must surface, never be mistaken for
// contention.
class TokenPlanDivergedError extends Error {}

// Thrown when rotation's OR revocation's retry budget exhausts
// with every attempt diverging — sustained, adversarial
// contention, not a normal outcome. Rotation has a clean
// non-throwing failure vocabulary already (RotationOutcome
// 'fail', the 409) and uses it instead; revocation has none —
// silently returning as though the revocation completed would
// leave an unrevoked jti live, a Commandment II hole — so it
// throws this.
class TokenWriteRetriesExhaustedError extends Error {}

// The outcome of an atomic rotation attempt. 'rotate' carries
// the successor jti; 'fail' covers reuse and unknown — on
// reuse the whole chain's revocation has already landed in
// the same transaction.
export type RotationOutcome =
    | { readonly kind: 'rotate'; readonly newJti: string }
    | { readonly kind: 'fail' };

// One rotation attempt's PRE-TX groundwork: the presented
// jti's document (happy path: latest action issued or
// unknown), else the identity's tokens collection (replay),
// the provisional plan (planRotation, bytes unchanged), and a
// pre-minted row id + event pair for whichever appends that plan
// carries. `newJti` is the ONE value that survives every attempt
// unchanged (Step 0: the rotation route pre-mints it in its own
// response spec and threads it back via messagePairResponseBody, so
// re-minting it here would desync the wire response from what
// commits); the chain id is READ, not minted, so it too stays
// consistent attempt to attempt — only row ids and `at` are
// genuinely fresh per attempt.
async function planRotationAttempt(
    adapter: DbAdapter,
    identityId: Id,
    presentedJti: string,
    newJti: string,
    operationId: string,
    requestId: string,
): Promise<{
    readonly plan: RotationPlan;
    readonly writes: readonly TokenEventWrite[];
}> {
    const events = await deriveIdentityTokenEventsForJti(
        adapter, presentedJti, identityId,
    );
    const latest = latestActionForJti(
        events, presentedJti,
    );
    const rows = latest === 'issued' || latest === null
        ? events
        : (await readTokenChainFromLedger(
            adapter, identityId, presentedJti,
        )).rows;
    const plan = planRotation(
        rows, presentedJti, newJti, nowUtc(),
    );
    const appends = plan.kind === 'unknown' ? [] : plan.appends;
    return {
        plan,
        writes: await formTokenEventWrites(
            appends, operationId, requestId,
        ),
    };
}

// Read the token ledger, plan the rotation, and append its
// events (plus their own event pairs) in ONE transaction — a
// concurrent reuse of the same jti can not double-rotate. Shared
// by the refresh grant and the POST identity-tokens/:jti/rotation
// route: one truth for the atomic rotate. `messagePair` is
// optional and appends as the LAST act, ONLY on the
// 'rotate' branch — a 409
// (reuse or unknown) stores no OPERATION message pair even
// though the reuse branch still revokes the chain for real.
// The route is REPLAY_EXEMPT_ROUTE_PATTERNS-wired
// (message-pair.ts / api.ts): the gate never serves a stored
// response for a byte-identical resend of this route, so a
// resent reuse attempt genuinely re-enters this function and
// re-fails 409 — this function's own re-check IS the guard
// the exemption relies on; it must stay live on every call.
//
// PRE-FORM + IN-TX VERIFY-OR-RETRY (Phase 13 Task 5, Gate 7): the
// pre-tx plan above is provisional — a concurrent sibling can
// still land between that read and this transaction opening. The
// in-tx body RE-READS and RE-PLANS from scratch, then compares
// the FULL re-planned jti SET against the pre-formed writes' jti
// set — never `kind` alone (two 'replay' plans can carry
// DIFFERENT append sets if a sibling rotation grew the chain
// between reads). Equal → commit the PRE-TX-prepared writes
// in this same transaction (never the fresh re-plan's own
// appends: its `at` would desync the already-formed event
// pairs' stored messages from the rows they describe — its
// ONLY job is the equality check). The re-read and the
// statement share the client, so the next rotation observes
// this write. Diverged → abort and retry fresh. The view is
// openClient, so a row that does not land still fails the
// body.
export async function rotateRefreshJti(
    adapter: DbAdapter,
    identityId: Id,
    presentedJti: string,
    newJti: string,
    messagePair?: MessagePair,
): Promise<RotationOutcome> {
    const operationId = messagePair?.operationId
        ?? generateIdentifier();
    const requestId = messagePair?.requestId
        ?? generateIdentifier();
    const backed = backedWrite(adapter);
    for (
        let attempt = 0;
        attempt < MAX_TOKEN_WRITE_ATTEMPTS;
        attempt++
    ) {
        const provisional = await planRotationAttempt(
            adapter, identityId, presentedJti, newJti,
            operationId, requestId,
        );
        try {
            await backed.backend.transaction(
                'readwrite',
                async (tx) => {
                    const view = backed.openClient(tx);
                    const events =
                        await deriveIdentityTokenEventsForJti(
                            view, presentedJti, identityId,
                        );
                    const latest = latestActionForJti(
                        events, presentedJti,
                    );
                    const rows =
                        latest === 'issued'
                            || latest === null
                            ? events
                            : (await readTokenChainFromLedger(
                                view, identityId,
                                presentedJti,
                            )).rows;
                    const freshPlan = planRotation(
                        rows, presentedJti, newJti,
                        nowUtc(),
                    );
                    const freshAppends =
                        freshPlan.kind === 'unknown'
                            ? [] : freshPlan.appends;
                    if (!jtiSetsEqual(
                        freshAppends.map(a => a.jti),
                        provisional.writes.map(
                            w => w.event.jti,
                        ),
                    )) {
                        throw new TokenPlanDivergedError();
                    }
                    const pairs = provisional.writes.map(
                        (write) => write.messagePair,
                    );
                    if (
                        provisional.plan.kind === 'rotate'
                        && messagePair !== undefined
                    ) {
                        pairs.push(messagePair);
                    }
                    if (pairs.length > 0) {
                        await runWrite(
                            view, attemptFor(pairs), pairs,
                        );
                    }
                },
            );
            if (provisional.plan.kind === 'rotate') {
                return {
                    kind: 'rotate' as const,
                    newJti: provisional.plan.newJti,
                };
            }
            return { kind: 'fail' as const };
        } catch (e) {
            if (!(e instanceof TokenPlanDivergedError)) {
                throw e;
            }
        }
    }
    return { kind: 'fail' as const };
}

// Rotation opens the client beneath the adapter. A view
// has no backend of its own; callers pass the backed
// adapter the route already holds.
function backedWrite(
    adapter: DbAdapter,
): {
    readonly backend: StorageBackend;
    readonly openClient: (tx: Tx) => DbAdapter;
} {
    if (
        !('backend' in adapter)
        || !('openClient' in adapter)
    ) {
        throw new Error(
            'token write requires a backed adapter',
        );
    }
    return adapter as DbAdapter & {
        backend: StorageBackend;
        openClient: (tx: Tx) => DbAdapter;
    };
}

// One revocation attempt's PRE-TX groundwork: the provisional
// read — FLIPPED onto readTokenChainFromLedger (Phase 13 Task 6)
// — + revocationAppends' plan (bytes unchanged) + a pre-minted
// row id and event pair per append. An unknown jti (no chain in
// this identity's collection) plans zero appends — the SAME
// no-op shape revokeTokenChain has always handed an unknown jti.
async function planRevocationAttempt(
    adapter: DbAdapter,
    identityId: Id,
    jti: string,
    operationId: string,
    requestId: string,
): Promise<{
    readonly writes: readonly TokenEventWrite[];
}> {
    const { chainId, rows } = await readTokenChainFromLedger(
        adapter, identityId, jti,
    );
    const appends = chainId === null
        ? []
        : revocationAppends(rows, chainId, identityId, nowUtc());
    return {
        writes: await formTokenEventWrites(
            appends, operationId, requestId,
        ),
    };
}

// Revoke every jti in the chain `jti` belongs to (logging out
// one session). Read and appends ride the same transaction, so
// a concurrent rotation cannot slip a fresh successor past the
// revoke. A no-op for an unknown jti — `messagePair` still
// appends on BOTH exit paths (the claim-op precedent: a
// 2xx no-op is not a failure).
//
// PRE-FORM + IN-TX VERIFY-OR-RETRY (Phase 13 Task 5, Gate 7 — see
// rotateRefreshJti's own comment for the full mechanism). The
// jti-SET equality check is THIS function's own BLOCKING fix
// (Author gate 4, lens-2): a concurrent sibling rotation can grow
// the chain between the pre-tx and in-tx reads, so committing the
// stale pre-formed set would leave the new jti UNREVOKED.
// revocationAppends is NOT idempotent (jtisInChain re-emits every
// jti on every call) — the retry's re-plan on a genuinely
// unchanged chain reproduces the SAME jti set (equal → proceed)
// even though a wholly separate THIRD call would re-emit fresh
// rows again; that non-idempotency is a named, pre-existing
// property this task mirrors, not one it introduces (watch-point
// e). Retry exhaustion throws (see TokenWriteRetriesExhaustedError
// above) — never a silent, incomplete success.
export async function revokeTokenChain(
    adapter: DbAdapter,
    identityId: Id,
    jti: string,
    messagePair?: MessagePair,
): Promise<void> {
    const operationId = messagePair?.operationId
        ?? generateIdentifier();
    const requestId = messagePair?.requestId
        ?? generateIdentifier();
    for (
        let attempt = 0;
        attempt < MAX_TOKEN_WRITE_ATTEMPTS;
        attempt++
    ) {
        const provisional = await planRevocationAttempt(
            adapter, identityId, jti, operationId, requestId,
        );
        try {
            await adapter.readTransaction(async (view) => {
                const { chainId, rows } =
                    await readTokenChainFromLedger(
                        view, identityId, jti,
                    );
                const freshAppends =
                    chainId === null
                        ? []
                        : revocationAppends(
                            rows, chainId, identityId,
                            nowUtc(),
                        );
                if (!jtiSetsEqual(
                    freshAppends.map(a => a.jti),
                    provisional.writes.map(w => w.event.jti),
                )) {
                    throw new TokenPlanDivergedError();
                }
            });
            const pairs = provisional.writes.map(
                (write) => write.messagePair,
            );
            if (messagePair !== undefined) {
                pairs.push(messagePair);
            }
            if (pairs.length > 0) {
                await runWrite(
                    adapter, attemptFor(pairs), pairs,
                );
            }
            return;
        } catch (e) {
            if (!(e instanceof TokenPlanDivergedError)) throw e;
        }
    }
    throw new TokenWriteRetriesExhaustedError(
        'revocation retry attempts exhausted for jti: ' + jti,
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
    seed: AuthMessagePairSeed,
    request: Request,
): Promise<TokenResult> {
    const token = refreshTokenFromCookieHeader(
        request.headers.get('cookie'),
    );
    const now = nowEpochSeconds();
    const verified = await verifyAccessToken(token, now);
    if (!verified.valid) {
        return failure(
            HTTP_UNAUTHORIZED, 'invalid refresh token: ' + verified.reason,
        );
    }
    const refreshRev = await tokenRevocationReason(
        adapter, verified.claims.sub,
        verified.claims.iat, verified.claims.jti,
    );
    if (refreshRev !== null) {
        return failure(HTTP_UNAUTHORIZED, refreshRev);
    }
    const claims = await subjectClaims(
        adapter, verified.claims.sub,
    );
    const organization =
        typeof body.organization === 'string'
            ? body.organization
            : '';
    if (organization !== '') {
        if (!claims.organizations.includes(
            organization,
        )) {
            return failure(
                HTTP_FORBIDDEN,
                'subject is not a member of'
                    + ' the organization',
            );
        }
    }
    const newJti = generateIdentifier();
    const name = await nameFor(adapter, verified.claims.sub);
    const minted = await mintPair(
        verified.claims.sub, name, newJti,
        undefined, {
            organizations: claims.organizations,
            roles: claims.roles,
            ...(organization !== ''
                ? { organization }
                : {}),
        },
    );
    const response = minted.response;
    const messagePair = await formAuthMessagePair(
        seed, body, verified.claims.sub,
        publicTokenBody(response),
        seed.operationId, seed.requestId,
        tokenAnswerFields(
            response.access_token,
            refreshSetCookie(
                minted.refreshToken, request,
            ),
        ),
    );
    const outcome = await rotateRefreshJti(
        adapter, verified.claims.sub, verified.claims.jti,
        newJti, messagePair,
    );
    if (outcome.kind === 'rotate') {
        return {
            ok: true,
            response,
            refreshToken: minted.refreshToken,
            messagePairId: messagePair.id,
            wire: ownWireOf(messagePair),
        };
    }
    return failure(HTTP_UNAUTHORIZED, 'refresh token reuse or unknown');
}

// token-exchange (RFC 8693): mint a delegated token where sub =
// the subject and act = the acting party. Both tokens are
// VERIFIED (signature/exp/nbf/aud). Subject equals actor is
// checked next — a cross-party exchange 403s before any
// revocation check. Same-string tokens share one revocation
// check; distinct strings with equal sub check both jtis.
// DELEGATION POLICY: self-delegation ONLY (subject === actor).
// A cross-party exchange has no delegation ledger to authorize
// act-as, so it fails closed — 403, minting nothing — until
// that ledger lands with the server tier.
// The claim shape (sub, act.sub) is frozen now.
async function grantTokenExchange(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed | undefined,
    authorization: string | null,
): Promise<TokenResult> {
    const presented = bearerCredential(authorization);
    const subjectToken = presented;
    const actorToken = presented;
    const now = nowEpochSeconds();
    const sameToken = subjectToken === actorToken;
    const subjectV = await verifyAccessToken(
        subjectToken, now,
    );
    const actorV = sameToken
        ? subjectV
        : await verifyAccessToken(actorToken, now);
    if (!subjectV.valid || !actorV.valid) {
        return failure(
            HTTP_UNAUTHORIZED,
            'token-exchange needs valid'
                + ' subject/actor tokens',
        );
    }
    const subject = subjectV.claims.sub;
    const actor = actorV.claims.sub;
    if (subject !== actor) {
        return failure(
            HTTP_FORBIDDEN,
            'token-exchange is limited to'
                + ' self-delegation'
                + ' (subject must equal actor)',
        );
    }
    const subjectRev = await tokenRevocationReason(
        adapter, subjectV.claims.sub,
        subjectV.claims.iat, subjectV.claims.jti,
    );
    if (subjectRev !== null) {
        return failure(HTTP_UNAUTHORIZED, subjectRev);
    }
    if (!sameToken) {
        const actorRev = await tokenRevocationReason(
            adapter, actorV.claims.sub,
            actorV.claims.iat, actorV.claims.jti,
        );
        if (actorRev !== null) {
            return failure(
                HTTP_UNAUTHORIZED, actorRev,
            );
        }
    }
    const claims = await subjectClaims(
        adapter, subject,
    );
    const organization =
        typeof body.organization === 'string'
            ? body.organization
            : '';
    if (organization !== '') {
        if (!claims.organizations.includes(organization)) {
            return failure(
                HTTP_FORBIDDEN,
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
        claims,
    );
    return {
        ok: true,
        response: issued.response,
        refreshToken: issued.refreshToken,
        messagePairId: issued.messagePairId,
        wire: issued.wire,
    };
}

// The facade's self-delegation: a caller exchanges its own
// bearer for a token scoped to `org` (subject == actor == the
// caller). Returns 403, minting nothing, when the caller is
// not a member — the gate's tenant fence. This is an INTERNAL
// hop, never a real
// /authentication/token request, so it supplies no seed —
// issueTokenPair forms no AUTH pair for it, exactly as before
// Task 3. Its issued root STILL gets its own event pair (Phase
// 13 Task 5): the row is written either way, so the ledger
// visibility the event pair grants must too.
export async function exchangeBearerForOrganization(
    adapter: DbAdapter,
    bearer: string,
    organization: Id,
): Promise<TokenResult> {
    return grantTokenExchange(
        adapter,
        { organization },
        undefined,
        'Bearer ' + bearer,
    );
}

// client_credentials via private_key_jwt: a headless client
// authenticates as itself. The client_assertion is REALLY
// verified — JWS signature against the client's registered
// JWKS (RS256/ES256, WebCrypto) plus the RFC 7523 claim
// checks, in api/client-assertion.ts. A spent-jti ticket
// rides the same transaction as the grant and token-event
// pairs — replay is 401 invalid_grant, nothing minted.
// The token's sub is the client id (a service principal).
async function grantClientCredentials(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed,
    request: Request,
): Promise<TokenResult> {
    const clientId = typeof body.client_id === 'string'
        ? body.client_id
        : '';
    const assertion = bearerCredential(
        request.headers.get('authorization'),
    );
    // FLIPPED (clients elimination): the registration facet
    // derive replaces the raw clients row read. An absent OR
    // tombstoned facet ≡ the old null row -> the same 401
    // 'unknown client'; any other fault surfaces (500).
    let client: ClientRegistrationEntity;
    try {
        client = await deriveClientRegistration(
            adapter, clientId,
        );
    } catch (e) {
        if (e instanceof EntityNotFoundError) {
            return failure(
                HTTP_UNAUTHORIZED, 'unknown client',
            );
        }
        throw e;
    }
    if (client.status !== 'active') {
        return failure(HTTP_UNAUTHORIZED, 'client is disabled');
    }
    if (!client.grant_types.split(' ')
        .includes('client_credentials')) {
        return failure(
            HTTP_BAD_REQUEST, 'client may not use client_credentials',
        );
    }
    const verdict = await verifyClientAssertion(
        assertion, client,
        nowEpochSeconds(),
    );
    if (!verdict.valid) {
        return failure(
            HTTP_UNAUTHORIZED,
            'invalid client_assertion: ' + verdict.reason,
        );
    }
    const replay: TokenResult = failure(
        HTTP_UNAUTHORIZED, 'invalid_grant',
    );
    const name = await nameFor(adapter, clientId);
    const refreshJti = generateIdentifier();
    const chainId = generateIdentifier();
    const at = nowUtc();
    const claims = await subjectClaims(adapter, clientId);
    const minted = await mintPair(
        clientId, name, refreshJti, undefined, {
            organizations: claims.organizations,
            roles: claims.roles,
        },
    );
    const response = minted.response;
    const messagePair = await formAuthMessagePair(
        seed, body, clientId, publicTokenBody(response),
        seed.operationId, seed.requestId,
        tokenAnswerFields(
            response.access_token,
            refreshSetCookie(
                minted.refreshToken, request,
            ),
        ),
    );
    const eventMessagePair = await formTokenEventMessagePair(
        refreshJti, {
            jti: refreshJti, identity_id: clientId,
            action: 'issued', chain_id: chainId, at,
        }, messagePair.operationId, messagePair.requestId,
    );
    const ticketBody = { exp: verdict.exp };
    const ticketMessagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/authentication/assertion-jtis/'
            + verdict.jti,
        routePattern:
            'authentication/assertion-jtis/:jti',
        routeSegments: [
            'authentication', 'assertion-jtis', ':jti',
        ],
        pathSegments: [
            'authentication', 'assertion-jtis',
            verdict.jti,
        ],
        headerFields: [],
        body: ticketBody,
        requesterIdentityId: clientId,
        requestAt: at,
        organization: undefined,
        responseBody: ticketBody,
        operationId: messagePair.operationId,
        requestId: messagePair.requestId,
    });
    const existing = await adapter.readTransaction(
        async (view) => messageStore(view).getDocumentHead(
            '/authentication/assertion-jtis/',
            verdict.jti,
        ),
    );
    if (existing !== null) return replay;
    const pairs = [
        ticketMessagePair,
        eventMessagePair,
        messagePair,
    ];
    const written = await runWrite(
        adapter, attemptFor(pairs), pairs,
    );
    return written.outcome === 'land'
        ? {
            ok: true,
            response,
            refreshToken: minted.refreshToken,
            messagePairId: messagePair.id,
            wire: ownWireOf(messagePair),
        }
        : replay;
}

// GATE 3: the presented code's sha256 digest, pre-tx always —
// formed pre-tx — crypto, hashing, and timers never run inside
// an open transaction (AGENTS.md § Transaction bodies await
// only row ops). It names the spend marker document at
// /identities/<id>/authorization-codes/:hash, not the issued
// token event (named by its jti). authorizeCodeIssuer matches
// the LIVE code against the authorize response family's stored
// `code` field (pairs are stored verbatim).
export async function deriveAuthorizationCodeId(
    code: string,
): Promise<string> {
    return sha256Hex(code);
}

const AUTHORIZE_PREFIX =
    canonicalPath(undefined, '/authentication/authorize/');

function authorizationCodesPrefixFor(
    identityId: Id,
): string {
    return canonicalPath(
        undefined,
        '/identities/' + identityId
            + '/authorization-codes/',
    );
}

// A stored message's JSON body — the ONE local decode this file
// needs for both the request and response side of the authorize
// scan below. derive-documents.ts's requestBodyOf and derive-
// identity-spine.ts's responseBodyOf already do these identical
// three lines, each private to its own module; a third copy here
// stays below the exploratory-duplication threshold (Commandment
// IX) rather than forcing a shared extraction across three
// unrelated modules for a task that touches only this one.
function decodedBodyOf(message: string): Record<string, unknown> {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

interface AuthorizeCodeIssuer {
    readonly identityId: Id;
    readonly clientId: Id;
    readonly issuedAt: string;
    // Present only when authorize request carried
    // code_challenge (PKCE S256). Absent means the client
    // never sent one — grant skips verifier check so the
    // password-loop demo keeps working without PKCE.
    readonly codeChallenge?: string;
}

// PRE-TX (i), gate 3: the code -> identity/client point-match
// over the WHOLE '/authentication/authorize/' response family.
// That path holds operation documents (name always ''), so no
// per-name head reduction applies here — deriveDocumentsAt's
// latest-per-name would wrongly collapse every distinct code's
// pair down to a single latest one. Every stored pair at this
// prefix is a genuine 2xx: authorizePassword forms a pair ONLY on
// success (grant-first, pinned), so no status re-check is needed.
// A miss — no stored pair's response `code` field equals the
// presented code — returns null; the caller's 401 is
// byte-identical whether the code was never issued or has already
// been spent (authorizationCodeSpent decides that, second).
async function authorizeCodeIssuer(
    adapter: DbAdapter,
    code: string,
): Promise<AuthorizeCodeIssuer | null> {
    const pairs = await adapter.messagePairs
        .getCollectionPairs(AUTHORIZE_PREFIX);
    let messagePair: MessagePairEntity | undefined;
    for (const pair of pairs) {
        if (codeFromSecret(pair.secret) === code) {
            messagePair = pair;
            break;
        }
    }
    if (messagePair === undefined) return null;
    const requestBody = decodedBodyOf(messagePair.request);
    // code_challenge is optional on authorize (PKCE only when
    // the client sent one). Soft read — pickString would throw
    // on the password-loop path that omits it.
    const challenge = requestBody.code_challenge;
    const codeChallenge =
        typeof challenge === 'string' && challenge !== ''
            ? challenge
            : undefined;
    return {
        identityId: messagePair.requester_identity_id,
        clientId: pickString(requestBody, 'client_id'),
        // Issue instant is the authorize pair's response
        // stamp. The pair is already fetched for
        // identity and client.
        issuedAt: messagePair.response_at,
        ...(codeChallenge !== undefined
            ? { codeChallenge }
            : {}),
    };
}

// PRE-TX (ii) fast-fail AND the in-tx re-check share this ONE
// function — adapter-shaped (the membershipExistsFor /
// deriveIdentityTokenEventsForJti precedent), `dbOrView` is
// whichever face is in scope: the plain adapter pre-tx, the
// open transaction view in-tx. A genuine marker already lives
// at identities/<identityId>/authorization-codes/<derivedId>
// exactly when this code has been spent. Marker-first append
// so a crash after the marker still fails a replay closed.
export async function authorizationCodeSpent(
    dbOrView: DbAdapter,
    derivedId: Id,
    identityId: Id,
): Promise<boolean> {
    const spent = await dbOrView.messagePairs
        .getDocumentHistory(
            authorizationCodesPrefixFor(identityId),
            derivedId,
        );
    return spent.length > 0;
}

// authorization_code grant: consume an ISSUED code, then issue a
// token pair. A consumed (replay), raced, or unknown code is a
// clean 401 that mints nothing and appends nothing (grant-first).
// PRE-tx: authorizeCodeIssuer resolves (identity, client) from the
// matched authorize pair, then authorizationCodeSpent fast-fails
// an already-spent code — both before mintPair's HMAC signing or
// formAuthMessagePair/formTokenEventMessagePair's hashing run. Then ONE
// tx RE-RUNS the spend check on the OPEN VIEW: a concurrent
// consumer may have won the race between the pre-tx read and
// here, in which case this call aborts (401, mints nothing
// further, appends nothing — the pre-minted response and pairs
// above are simply discarded, wasted crypto on the losing side of
// the race) exactly as the retired codeState-driven version did.
async function grantAuthorizationCode(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed,
    request: Request,
): Promise<TokenResult> {
    const basic = parseBasic(
        request.headers.get('authorization'),
    );
    const code = basic === null ? '' : basic.userId;
    const verifier = basic === null
        ? ''
        : basic.password;
    const invalid: TokenResult = failure(
        HTTP_UNAUTHORIZED, 'invalid or used authorization code',
    );
    const derivedId = await deriveAuthorizationCodeId(code);
    const issuer = await authorizeCodeIssuer(adapter, code);
    if (issuer === null) return invalid;
    if (
        msSinceUtc(issuer.issuedAt)
        >= AUTHORIZATION_CODE_TTL_SECONDS * MS_PER_SECOND
    ) {
        return invalid;
    }
    // Bind the code to the client that issued it (OAuth 2.1
    // §4.1.3): redeeming client_id must match authorize's.
    // Absent or wrong client_id is the same shared 401 as
    // unknown/spent/expired — grant-first, no mint.
    const redeemingClientId =
        typeof body.client_id === 'string'
            ? body.client_id
            : '';
    if (redeemingClientId !== issuer.clientId) {
        return invalid;
    }
    // PKCE S256 (RFC 7636): when authorize stored a
    // code_challenge, require code_verifier and verify
    // base64url(sha256(verifier)) === challenge. Missing or
    // mismatch is the same shared 401. No challenge stored
    // preserves pre-PKCE redeem (password-loop demo).
    if (issuer.codeChallenge !== undefined) {
        if (verifier === '') return invalid;
        const derived = bytesToBase64Url(
            await sha256Bytes(verifier),
        );
        if (derived !== issuer.codeChallenge) {
            return invalid;
        }
    }
    if (await authorizationCodeSpent(
        adapter, derivedId, issuer.identityId,
    )) {
        return invalid;
    }
    const refreshJti = generateIdentifier();
    const chainId = generateIdentifier();
    const at = nowUtc();
    const name = await nameFor(adapter, issuer.identityId);
    const claims = await subjectClaims(
        adapter, issuer.identityId,
    );
    // act.sub = the acting client (RFC 8693), mirroring
    // grantTokenExchange's own act:{sub: actor}. sub stays
    // the user; issuer.clientId is already verified equal to
    // the redeeming client_id above.
    const minted = await mintPair(
        issuer.identityId, name, refreshJti,
        { sub: issuer.clientId }, {
            organizations: claims.organizations,
            roles: claims.roles,
        },
    );
    const response = minted.response;
    const messagePair = await formAuthMessagePair(
        seed, body, issuer.identityId,
        publicTokenBody(response),
        seed.operationId, seed.requestId,
        tokenAnswerFields(
            response.access_token,
            refreshSetCookie(
                minted.refreshToken, request,
            ),
        ),
    );
    // Marker and issued event formed pre-tx against
    // `issuer.identityId` — a code's issuer cannot change
    // between the pre-tx read and the in-tx write below (its
    // own authorize pair is immutable once appended).
    const markerMessagePair =
        await formAuthorizationCodeMarkerPair(
            derivedId, refreshJti, issuer.identityId, at,
            messagePair.operationId, messagePair.requestId,
        );
    const eventMessagePair = await formTokenEventMessagePair(
        refreshJti, {
            jti: refreshJti, identity_id: issuer.identityId,
            action: 'issued', chain_id: chainId, at,
        }, messagePair.operationId, messagePair.requestId,
    );
    // The spend check and the marker write share one
    // client. A later grant then observes the marker and
    // 401s, instead of both reading unspent and both
    // minting. openClient still fails a row that does
    // not land.
    const backed = backedWrite(adapter);
    const spent = await backed.backend.transaction(
        'readwrite',
        async (tx) => {
            const view = backed.openClient(tx);
            if (await authorizationCodeSpent(
                view, derivedId, issuer.identityId,
            )) {
                return true;
            }
            const pairs = [
                markerMessagePair,
                eventMessagePair,
                messagePair,
            ];
            await runWrite(
                view, attemptFor(pairs), pairs,
            );
            return false;
        },
    );
    if (spent) return invalid;
    return {
        ok: true,
        response,
        refreshToken: minted.refreshToken,
        messagePairId: messagePair.id,
        wire: ownWireOf(messagePair),
    };
}

// Dispatch on grant_type. Single-grant primitives are added one
// per commit; an unsupported grant is a clean 400 with no side
// effects. `seed` seeds every grant's own pair — see
// AuthMessagePairSeed and api.ts's dedicated authentication arm.
export async function postToken(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed,
    request: Request,
): Promise<TokenResult> {
    const ridden = credentialRides(body);
    if (ridden !== null) {
        return failure(HTTP_BAD_REQUEST, ridden);
    }
    const grantType = typeof body.grant_type === 'string'
        ? body.grant_type
        : '';
    switch (grantType) {
        case 'authorization_code':
            return grantAuthorizationCode(
                adapter, body, seed, request,
            );
        case 'refresh':
            return grantRefresh(
                adapter, body, seed, request,
            );
        case 'token-exchange':
            return grantTokenExchange(
                adapter, body, seed,
                request.headers.get('authorization'),
            );
        case 'client_credentials':
            return grantClientCredentials(
                adapter, body, seed, request,
            );
        default:
            return failure(
                HTTP_BAD_REQUEST, 'unsupported grant_type: ' + grantType,
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
        readonly messagePairId: string;
        readonly wire: Response | undefined;
    }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: string;
    };

// The identity that owns an email login (null if none).
// Exported so tests/drift-identities.test.ts can prove the
// derived-plane pii rows resolve the SAME identity id this
// reducer would resolve from the row plane — the reducer's own
// bytes are unchanged either way (Phase 13 Task 8).
export function identityByEmail(
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
// issue an authorization code bound to (identity, client). A
// request that lacks S256 is a 400 request fault, no pair.
// Every credential failure returns the SAME 401 (no user
// enumeration) and appends nothing — grant-first, no-op on
// failure. The code is recorded PAIR-ONLY (Phase 13 Task 9:
// the row half retires here — nothing has read
// authorization_codes rows since Task 7). The stored pair
// holds the request and response verbatim (password, code,
// and all) — accepted dev-tier plaintext ledger cost.
async function authorizePassword(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed,
    request: Request,
): Promise<AuthorizeResult> {
    const challenge =
        typeof body.code_challenge === 'string'
            ? body.code_challenge
            : '';
    const method =
        typeof body.code_challenge_method === 'string'
            ? body.code_challenge_method
            : '';
    if (challenge === '' || method !== 'S256') {
        return {
            ok: false,
            status: HTTP_BAD_REQUEST,
            error: 'S256 code_challenge is required',
        };
    }
    const basic = parseBasic(
        request.headers.get('authorization'),
    );
    const username = basic === null ? '' : basic.userId;
    const password = basic === null ? '' : basic.password;
    const denied: AuthorizeResult = {
        ok: false, status: HTTP_UNAUTHORIZED, error: 'invalid credentials',
    };
    // FLIPPED (Phase 13 Task 8): the row source is
    // deriveIdentityPiiRows (derive-identity-spine.ts) — one
    // identities collection read plus one PII document read
    // per identity (spec 2026-09-15 § 3), never the whole
    // ledger. Email carries no dedicated index either plane,
    // so the match is still found by walking every live slot.
    // identityByEmail (the reducer) is BYTE-UNCHANGED.
    const piiRows = await deriveIdentityPiiRows(adapter);
    const identityId = identityByEmail(piiRows, username);
    if (identityId === null) {
        await equalizeFailureTiming(password);
        return denied;
    }
    // FLIPPED (Phase 13 Task 8): deriveCredentialsFor reads the
    // identity's own /credentials prefix — a targeted, identity-
    // keyed read, never a full-ledger scan — carrying full rows
    // (secret included, gate 16's role-grants-only deviation does
    // not apply here). currentPasswordSecret (the reducer) is
    // BYTE-UNCHANGED — only the row source moves.
    const credRows = await deriveCredentialsFor(adapter, identityId);
    const secret =
        currentPasswordSecret(credRows, identityId);
    if (secret === null) {
        await equalizeFailureTiming(password);
        return denied;
    }
    if (!(await verifyPassword(password, secret))) {
        return denied;
    }
    const code = generateSecret();
    const response: AuthorizeResponse = { code };
    const messagePair = await formAuthMessagePair(
        seed, body, identityId, undefined,
        seed.operationId, seed.requestId,
        [{
            name: 'authentication-info',
            value: quotedAuthParam('code', code),
        }],
    );
    let rehashMessagePair: MessagePair | undefined;
    if (secret.startsWith('$pbkdf2-sha256$')) {
        const at = nowUtc();
        const cid = generateIdentifier();
        const hashed = await hashPassword(password);
        const credBody: Record<string, unknown> = {
            identity_id: identityId,
            kind: 'password',
            status: 'set',
            secret: hashed,
            at,
        };
        rehashMessagePair = await formWriteMessagePair({
            method: 'PUT',
            pathname: '/identities/' + identityId
                + '/credentials/' + cid,
            routePattern:
                'identities/:id/credentials/:cid',
            routeSegments: [
                'identities', ':id', 'credentials', ':cid',
            ],
            pathSegments: [
                'identities', identityId,
                'credentials', cid,
            ],
            headerFields: [],
            body: credBody,
            requesterIdentityId: identityId,
            requestAt: at,
            organization: undefined,
            responseBody: {
                id: cid,
                ...validateIdentityCredentialEntity(
                    credBody,
                ),
            },
            operationId: messagePair.operationId,
            requestId: messagePair.requestId,
        });
    }
    const pairs = rehashMessagePair === undefined
        ? [messagePair]
        : [rehashMessagePair, messagePair];
    await runWrite(
        adapter, attemptFor(pairs), pairs,
    );
    return {
        ok: true,
        response,
        messagePairId: messagePair.id,
        wire: ownWireOf(messagePair),
    };
}

// Interactive front door. The password loop is real; passkey,
// provider-IdP, and corporate-OIDC are documented 501 SEAMS —
// the real ceremony lands with the server tier.
export async function postAuthorize(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthMessagePairSeed,
    request: Request,
): Promise<AuthorizeResult> {
    const ridden = credentialRides(body);
    if (ridden !== null) {
        return {
            ok: false,
            status: HTTP_BAD_REQUEST,
            error: ridden,
        };
    }
    const method = typeof body.method === 'string'
        ? body.method
        : '';
    switch (method) {
        case 'password':
            return authorizePassword(
                adapter, body, seed, request,
            );
        case 'passkey':
        case 'provider':
        case 'oidc':
            return {
                ok: false, status: HTTP_NOT_IMPLEMENTED,
                error: method + ' auth is a server-tier seam',
            };
        default:
            return {
                ok: false, status: HTTP_BAD_REQUEST,
                error: 'unsupported method: ' + method,
            };
    }
}
