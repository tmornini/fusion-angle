import {
    nowEpochSeconds,
    type Id,
} from '../../../api/types.ts';
import {
    GET as httpGet,
    GETWithResponseId as httpGetWithResponseId,
    PUT as httpPut,
    DELETE as httpDelete,
    POST as httpPost,
    UnauthorizedError,
    type ClientFacadeAdapter,
} from '../../../api/api.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    getDbAdapter,
    getSessionToken,
    putSessionToken,
} from './init.ts';
import {
    type Principal,
    principalFromToken,
} from '../../../api/access-token.ts';
import {
    resolveCredentialDecision,
} from '../credential-resolution.ts';
import {
    type SessionCredentials,
    getSessionCredentials,
    putSessionCredentials,
    deleteSessionCredentials,
} from './session-credentials.ts';
import { postSessionRefresh } from './session-refresh.ts';
import { redirectToLogin } from '../auth-redirect.ts';
import { getOrganizations } from './organizations.ts';
import {
    getIdentityDefaultOrganization,
} from './identity-default-organization.ts';
import {
    resolveActiveOrganization,
    postOrganizationSessionExchange,
} from './organization-session.ts';

// Rows whose `field` equals `value` — the single-field
// equality filter the adapters repeat. Type-safe: `field`
// must be a key of T and `value` its type. Callers keep
// their own map/sort.
export function filterByField<T, K extends keyof T>(
    rows: readonly T[],
    field: K,
    value: T[K],
): T[] {
    return rows.filter(row => row[field] === value);
}

export interface RequestContext {
    readonly requestId: string;
    readonly identity: Principal;
    GET<T>(resource: string): Promise<T>;
    // The locked-class baseline+echo read: the parsed body plus
    // the Response-ID header to carry forward as If-Response-ID
    // on the next save.
    GETWithResponseId<T>(
        resource: string,
    ): Promise<{ body: T; responseId: string | undefined }>;
    PUT<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<T>;
    DELETE(resource: string): Promise<void>;
    POST<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
}

// The recovery-free context: each verb runs directly on its
// captured token. The recovering sibling below is the
// sessionContext path.
export function createRequestContext(
    adapter: ClientFacadeAdapter,
    token: string,
): RequestContext {
    return makeRequestContext(adapter, token, false);
}

// The recovery-enabled context: a 401 refreshes the session
// via withAuthRecovery and retries against the live token
// once.
export function createRecoveringRequestContext(
    adapter: ClientFacadeAdapter,
    token: string,
): RequestContext {
    return makeRequestContext(adapter, token, true);
}

function makeRequestContext(
    adapter: ClientFacadeAdapter,
    token: string,
    recover: boolean,
): RequestContext {
    const identity = principalFromToken(token);

    function run<T>(
        make: (tok: string) => Promise<T>,
    ): Promise<T> {
        return recover
            ? withAuthRecovery(
                adapter, token, identity.organization, make)
            : make(token);
    }

    const ctx: RequestContext = {
        requestId: generateCryptoSafeBase62(),
        identity,
        GET: <T>(resource: string) =>
            run<T>(tok => httpGet<T>(adapter, resource, tok)),
        GETWithResponseId: <T>(resource: string) =>
            run<{ body: T; responseId: string | undefined }>(
                tok => httpGetWithResponseId<T>(
                    adapter, resource, tok,
                ),
            ),
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?:
                readonly (readonly [string, string])[],
        ) => run<T>(
            tok => httpPut<T>(
                adapter, resource, body, tok, headerFields,
            )),
        DELETE: (resource: string) =>
            run<void>(
                tok => httpDelete(adapter, resource, tok)),
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => run<T>(
            tok => httpPost<T>(adapter, resource, body, tok)),
    };
    return ctx;
}

// Exponential backoff with jitter for the C6 retry loop
// (flow-mutations.ts's putFlow): attempt 1 waits one base
// interval (plus jitter), attempt 2 waits two, doubling each
// time — capped at MAX_PUT_ATTEMPTS (3) call sites, never
// infinite (Commandment: retries only where the error is
// transient, exponential backoff with jitter, capped).
const BACKOFF_BASE_MS = 100;

export async function jitteredBackoff(
    attempt: number,
): Promise<void> {
    const base = BACKOFF_BASE_MS * 2 ** (attempt - 1);
    const delay = base + Math.random() * base;
    await new Promise<void>(
        resolve => setTimeout(resolve, delay),
    );
}

export function sessionContext(): RequestContext {
    return createRecoveringRequestContext(
        getDbAdapter(), getSessionToken(),
    );
}

// All concurrent 401s share ONE recovery: the first failure
// starts it, the rest await the same promise — a burst of
// parallel reads over an expired token spends the refresh jti
// exactly once. A second spend would be branded reuse by the
// grant, revoking the winner's fresh chain and force-logging
// the user out. Cleared on settle so the NEXT 401 starts a
// fresh recovery.
let recoveryInFlight: Promise<string | null> | null = null;

function sharedRecovery(
    adapter: ClientFacadeAdapter,
    requestOrganization: Id | undefined,
): Promise<string | null> {
    recoveryInFlight ??= recoverSession(adapter, requestOrganization)
        .finally(() => {
            recoveryInFlight = null;
        });
    return recoveryInFlight;
}

