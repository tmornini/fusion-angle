import { EntityNotFoundError } from './db.ts';
import type {
    DbAdapter,
    GuardedDbAdapter,
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
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { sha256Hex } from '../shared/digest.ts';
import {
    nowUtc,
    nowEpochSeconds,
    type Id,
    type IdentityTokenEntity,
    type ClientEntity,
    type IdentityCredentialEntity,
    type IdentityPiiEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import {
    planRotation,
    isTokenRevoked,
    chainIdForJti,
    identityForJti,
    revocationAppends,
    jtiSetsEqual,
} from './identity-tokens.ts';
import type { RotationPlan } from './identity-tokens.ts';
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
    canonicalUriPrefix,
    formAuthPair,
    formTokenEventPair,
} from './message-pair.ts';
import type { MessagePair, AuthPairSeed } from './message-pair.ts';
import { deriveMembershipsForIdentity } from
    './derive-memberships.ts';
import {
    deriveCredentialsFor,
    deriveIdentityPii,
    deriveIdentityPiiRows,
    deriveTokenRevocationsFor,
} from './derive-identity-spine.ts';
import {
    deriveIdentityTokens,
    deriveIdentityTokenEventsForJti,
} from './derive-identity-tokens.ts';

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
        // The just-appended AUTH pair's request hash — undefined
        // only for exchangeBearerForOrganization's internal,
        // seedless hop (never a real /authentication/token
        // request, so it forms no AUTH pair; its issued root's
        // OWN event pair still lands, Phase 13 Task 5, but this
        // field tracks the auth-pair hash specifically). The
        // dedicated gate arm (api.ts) always supplies a seed, so
        // a result it sees always carries one — see
        // storedPairResponse's sibling crash-loud idiom.
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

// The subject's reachable orgs — every org it is a member of,
// derived fresh from the membership ledger (never cached). The
// source of the token's `orgs` claim and the exchange's
// member-check.
export async function subjectOrganizations(
    adapter: DbAdapter,
    identityId: Id,
): Promise<Id[]> {
    const rows = await deriveMembershipsForIdentity(
        adapter, identityId);
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
    const rows = await deriveMembershipsForIdentity(
        adapter, identityId);
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

// Issue a pair on a NEW chain: the refresh jti anchors a fresh
// chain root, recorded PAIR-ONLY (Phase 13 Task 9: the row half
// retires here — nothing has read identity_tokens rows since
// Task 6). Used by grants that start a session without consuming
// a single-use resource. All crypto (jti generation, mintPair's
// HMAC signing, formAuthPair's and formTokenEventPair's
// fingerprinting) runs PRE-tx; the root's own event pair (plus
// the auth pair, when seeded) is this grant's only write, so it
// rides ONE minimal transaction (the default-organization
// no-change precedent) — a mid-write fault can never leave one
// pair stored without the other. `seed` is undefined for
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
    seed: AuthPairSeed | undefined,
    act?: { sub: Id },
    organization?: Id,
): Promise<{
    readonly response: TokenResponse;
    readonly requestHash: string | undefined;
}> {
    const refreshJti = generateCryptoSafeBase62();
    const rootId = generateCryptoSafeBase62();
    const chainId = generateCryptoSafeBase62();
    const at = nowUtc();
    const organizations =
        await subjectOrganizations(adapter, identityId);
    const response = await mintPair(identityId, name, refreshJti, act, {
        ...(organization ? { organization } : {}),
        organizations,
    });
    const pair = seed === undefined
        ? undefined
        : await formAuthPair(seed, body, identityId, 200, response);
    const eventPair = await formTokenEventPair(rootId, {
        jti: refreshJti, identity_id: identityId,
        action: 'issued', chain_id: chainId, at,
    });
    await adapter.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, eventPair);
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
    return { response, requestHash: pair?.requestHash };
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
    // getAllWhere('identity_id', sub) read it replaces.
    const revs = await deriveTokenRevocationsFor(adapter, sub);
    const revokedThrough = revokedThroughSeconds(revs, sub);
    if (revokedThrough !== null && iat <= revokedThrough) {
        return 'token revoked';
    }
    // SECOND read FLIPPED (Phase 13 Task 6, gate 7 discharged):
    // derived via deriveIdentityTokenEventsForJti — row-identical
    // to the getAllWhere('jti', jti) read it replaces, now that
    // every identity_tokens writer forms its own event pair
    // (Phase 13 Task 5). The gate check needs only THIS jti's
    // events: a chain-wide revoke writes a 'revoked' event per
    // jti, so the latest action for the presented jti already
    // reflects it.
    const events =
        await deriveIdentityTokenEventsForJti(adapter, jti);
    if (isTokenRevoked(events, jti)) {
        return 'token chain revoked';
    }
    return null;
}

