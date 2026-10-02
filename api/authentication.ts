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
    byAtThenIdAscending,
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
} from '../shared/types.ts';
import {
    pickString,
    validateIdentityCredentialEntity,
} from './validators.ts';
import { bodyOf } from './derive-documents.ts';
import {
    planRotation,
    isTokenRevoked,
    chainIdForJti,
    revocationAppends,
    jtiSetsEqual,
} from '../shared/identity-tokens.ts';
import type { RotationPlan } from '../shared/identity-tokens.ts';
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
    canonicalPath,
    documentHeadAt,
    formStateWrite,
    formWriteMessagePair,
    landStateWrite,
    runStateWrite,
    runWrite,
    ownWireOf,
    formAuthMessagePair,
} from './message-pair.ts';
import type {
    AuthMessagePairSeed,
    MessagePair,
    ParentSibling,
    SiblingContext,
    StateAnswerKind,
    StateSibling,
    StateWrite,
    WriteAnswer,
} from './message-pair.ts';
import {
    deriveMembershipsForIdentity,
    membershipExistsFor,
} from './derive-memberships.ts';
import { membershipsOfIdentity } from './memberships.ts';
import {
    deriveCredentialsFor,
    deriveClientRegistration,
    deriveIdentityPii,
    deriveIdentityPiiRows,
    deriveTokenRevocationsFor,
} from './derive-identity-spine.ts';
import {
    IDENTITY_TOKENS_TABLE,
    tokenHeadFor,
    tokenHeadsFor,
    type TokenHead,
} from './derive-identity-tokens.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_CONFLICT,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_NOT_IMPLEMENTED,
} from '../shared/http-errors.ts';

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
// one `{type}:{organization_id}` per accepted membership.
// Source of the token's `orgs` claim and the exchange's
// member-check. Mint-time only — the gate reads claims.
export async function subjectClaims(
    adapter: DbAdapter,
    identityId: Id,
): Promise<{
    readonly organizations: Id[];
    readonly roles: string[];
}> {
    const rows = await membershipsOfIdentity(
        adapter, identityId,
    );
    // The name is `<organization>:<identity>`. Equal `at`
    // ties on the organization, which is the chronology
    // already minted from seats.
    rows.sort((left, right) => byAtThenIdAscending(
        { at: left.at, id: left.organization_id },
        { at: right.at, id: right.organization_id },
    ));
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
// chain root. Used by grants that start a session without
// consuming a single-use resource. All crypto (jti generation,
// mintPair's HMAC signing, the pairs' hashing) runs before the
// one statement, which lands the root's issued event beside
// the auth pair when seeded. `seed` is undefined for
// exchangeBearerForOrganization's internal, non-route hop (the
// org-switch facade never was an /authentication/token
// request), so that caller lands its chain root with no AUTH
// pair. A fresh jti cannot be taken, so any answer but a
// landing is a fault.
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
    const issued = tokenSiblingOf({
        jti: refreshJti, identity_id: identityId,
        action: 'issued', chain_id: chainId, at,
    }, []);
    const answer = await runStateWrite(
        adapter,
        messagePair === undefined
            ? {
                kind: 'events',
                context: tokenContextOf(undefined, identityId),
                siblings: [issued],
            }
            : grantWrite(messagePair, [issued]),
    );
    if (answer.outcome !== 'land') {
        throw new Error(
            'a fresh refresh jti was not taken: ' + refreshJti,
        );
    }
    return {
        response,
        refreshToken: minted.refreshToken,
        messagePairId: messagePair?.id,
        wire: messagePair === undefined
            ? undefined
            : ownWireOf(messagePair),
    };
}