// Wrap one verb call with single-shot 401 recovery. The first
// attempt runs on the request's own vessel token — never the
// live module global, so identity and wire credential cannot
// diverge mid-request (one vessel truth). A non-401 fault
// surfaces untouched. A 401 drives one refresh + re-scope; the
// call is retried exactly once against the recovered token. A
// second 401 (or no refreshable credential) clears the session
// and bounces to login — there is no third attempt.
async function withAuthRecovery<T>(
    adapter: ClientFacadeAdapter,
    token: string,
    requestOrganization: Id | undefined,
    make: (tok: string) => Promise<T>,
): Promise<T> {
    try {
        return await make(token);
    } catch (err) {
        if (!(err instanceof UnauthorizedError)) {
            throw err;
        }
        const recovered =
            await sharedRecovery(adapter, requestOrganization);
        if (recovered === null) {
            throw err;   // unrefreshable — already redirected
        }
        try {
            return await make(recovered);
        } catch (retryErr) {
            if (retryErr instanceof UnauthorizedError) {
                deleteSessionCredentials();
                redirectToLogin();
            }
            throw retryErr;
        }
    }
}

// Refresh the session from the stored credential, returning the
// new fully-scoped token, or null when there is nothing to
// refresh (then login has already been triggered). H14: a bare
// 401 with no refreshable credential never makes a pointless
// refresh round-trip.
async function recoverSession(
    adapter: ClientFacadeAdapter,
    requestOrganization: Id | undefined,
): Promise<string | null> {
    let creds: SessionCredentials | null;
    try {
        creds = getSessionCredentials();
    } catch {
        // a corrupt blob is unrecoverable — scrub and bounce
        deleteSessionCredentials();
        redirectToLogin();
        return null;
    }
    const now = nowEpochSeconds();
    const decision = resolveCredentialDecision(creds, now);
    // A live access token ('install') that still drew a 401 did not
    // expire — the holder was the unscoped anonymous seed (a read
    // raced ahead of boot scoping). Re-install the live token and
    // re-scope; the caller retries once. A genuinely dead token
    // (revoked, not expired) 401s the re-scope and falls through to
    // scrub + bounce — never destroying a live session over a
    // recoverable unscoped read.
    if (decision.kind === 'install') {
        return installAndScope(
            adapter, decision.accessToken, requestOrganization);
    }
    if (decision.kind !== 'refresh') {
        deleteSessionCredentials();
        redirectToLogin();
        return null;
    }
    const refreshed = await refreshCredentials(
        adapter, decision.refreshToken);
    if (refreshed === null) {
        return null;
    }
    putSessionCredentials(refreshed);
    return installAndScope(
        adapter, refreshed.accessToken, requestOrganization);
}

// Install a flat token as the session and re-scope it to the active
// org, exactly as boot does. Returns the org-scoped token, or null
// when the token died mid-re-scope (revoked, not expired) — then it
// has scrubbed the credential and bounced to login. A non-401 is a
// real bug and surfaces. This keeps recoverSession's contract whole:
// it returns a token or null (having redirected), and never throws a
// 401 past withAuthRecovery's catch. The shared tail of both
// recovery branches: re-install a known-live token (install), and
// refresh-then-install (refresh).
async function installAndScope(
    adapter: ClientFacadeAdapter,
    flatToken: string,
    requestOrganization: Id | undefined,
): Promise<string | null> {
    putSessionToken(flatToken);
    try {
        await rescopeToActiveOrganization(
            adapter, flatToken, requestOrganization);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            deleteSessionCredentials();
            redirectToLogin();
            return null;
        }
        throw err;
    }
    return getSessionToken();
}

// Run the refresh grant on a recovery-FREE context: a refresh
// that itself 401s (reuse/expiry) is terminal and must not
// recurse. A dead refresh scrubs the session and bounces.
async function refreshCredentials(
    adapter: ClientFacadeAdapter,
    refreshToken: string,
): Promise<SessionCredentials | null> {
    const free = createRequestContext(adapter, getSessionToken());
    try {
        return await postSessionRefresh(free, refreshToken);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            deleteSessionCredentials();
            redirectToLogin();
            return null;
        }
        throw err;
    }
}

// Re-scope the freshly refreshed (org-agnostic) token to the
// request's own org, resolving the target from the REACHABLE
// set first so the exchange never targets a non-member org
// (H13). Unlike boot, recovery neither reads nor writes the
// cross-tab ACTIVE_ORGANIZATION_ID preference: the target is the
// vessel's verified org claim, so a recovering request stays in
// the org it was operating in — and a background recovery never
// clobbers the org another tab is viewing (F-109). A flat vessel
// (no claim) falls back to the identity default, then the first
// reachable.
async function rescopeToActiveOrganization(
    adapter: ClientFacadeAdapter,
    flatToken: string,
    requestOrganization: Id | undefined,
): Promise<void> {
    const ctx = createRequestContext(adapter, flatToken);
    const reachable =
        (await getOrganizations(ctx)).map(o => o.id);
    if (reachable.length === 0) {
        return;
    }
    const active = resolveActiveOrganization(
        reachable,
        requestOrganization ?? null,
        await getIdentityDefaultOrganization(ctx),
    );
    putSessionToken(
        await postOrganizationSessionExchange(ctx, flatToken, active));
}

// The active org the session is scoped to. Post-boot the
// session token always carries it; its absence is an impossible
// state — boot scopes the token before any org-bound request —
// so we crash rather than invent a default.
export function activeOrganization(ctx: RequestContext): Id {
    const organization = ctx.identity.organization;
    if (organization === undefined) {
        throw new Error(
            'no active org on the session: boot must scope'
            + ' the token before an org-bound request',
        );
    }
    return organization;
}