// The two-step narrow shared by rotation and revocation, run
// BOTH pre-tx (the provisional read) and in-tx (the
// authoritative re-read): find the presented jti's chain, then
// read the WHOLE chain — planRotation's replay path (and an
// explicit revocation) act on every jti the chain has ever held,
// so a jti-only read would under-revoke. Ledger-derived (Phase 13
// Task 6, gate 7 discharged; Task 9a re-anchors BOTH call sites'
// former row-plane reads here) — sourced from
// deriveIdentityTokenEventsForJti/deriveIdentityTokens rather than
// the identity_tokens EntityStore. `db` is the plain adapter for
// planRotationAttempt/planRevocationAttempt's own PRE-TX
// provisional read below, and an open transaction view (adapter-
// shaped) for rotateRefreshJti/revokeTokenChain's own IN-TX
// re-read. Two independent family scans (one per derivation call)
// mirror an EntityStore's own two independent getAllWhere calls —
// the SAME shape, never worse.
async function readTokenChainFromLedger(
    db: DbAdapter,
    jti: string,
): Promise<{
    readonly chainId: string | null;
    readonly identityId: Id | null;
    readonly rows: readonly IdentityTokenEntity[];
}> {
    const byJti = await deriveIdentityTokenEventsForJti(db, jti);
    const chainId = chainIdForJti(byJti, jti);
    const identityId = identityForJti(byJti, jti);
    const rows = chainId === null
        ? byJti
        : (await deriveIdentityTokens(db)).filter(
            (row) => row.chain_id === chainId,
        );
    return { chainId, identityId, rows };
}

// Each append's event, paired with its OWN formed event pair —
// formTokenEventPair mints a fresh id per event and addresses the
// pair by it (Phase 13 Task 5), so pair formation runs PRE-TX
// only (async crypto — the IndexedDB auto-commit constraint bars
// awaiting anything but row ops inside an open transaction).
interface TokenEventWrite {
    readonly event: Omit<IdentityTokenEntity, 'id'>;
    readonly pair: MessagePair;
}