// A token event is the next version of its jti's document
// (§6). An issued jti is a handler genesis; a later event
// latches the head its plan read.
function tokenSiblingOf(
    event: Omit<IdentityTokenEntity, 'id'>,
    heads: readonly TokenHead[],
): ParentSibling {
    const path = canonicalPath(
        undefined,
        '/identities/' + event.identity_id + '/tokens/',
    );
    const state = { id: event.jti, ...event };
    if (event.action === 'issued') {
        return {
            method: 'PUT', path, name: event.jti, state,
            condition: { kind: 'genesis', declarer: 'handler' },
        };
    }
    const head = heads.find(
        (candidate) => candidate.entity.jti === event.jti,
    );
    if (head === undefined) {
        throw new Error(
            'a token event has no head to follow: ' + event.jti,
        );
    }
    return {
        method: 'PUT', path, name: event.jti, state,
        condition: { kind: 'in-order', head: head.pairId },
    };
}

// The ids a token write shares: the request's when one
// arrived, else fresh ones stamped now for the token's own
// identity.
function tokenContextOf(
    received: MessagePair | undefined,
    identityId: Id,
): SiblingContext {
    if (received !== undefined) return received;
    return {
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
        requesterIdentityId: identityId,
        requestAt: nowUtc(),
    };
}

