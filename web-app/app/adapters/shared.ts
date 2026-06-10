import type { DbAdapter } from '../../../api/db.ts';
import type { Id } from '../../../api/types.ts';
import {
    GET as httpGet,
    PUT as httpPut,
    DELETE as httpDelete,
    POST as httpPost,
    UnauthorizedError,
} from '../../../api/api.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    getDbAdapter,
    getSessionToken,
    setSessionToken,
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
    getIdentityDefaultOrg,
} from './identity-default-org.ts';
import {
    ACTIVE_ORG_KEY,
    resolveActiveOrg,
    postOrgSessionExchange,
} from './org-session.ts';
import {
    getPreference,
    writePreference,
} from './preferences.ts';

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

// A unit of write work executed by ctx.commit().
// `put` upserts a row by full state; `delete` removes
// a row by its resource path. The whole batch posts as
// ONE request and commits in one transaction — it
// applies entirely or not at all. On failure, commit()
// throws CommitError(0, [], cause); `applied` is always
// empty because real rollback leaves nothing partially
// applied.
export type WriteOp =
    | {
        method: 'put';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        method: 'delete';
        resource: string;
    };

export interface Transaction {
    readonly ops: readonly WriteOp[];
}

export class CommitError extends Error {
    readonly failedAt: number;
    readonly applied: readonly WriteOp[];
    readonly cause: Error;
    constructor(
        failedAt: number,
        applied: readonly WriteOp[],
        cause: Error,
    ) {
        super(
            'commit failed at op['
            + failedAt + ']: '
            + cause.message,
        );
        this.name = 'CommitError';
        this.failedAt = failedAt;
        this.applied = applied;
        this.cause = cause;
    }
}

export interface RequestContext {
    readonly requestId: string;
    readonly identity: Principal;
    GET<T>(resource: string): Promise<T>;
    PUT<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    DELETE(resource: string): Promise<void>;
    POST<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    commit(tx: Transaction): Promise<void>;
}

export function createRequestContext(
    adapter: DbAdapter,
    token: string,
    options: { recover?: boolean } = {},
): RequestContext {
    const recover = options.recover === true;
    const identity = principalFromToken(token);

    // A recovery-free context runs each verb directly on its
    // captured token; a recovery-enabled one (sessionContext)
    // routes through withAuthRecovery, which on a 401 refreshes
    // the session and retries against the live token once.
    function run<T>(
        make: (tok: string) => Promise<T>,
    ): Promise<T> {
        return recover
            ? withAuthRecovery(adapter, make)
            : make(token);
    }

    const ctx: RequestContext = {
        requestId: generateCryptoSafeBase62(),
        identity,
        GET: <T>(resource: string) =>
            run<T>(tok => httpGet<T>(adapter, resource, tok)),
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => run<T>(
            tok => httpPut<T>(adapter, resource, body, tok)),
        DELETE: (resource: string) =>
            run<void>(
                tok => httpDelete(adapter, resource, tok)),
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => run<T>(
            tok => httpPost<T>(adapter, resource, body, tok)),
        commit: async (
            tx: Transaction,
        ): Promise<void> => {
            try {
                await ctx.POST('commit', {
                    ops: tx.ops,
                });
            } catch (e) {
                // Atomic batch: a failure applied nothing,
                // so `applied` is always empty.
                throw new CommitError(0, [], e as Error);
            }
        },
    };
    return ctx;
}

export function sessionContext(): RequestContext {
    return createRequestContext(
        getDbAdapter(), getSessionToken(), { recover: true },
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
    adapter: DbAdapter,
): Promise<string | null> {
    recoveryInFlight ??= recoverSession(adapter)
        .finally(() => {
            recoveryInFlight = null;
        });
    return recoveryInFlight;
}

// Wrap one verb call with single-shot 401 recovery. The first
// attempt runs on the live session token. A non-401 fault
// surfaces untouched. A 401 drives one refresh + re-scope; the
// call is retried exactly once against the recovered token. A
// second 401 (or no refreshable credential) clears the session
// and bounces to login — there is no third attempt.
async function withAuthRecovery<T>(
    adapter: DbAdapter,
    make: (tok: string) => Promise<T>,
): Promise<T> {
    try {
        return await make(getSessionToken());
    } catch (err) {
        if (!(err instanceof UnauthorizedError)) {
            throw err;
        }
        const recovered = await sharedRecovery(adapter);
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
    adapter: DbAdapter,
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
    const now = Math.floor(Date.now() / 1000);
    const decision = resolveCredentialDecision(creds, now);
    // A live access token ('install') that still drew a 401 did not
    // expire — the holder was the unscoped anonymous seed (a read
    // raced ahead of boot scoping). Re-install the live token and
    // re-scope; the caller retries once. A genuinely dead token
    // (revoked, not expired) 401s the re-scope and falls through to
    // scrub + bounce — never destroying a live session over a
    // recoverable unscoped read.
    if (decision.kind === 'install') {
        return installAndScope(adapter, decision.accessToken);
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
    return installAndScope(adapter, refreshed.accessToken);
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
    adapter: DbAdapter,
    flatToken: string,
): Promise<string | null> {
    setSessionToken(flatToken);
    try {
        await rescopeToActiveOrg(adapter, flatToken);
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
    adapter: DbAdapter,
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
// active org, exactly as boot does — resolving the target from
// the REACHABLE set first, so the exchange never targets a
// non-member org (H13). Mirrors scopeBootToActiveOrg.
async function rescopeToActiveOrg(
    adapter: DbAdapter,
    flatToken: string,
): Promise<void> {
    const ctx = createRequestContext(adapter, flatToken);
    const reachable =
        (await getOrganizations(ctx)).map(o => o.id);
    if (reachable.length === 0) {
        return;
    }
    const active = resolveActiveOrg(
        reachable,
        getPreference(ACTIVE_ORG_KEY),
        await getIdentityDefaultOrg(ctx),
    );
    setSessionToken(
        await postOrgSessionExchange(ctx, flatToken, active));
    writePreference(ACTIVE_ORG_KEY, active);
}

// The active org the session is scoped to. Post-boot the
// session token always carries it; its absence is an impossible
// state — boot scopes the token before any org-bound request —
// so we crash rather than invent a default.
export function activeOrg(ctx: RequestContext): Id {
    const org = ctx.identity.organization;
    if (org === undefined) {
        throw new Error(
            'no active org on the session: boot must scope'
            + ' the token before an org-bound request',
        );
    }
    return org;
}