async function formTokenEventWrites(
    appends: readonly Omit<IdentityTokenEntity, 'id'>[],
): Promise<TokenEventWrite[]> {
    const writes: TokenEventWrite[] = [];
    for (const event of appends) {
        const id = generateCryptoSafeBase62();
        writes.push({
            event, pair: await formTokenEventPair(id, event),
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

// One rotation attempt's PRE-TX groundwork: the provisional read
// — FLIPPED onto readTokenChainFromLedger (Phase 13 Task 6) —
// the provisional plan (planRotation, bytes unchanged), and a
// pre-minted row id + event pair for whichever appends that plan
// carries. `newJti` is the ONE value that survives every attempt
// unchanged (Step 0: the rotation route pre-mints it in its own
// response spec and threads it back via pairResponseBody, so
// re-minting it here would desync the wire response from what
// commits); the chain id is READ, not minted, so it too stays
// consistent attempt to attempt — only row ids and `at` are
// genuinely fresh per attempt.
async function planRotationAttempt(
    adapter: DbAdapter,
    presentedJti: string,
    newJti: string,
): Promise<{
    readonly plan: RotationPlan;
    readonly writes: readonly TokenEventWrite[];
}> {
    const { rows } = await readTokenChainFromLedger(
        adapter, presentedJti,
    );
    const plan = planRotation(rows, presentedJti, newJti, nowUtc());
    const appends = plan.kind === 'unknown' ? [] : plan.appends;
    return { plan, writes: await formTokenEventWrites(appends) };
}

// Read the token ledger, plan the rotation, and append its
// events (plus their own event pairs) in ONE transaction — a
// concurrent reuse of the same jti can not double-rotate. Shared
// by the refresh grant and the POST identity-tokens/:jti/rotation
// route: one truth for the atomic rotate. `pair` is optional and
// appends as the LAST act, ONLY on the 'rotate' branch — a 409
// (reuse or unknown) stores no OPERATION pair even though the
// reuse branch still revokes the chain for real. The route is
// REPLAY_EXEMPT_ROUTE_PATTERNS-wired (message-pair.ts / api.ts):
// the gate never serves a stored response for a byte-identical
// resend of this route, so a resent reuse attempt genuinely
// re-enters this function and re-fails 409 — this function's own
// re-check IS the guard the exemption relies on; it must stay
// live on every call.
//
// PRE-FORM + IN-TX VERIFY-OR-RETRY (Phase 13 Task 5, Gate 7): the
// pre-tx plan above is provisional — a concurrent sibling can
// still land between that read and this transaction opening. The
// in-tx body RE-READS and RE-PLANS from scratch, then compares
// the FULL re-planned jti SET against the pre-formed writes' jti
// set — never `kind` alone (two 'replay' plans can carry
// DIFFERENT append sets if a sibling rotation grew the chain
// between reads). Equal → commit the PRE-TX-prepared writes
// (never the fresh re-plan's own appends: its `at` would desync
// the already-formed event pairs' stored messages from the rows
// they describe — its ONLY job is the equality check). Diverged
// → abort the transaction and retry with a wholly fresh attempt.
export async function rotateRefreshJti(
    adapter: DbAdapter,
    presentedJti: string,
    newJti: string,
    pair?: MessagePair,
): Promise<RotationOutcome> {
    for (
        let attempt = 0;
        attempt < MAX_TOKEN_WRITE_ATTEMPTS;
        attempt++
    ) {
        const provisional = await planRotationAttempt(
            adapter, presentedJti, newJti,
        );
        try {
            return await adapter.transaction(
                ['requests', 'responses'],
                async (view) => {
                    const { rows } = await readTokenChainFromLedger(
                        view, presentedJti,
                    );
                    const freshPlan = planRotation(
                        rows, presentedJti, newJti, nowUtc(),
                    );
                    const freshAppends =
                        freshPlan.kind === 'unknown'
                            ? [] : freshPlan.appends;
                    if (!jtiSetsEqual(
                        freshAppends.map(a => a.jti),
                        provisional.writes.map(w => w.event.jti),
                    )) {
                        throw new TokenPlanDivergedError();
                    }
                    for (const write of provisional.writes) {
                        await appendMessagePair(view, write.pair);
                    }
                    if (provisional.plan.kind === 'rotate') {
                        if (pair !== undefined) {
                            await appendMessagePair(view, pair);
                        }
                        return {
                            kind: 'rotate' as const,
                            newJti: provisional.plan.newJti,
                        };
                    }
                    return { kind: 'fail' as const };
                },
            );
        } catch (e) {
            if (!(e instanceof TokenPlanDivergedError)) throw e;
        }
    }
    return { kind: 'fail' as const };
}

// One revocation attempt's PRE-TX groundwork: the provisional
// read — FLIPPED onto readTokenChainFromLedger (Phase 13 Task 6)
// — + revocationAppends' plan (bytes unchanged) + a pre-minted
// row id and event pair per append. An unknown jti (no chain, no
// identity) plans zero appends — the SAME no-op shape
// revokeTokenChain has always handed an unknown jti.
async function planRevocationAttempt(
    adapter: DbAdapter,
    jti: string,
): Promise<{
    readonly writes: readonly TokenEventWrite[];
}> {
    const { chainId, identityId, rows } =
        await readTokenChainFromLedger(adapter, jti);
    const appends = chainId === null || identityId === null
        ? []
        : revocationAppends(rows, chainId, identityId, nowUtc());
    return { writes: await formTokenEventWrites(appends) };
}

// Revoke every jti in the chain `jti` belongs to (logging out
// one session). Read and appends ride the same transaction, so
// a concurrent rotation cannot slip a fresh successor past the
// revoke. A no-op for an unknown jti — `pair` still appends on
// BOTH exit paths (the claim-op precedent: a 2xx no-op is not
// a failure).
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
    jti: string,
    pair?: MessagePair,
): Promise<void> {
    for (
        let attempt = 0;
        attempt < MAX_TOKEN_WRITE_ATTEMPTS;
        attempt++
    ) {
        const provisional = await planRevocationAttempt(
            adapter, jti,
        );
        try {
            await adapter.transaction(
                ['requests', 'responses'],
                async (view) => {
                    const { chainId, identityId, rows } =
                        await readTokenChainFromLedger(
                            view, jti,
                        );
                    const freshAppends =
                        chainId === null || identityId === null
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
                    for (const write of provisional.writes) {
                        await appendMessagePair(view, write.pair);
                    }
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
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
// issueTokenPair forms no AUTH pair for it, exactly as before
// Task 3. Its issued root STILL gets its own event pair (Phase
// 13 Task 5): the row is written either way, so the ledger
// visibility the event pair grants must too.
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
    // FLIPPED (Phase 15 gate 6): raw keyed client row — clients
    // never soft-delete, so rawReadRow is byte-identical to the
    // EntityStore.getById it replaces (null ≡ EntityNotFoundError
    // → same 401 'unknown client' path). No EntityStore/states
    // transaction. handleRequest always supplies a GuardedDbAdapter
    // (the unfenced base); cast is the type-narrowing seam only.
    const client = await (adapter as GuardedDbAdapter)
        .rawReadRow<ClientEntity>('clients', clientId);
    if (client === null) {
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

// GATE 3 — KEY-BY-ANCHOR (Phase 13 Task 7): the presented code's
// sha256 digest, pre-tx always — crypto never runs inside an open
// transaction (the IndexedDB auto-commit constraint every other
// pair-forming call site in this file already honors). It keys
// the issued root's row id (and, by construction, that row's own
// event pair's uri_id — formTokenEventPair derives uriId from the
// id it is given) AND, prefixed 'sha256:', is the fingerprint
// authorizeCodeIssuer below matches against the authorize response
// family's stored (redacted) `code` field — one digest, both
// halves of the guard.
export async function deriveAuthorizationCodeId(
    code: string,
): Promise<string> {
    return sha256Hex(code);
}

const AUTHORIZE_PREFIX =
    canonicalUriPrefix(undefined, '/authentication/authorize/');
const IDENTITY_TOKENS_EVENT_PREFIX =
    canonicalUriPrefix(undefined, '/identity-tokens/');

// A stored message's JSON body — the ONE local decode this file
// needs for both the request and response side of the authorize
// scan below. derive-documents.ts's requestBodyOf and derive-
// identity-spine.ts's responseBodyOf already do these identical
// three lines, each private to its own module; a third copy here
// stays below the exploratory-duplication threshold (Commandment
// IX) rather than forcing a shared extraction across three
// unrelated modules for a task that touches only this one.
function decodedBodyOf(message: string): Record<string, unknown> {
    const model = parseJson(message, defaultBodyRegistry());
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

interface AuthorizeCodeIssuer {
    readonly identityId: Id;
    readonly clientId: Id;
}

// PRE-TX (i), gate 3: the code -> identity/client point-match
// over the WHOLE '/authentication/authorize/' response family.
// That address is operation-addressed (uriId always ''), so no
// per-uriId head reduction applies here — deriveDocumentsAt's
// latest-per-uriId would wrongly collapse every distinct code's
// pair down to a single latest one. Every stored pair at this
// prefix is a genuine 2xx: authorizePassword forms a pair ONLY on
// success (grant-first, pinned), so no status re-check is needed.
// A miss — no stored pair's response `code` field fingerprints to
// the presented code — returns null; the caller's 401 is
// byte-identical whether the code was never issued or has already
// been spent (authorizationCodeSpent decides that, second).
async function authorizeCodeIssuer(
    adapter: DbAdapter,
    codeFingerprint: string,
): Promise<AuthorizeCodeIssuer | null> {
    const responses = await adapter.responses
        .getAllWhere('uri_prefix', AUTHORIZE_PREFIX);
    const matched = responses.find(
        (response) =>
            decodedBodyOf(response.message).code === codeFingerprint,
    );
    if (matched === undefined) return null;
    const request = await adapter.requests.getById(matched.id);
    return {
        identityId: request.requester_identity_id,
        clientId: pickString(
            decodedBodyOf(request.message), 'client_id',
        ),
    };
}

// PRE-TX (ii) fast-fail AND the in-tx re-check share this ONE
// function — adapter-shaped (the membershipExistsFor /
// deriveIdentityTokenEventsForJti precedent), `dbOrView` is
// whichever face is in scope: the plain adapter pre-tx, the open
// transaction view in-tx. A genuine event already lives at
// 'identity-tokens/<derivedId>' exactly when this code has already
// minted a chain root — the pair append at that KEYED address IS
// the spend marker (KEY-BY-ANCHOR), replacing the retired
// authorization_codes 'consumed' row. Filtered to the identity-
// tokens prefix so a coincidental non-identity-tokens hit —
// astronomically unlikely for a 64-hex-char sha256 digest against
// 22-char base62 ids, but never assumed — cannot false-positive
// the guard.
export async function authorizationCodeSpent(
    dbOrView: DbAdapter,
    derivedId: Id,
): Promise<boolean> {
    const rows = await dbOrView.requests
        .getAllWhere('uri_id', derivedId);
    return rows.some(
        (row) => row.uri_prefix === IDENTITY_TOKENS_EVENT_PREFIX,
    );
}

// authorization_code grant: consume an ISSUED code, then issue a
// token pair. A consumed (replay), raced, or unknown code is a
// clean 401 that mints nothing and appends nothing (grant-first).
// PRE-tx: authorizeCodeIssuer resolves (identity, client) from the
// matched authorize pair, then authorizationCodeSpent fast-fails
// an already-spent code — both before mintPair's HMAC signing or
// formAuthPair/formTokenEventPair's fingerprinting run. Then ONE
// tx RE-RUNS the spend check on the OPEN VIEW: a concurrent
// consumer may have won the race between the pre-tx read and
// here, in which case this call aborts (401, mints nothing
// further, appends nothing — the pre-minted response and pairs
// above are simply discarded, wasted crypto on the losing side of
// the race) exactly as the retired codeState-driven version did.
async function grantAuthorizationCode(
    adapter: DbAdapter,
    body: Record<string, unknown>,
    seed: AuthPairSeed,
): Promise<TokenResult> {
    const code = typeof body.code === 'string'
        ? body.code
        : '';
    const invalid: TokenResult = failure(
        401, 'invalid or used authorization code',
    );
    const derivedId = await deriveAuthorizationCodeId(code);
    const issuer = await authorizeCodeIssuer(
        adapter, 'sha256:' + derivedId,
    );
    if (issuer === null) return invalid;
    if (await authorizationCodeSpent(adapter, derivedId)) {
        return invalid;
    }
    const refreshJti = generateCryptoSafeBase62();
    // KEY-BY-ANCHOR: the root row's id (and, by construction, its
    // own event pair's uri_id) IS the derived id — see
    // deriveAuthorizationCodeId's own comment for why that
    // collision is the spend guard itself.
    const rootId = derivedId;
    const chainId = generateCryptoSafeBase62();
    const at = nowUtc();
    const name = await nameFor(adapter, issuer.identityId);
    const organizations =
        await subjectOrganizations(adapter, issuer.identityId);
    const response = await mintPair(
        issuer.identityId, name, refreshJti,
        undefined, { organizations },
    );
    const pair = await formAuthPair(
        seed, body, issuer.identityId, 200, response,
    );
    // The root's OWN event pair (Phase 13 Task 5): formed pre-tx
    // against `issuer.identityId` — a code's issuer cannot change
    // between the pre-tx read and the in-tx write below (its own
    // authorize pair is immutable once appended), so this task
    // retires the old codeState-driven re-read that used to
    // (defensively) re-resolve it in-tx.
    const eventPair = await formTokenEventPair(rootId, {
        jti: refreshJti, identity_id: issuer.identityId,
        action: 'issued', chain_id: chainId, at,
    });
    const consumed = await adapter.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (await authorizationCodeSpent(view, derivedId)) {
                return false;
            }
            await appendMessagePair(view, eventPair);
            await appendMessagePair(view, pair);
            return true;
        },
    );
    return consumed
        ? { ok: true, response, requestHash: pair.requestHash }
        : invalid;
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
// issue an authorization code bound to (identity, client). Every
// failure returns the SAME 401 (no user enumeration) and appends
// nothing — grant-first, no-op on failure. The code is recorded
// PAIR-ONLY (Phase 13 Task 9: the row half retires here — nothing
// has read authorization_codes rows since Task 7). The stored
// request carries the PBKDF2-fingerprinted password and the
// stored response the sha256-fingerprinted code
// (redactAuthenticationRequest/Response, applied inside
// formAuthPair) — never the live values.
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
    const denied: AuthorizeResult = {
        ok: false, status: 401, error: 'invalid credentials',
    };
    // FLIPPED (Phase 13 Task 8): deriveIdentityPiiRows is the E13
    // full-scan derive (derive-identity-spine.ts) — a whole-
    // ledger scan is unavoidable here, exactly as the row-plane
    // getAllWhere('email', ...) it replaces was: email carries no
    // dedicated index either plane, so both planes scan every
    // slot to find the match. identityByEmail (the reducer) is
    // BYTE-UNCHANGED — only the row source moves.
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
    const code = generateCryptoSafeBase62();
    const response: AuthorizeResponse = { code };
    const pair = await formAuthPair(
        seed, body, identityId, 200, response,
    );
    await adapter.transaction(
        ['requests', 'responses'],
        async (view) => {
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