// A grant keeps OAuth's response; its documents ride beside
// it, the token event first.
function grantWrite(
    messagePair: MessagePair,
    siblings: readonly [ParentSibling, ...StateSibling[]],
): StateWrite {
    return {
        kind: 'siblings',
        received: messagePair,
        siblings,
        reader: { sees: 'whole' },
        answer: { kind: 'received' },
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
    // The second read is the jti's head: a chain-wide revoke
    // writes a 'revoked' version of every jti, so the
    // presented jti's own head already reflects it.
    const head = await tokenHeadFor(adapter, sub, jti);
    if (head !== null && isTokenRevoked([head.entity], jti)) {
        return 'token chain revoked';
    }
    return null;
}

// The chain a replay rotation and an explicit revocation
// share: one read of the identity's own token heads, filtered
// to the presented jti's chain. A replay and a revocation act
// on every jti the chain holds, so a jti-only read would
// under-revoke. A jti absent from this identity's collection
// is unknown: chainId null, no heads. The refresh grant
// already verified the JWT (claims.sub); the rotation and
// revocation routes carry the identity on their path. Never
// the whole plane (spec 2026-09-15 exact-read folds § 1).
async function readTokenChainFromLedger(
    db: DbAdapter,
    identityId: Id,
    jti: string,
): Promise<{
    readonly chainId: string | null;
    readonly heads: readonly TokenHead[];
}> {
    const collection = await tokenHeadsFor(db, identityId);
    const chainId = chainIdForJti(
        collection.map((head) => head.entity), jti,
    );
    const heads = chainId === null
        ? []
        : collection.filter(
            (head) => head.entity.chain_id === chainId,
        );
    return { chainId, heads };
}

// The retry budget shared by rotation and revocation (the
// doctrine's default): a diverged or refused attempt retries
// wholly fresh — re-reading, re-planning, and re-forming —
// never reusing a prior attempt's stale snapshot.
const MAX_TOKEN_WRITE_ATTEMPTS = 3;

// Thrown INSIDE an attempt's transaction body when the in-tx
// re-read's jti SET differs from the set the formed write
// covers: a concurrent writer grew the chain between the two
// reads, and a jti the write does not latch would escape it.
// The throw aborts the transaction; the loops below catch
// ONLY this class and retry — any other throw is a real
// failure and must surface, never be mistaken for contention.
class TokenPlanDivergedError extends Error {}

// The outcome of a rotation. 'rotate' carries the successor
// jti and the statement's answer; 'fail' covers reuse and
// unknown — on reuse the whole chain's revocation has
// already landed; 'contended' is three attempts that each
// diverged or did not land.
export type RotationOutcome =
    | {
        readonly kind: 'rotate';
        readonly newJti: string;
        readonly answer: WriteAnswer;
    }
    | { readonly kind: 'fail' }
    | { readonly kind: 'contended' };

// The request a rotation answers: the route answers the
// successor's state, the refresh grant OAuth's response.
export type RotationRequest = {
    readonly received: MessagePair;
    readonly answer: StateAnswerKind;
};

// The heads a rotation plans from: the presented jti's own
// head while it is live or unknown, else its whole chain,
// which a replay revokes.
async function rotationHeads(
    db: DbAdapter,
    identityId: Id,
    presentedJti: string,
): Promise<readonly TokenHead[]> {
    const head = await tokenHeadFor(db, identityId, presentedJti);
    if (head === null) return [];
    if (head.entity.action === 'issued') return [head];
    return (await readTokenChainFromLedger(
        db, identityId, presentedJti,
    )).heads;
}

async function planFromHeads(
    db: DbAdapter,
    identityId: Id,
    presentedJti: string,
    newJti: string,
): Promise<{
    readonly plan: RotationPlan;
    readonly heads: readonly TokenHead[];
    readonly jtis: readonly string[];
}> {
    const heads = await rotationHeads(db, identityId, presentedJti);
    const plan = planRotation(
        heads.map((head) => head.entity),
        presentedJti, newJti, nowUtc(),
    );
    const appends = plan.kind === 'unknown' ? [] : plan.appends;
    return {
        plan,
        heads,
        jtis: appends.map((event) => event.jti),
    };
}

// One attempt's groundwork, outside any transaction: the
// plan from heads and a sibling per event it writes. `newJti`
// survives every attempt unchanged; the chain id is read, not
// minted; only `at` and the pairs are fresh per attempt.
async function planRotationAttempt(
    adapter: DbAdapter,
    identityId: Id,
    presentedJti: string,
    newJti: string,
): Promise<{
    readonly plan: RotationPlan;
    readonly jtis: readonly string[];
    readonly siblings: readonly ParentSibling[];
}> {
    const planned = await planFromHeads(
        adapter, identityId, presentedJti, newJti,
    );
    const appends = planned.plan.kind === 'unknown'
        ? []
        : planned.plan.appends;
    return {
        plan: planned.plan,
        jtis: planned.jtis,
        siblings: appends.map(
            (event) => tokenSiblingOf(event, planned.heads),
        ),
    };
}

// A rotation lands the successor's issued version first, as
// the state the route answers, then the presented jti's
// rotated version.
function rotationWrite(
    request: RotationRequest,
    siblings: readonly ParentSibling[],
): StateWrite {
    const successor = siblings.find(
        (sibling) => sibling.condition.kind === 'genesis',
    );
    const presented = siblings.find(
        (sibling) => sibling.condition.kind === 'in-order',
    );
    if (successor === undefined || presented === undefined) {
        throw new Error(
            'a rotation writes a successor and its parent',
        );
    }
    return {
        kind: 'siblings',
        received: request.received,
        siblings: [successor, presented],
        reader: { sees: 'whole' },
        answer: request.answer,
    };
}

// Plan the rotation, form it, and land it in ONE transaction
// that re-reads the heads first — a concurrent reuse of the
// same jti can not double-rotate. Shared by the refresh grant
// and the POST identities/:id/tokens/:jti/rotation route: one
// truth for the atomic rotate. The received pair lands only
// on the 'rotate' branch; a replay lands the chain's
// revocation alone, and an unknown jti lands nothing. The
// gate serves no stored response for a resend, so a resent
// reuse attempt genuinely re-enters this function and
// re-fails — this function's own re-check IS the reuse
// guard; it must stay live on every call.
//
// The write is formed outside the transaction, which awaits
// only row ops (AGENTS.md). Inside it, the heads are read
// again and their jti SET compared with the formed write's —
// never `kind` alone, since two replays can cover different
// sets if a sibling rotation grew the chain between reads.
// Equal lands the formed write; its latches then judge every
// head it read. A diverged set, or a stale or refused
// statement, is a divergence: re-read, re-plan, three
// attempts, then 'contended' (§6). The view is clientOn, so
// the answer, not a thrown error, carries a refusal.
export async function rotateRefreshJti(
    adapter: DbAdapter,
    identityId: Id,
    presentedJti: string,
    newJti: string,
    request?: RotationRequest,
): Promise<RotationOutcome> {
    const backed = backedWrite(adapter);
    const context = tokenContextOf(request?.received, identityId);
    for (
        let attempt = 0;
        attempt < MAX_TOKEN_WRITE_ATTEMPTS;
        attempt++
    ) {
        const provisional = await planRotationAttempt(
            adapter, identityId, presentedJti, newJti,
        );
        const [first, ...rest] = provisional.siblings;
        if (first === undefined) {
            return { kind: 'fail' as const };
        }
        const formed = await formStateWrite(
            provisional.plan.kind === 'rotate'
                && request !== undefined
                ? rotationWrite(request, provisional.siblings)
                : {
                    kind: 'events',
                    context,
                    siblings: [first, ...rest],
                },
        );
        let answer: WriteAnswer;
        try {
            answer = await backed.backend.transaction(
                'readwrite',
                async (tx) => {
                    const view = backed.clientOn(tx);
                    const fresh = await planFromHeads(
                        view, identityId, presentedJti, newJti,
                    );
                    if (!jtiSetsEqual(
                        fresh.jtis, provisional.jtis,
                    )) {
                        throw new TokenPlanDivergedError();
                    }
                    return landStateWrite(view, formed);
                },
            );
        } catch (e) {
            if (!(e instanceof TokenPlanDivergedError)) {
                throw e;
            }
            continue;
        }
        if (answer.outcome !== 'land') {
            continue;
        }
        return provisional.plan.kind === 'rotate'
            ? {
                kind: 'rotate' as const,
                newJti: provisional.plan.newJti,
                answer,
            }
            : { kind: 'fail' as const };
    }
    return { kind: 'contended' as const };
}

// Rotation and revocation open the client beneath the
// adapter. A view has no backend of its own; callers pass the
// backed adapter the route already holds.
function backedWrite(
    adapter: DbAdapter,
): {
    readonly backend: StorageBackend;
    readonly clientOn: (tx: Tx) => DbAdapter;
} {
    if (
        !('backend' in adapter)
        || !('clientOn' in adapter)
    ) {
        throw new Error(
            'token write requires a backed adapter',
        );
    }
    return adapter as DbAdapter & {
        backend: StorageBackend;
        clientOn: (tx: Tx) => DbAdapter;
    };
}

// One revocation attempt's groundwork, outside any
// transaction: the chain's heads and one revoked version per
// jti, the presented jti's first, since the route answers its
// state. An unknown jti plans none.
async function planRevocationAttempt(
    adapter: DbAdapter,
    identityId: Id,
    jti: string,
): Promise<{
    readonly jtis: readonly string[];
    readonly siblings: readonly ParentSibling[];
}> {
    const { chainId, heads } = await readTokenChainFromLedger(
        adapter, identityId, jti,
    );
    const appends = chainId === null
        ? []
        : revocationAppends(
            heads.map((head) => head.entity),
            chainId, identityId, nowUtc(),
        );
    const ordered = [
        ...appends.filter((event) => event.jti === jti),
        ...appends.filter((event) => event.jti !== jti),
    ];
    return {
        jtis: ordered.map((event) => event.jti),
        siblings: ordered.map(
            (event) => tokenSiblingOf(event, heads),
        ),
    };
}

// Revoke every jti in the chain `jti` belongs to (logging out
// one session), answering the presented token's state. The
// write is formed outside, and one transaction re-reads the
// chain's jti set and lands it, so a concurrent rotation
// cannot slip a fresh successor past the revoke: a grown set
// throws and retries, and a successor minted after the read
// moves a head the write latches, so the statement answers
// stale and the attempt retries. Three attempts end in a 409,
// never a silent, incomplete success. A jti this identity
// never held is a refusal: 404, and nothing lands.
export async function revokeTokenChain(
    adapter: DbAdapter,
    identityId: Id,
    jti: string,
    received?: MessagePair,
): Promise<void> {
    const backed = backedWrite(adapter);
    const context = tokenContextOf(received, identityId);
    for (
        let attempt = 0;
        attempt < MAX_TOKEN_WRITE_ATTEMPTS;
        attempt++
    ) {
        const provisional = await planRevocationAttempt(
            adapter, identityId, jti,
        );
        const [first, ...rest] = provisional.siblings;
        if (first === undefined) {
            throw new EntityNotFoundError(
                IDENTITY_TOKENS_TABLE, jti,
            );
        }
        const formed = await formStateWrite(
            received === undefined
                ? {
                    kind: 'events',
                    context,
                    siblings: [first, ...rest],
                }
                : {
                    kind: 'siblings',
                    received,
                    siblings: [first, ...rest],
                    reader: { sees: 'whole' },
                    answer: { kind: 'parent' },
                },
        );
        let answer: WriteAnswer;
        try {
            answer = await backed.backend.transaction(
                'readwrite',
                async (tx) => {
                    const view = backed.clientOn(tx);
                    const fresh = await readTokenChainFromLedger(
                        view, identityId, jti,
                    );
                    if (!jtiSetsEqual(
                        fresh.heads.map(
                            (head) => head.entity.jti,
                        ),
                        provisional.jtis,
                    )) {
                        throw new TokenPlanDivergedError();
                    }
                    return landStateWrite(view, formed);
                },
            );
        } catch (e) {
            if (!(e instanceof TokenPlanDivergedError)) {
                throw e;
            }
            continue;
        }
        if (answer.outcome === 'land') {
            return;
        }
    }
    throw new ApiError(
        'Token chain remained contended at ' + jti,
        HTTP_CONFLICT,
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
        newJti, {
            received: messagePair,
            answer: { kind: 'received' },
        },
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

// A spent assertion's ticket: one document per assertion jti.
const ASSERTION_JTIS_PATH = '/authentication/assertion-jtis/';

// client_credentials via private_key_jwt: a headless client
// authenticates as itself. The client_assertion is REALLY
// verified — JWS signature against the client's registered
// JWKS (RS256/ES256, WebCrypto) plus the RFC 7523 claim
// checks, in api/client-assertion.ts. The spent-jti ticket is
// a handler genesis in the grant's own statement, so a
// replayed assertion finds its ticket taken: the statement
// answers stale, and replay is 401 invalid_grant, nothing
// stored. The token's sub is the client id (a service
// principal).
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
    const written = await runStateWrite(
        adapter,
        grantWrite(messagePair, [
            tokenSiblingOf({
                jti: refreshJti, identity_id: clientId,
                action: 'issued', chain_id: chainId, at,
            }, []),
            {
                method: 'PUT',
                path: ASSERTION_JTIS_PATH,
                name: verdict.jti,
                state: { exp: verdict.exp },
                condition: {
                    kind: 'genesis', declarer: 'handler',
                },
            },
        ]),
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

// sha256(code), the name of the code document at
// /authentication/authorization-codes/.
export async function deriveAuthorizationCodeId(
    code: string,
): Promise<string> {
    return sha256Hex(code);
}

const AUTHORIZATION_CODES_PATH =
    '/authentication/authorization-codes/';
const AUTHORIZATION_CODE_ROUTE =
    'authentication/authorization-codes/:hash';
const AUTHORIZATION_CODE_SEGMENTS: readonly string[] = [
    'authentication',
    'authorization-codes',
    ':hash',
];

// authorization_code grant: one redemption of the code
// document. No head, or a DELETE head, is 401 before
// mint. The spend is a latched DELETE in the same
// statement as the issued event and this grant.
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
    const head = await documentHeadAt(
        adapter, AUTHORIZATION_CODES_PATH, derivedId,
    );
    if (head === null || head.method === 'DELETE') {
        return invalid;
    }
    const stored = await adapter.messagePairs.getById(
        head.id,
    );
    if (
        msSinceUtc(stored.response_at)
        >= AUTHORIZATION_CODE_TTL_SECONDS * MS_PER_SECOND
    ) {
        return invalid;
    }
    const storedBody = bodyOf(stored.response);
    const issuerId = stored.requester_identity_id;
    const clientId = pickString(storedBody, 'client_id');
    const challenge = storedBody.code_challenge;
    const codeChallenge =
        typeof challenge === 'string' && challenge !== ''
            ? challenge
            : undefined;
    // Bind the code to the client that issued it (OAuth 2.1
    // §4.1.3). Absent or wrong client_id is the same 401
    // as unknown, spent, or expired. No mint.
    const redeemingClientId =
        typeof body.client_id === 'string'
            ? body.client_id
            : '';
    if (redeemingClientId !== clientId) {
        return invalid;
    }
    // PKCE S256 (RFC 7636): a stored code_challenge requires
    // code_verifier. Missing or mismatch is the same 401.
    // No challenge preserves redeem without PKCE.
    if (codeChallenge !== undefined) {
        if (verifier === '') return invalid;
        const derived = bytesToBase64Url(
            await sha256Bytes(verifier),
        );
        if (derived !== codeChallenge) {
            return invalid;
        }
    }
    const refreshJti = generateIdentifier();
    const chainId = generateIdentifier();
    const at = nowUtc();
    const name = await nameFor(adapter, issuerId);
    const claims = await subjectClaims(adapter, issuerId);
    // act.sub = the acting client (RFC 8693). sub stays
    // the user. clientId is already the redeeming client.
    const minted = await mintPair(
        issuerId, name, refreshJti,
        { sub: clientId }, {
            organizations: claims.organizations,
            roles: claims.roles,
        },
    );
    const response = minted.response;
    const messagePair = await formAuthMessagePair(
        seed, body, issuerId,
        publicTokenBody(response),
        seed.operationId, seed.requestId,
        tokenAnswerFields(
            response.access_token,
            refreshSetCookie(
                minted.refreshToken, request,
            ),
        ),
    );
    const written = await runStateWrite(
        adapter,
        grantWrite(messagePair, [
            tokenSiblingOf({
                jti: refreshJti, identity_id: issuerId,
                action: 'issued', chain_id: chainId, at,
            }, []),
            {
                method: 'DELETE',
                path: AUTHORIZATION_CODES_PATH,
                name: derivedId,
                condition: { kind: 'in-order', head: head.id },
            },
        ]),
    );
    if (written.outcome !== 'land') return invalid;
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
    const codeName = await deriveAuthorizationCodeId(code);
    const codeBody: Record<string, unknown> = {
        client_id: pickString(body, 'client_id'),
    };
    const presentedChallenge = body.code_challenge;
    if (
        typeof presentedChallenge === 'string'
        && presentedChallenge !== ''
    ) {
        codeBody.code_challenge = presentedChallenge;
    }
    const codePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: AUTHORIZATION_CODES_PATH + codeName,
        routePattern: AUTHORIZATION_CODE_ROUTE,
        routeSegments: AUTHORIZATION_CODE_SEGMENTS,
        pathSegments: [
            'authentication',
            'authorization-codes',
            codeName,
        ],
        headerFields: [],
        body: undefined,
        requesterIdentityId: identityId,
        requestAt: seed.requestAt,
        organization: undefined,
        responseBody: codeBody,
        operationId: messagePair.operationId,
        requestId: messagePair.requestId,
        genesis: 'handler',
        emptyRequest: true,
    });
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
            body: undefined,
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
            genesis: 'handler',
            emptyRequest: true,
        });
    }
    const pairs = rehashMessagePair === undefined
        ? [codePair, messagePair]
        : [rehashMessagePair, codePair, messagePair];
    const written = await runWrite(
        adapter, attemptFor(pairs), pairs,
    );
    // A stale answer names the first stale row; a refused
    // statement states no row, so it cannot say which.
    if (written.outcome === 'stale') {
        throw new Error(
            'authorize statement answered stale: '
                + await written.response.text(),
        );
    }
    if (written.outcome !== 'land') {
        throw new Error(
            'authorize statement answered ' + written.outcome
                + ' for the code document or the rehashed'
                + ' credential',
        );
    }
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
