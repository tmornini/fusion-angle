import {
    nowEpochSeconds,
    type Id,
} from '../../../api/types.ts';
import {
    UnauthorizedError,
} from '../../../api/http-errors.ts';
import { OPERATION_ID_HEADER } from
    '../../../api/message-pair.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    getSessionToken,
    putSessionToken,
    sessionTokenIsSeeded,
} from './session-token.ts';
import {
    getClientFacade,
    wrapClientAdapter,
} from './facade-holder.ts';
import {
    type Principal,
    principalFromToken,
} from '../../../shared/access-token-decode.ts';
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
import { isCookieSession } from './session-credentials.ts';
import { runSingleFlightRefresh } from
    './session-refresh-mutex.ts';
import { redirectToLogin } from '../auth-redirect.ts';
import { getOrganizations } from './organizations.ts';
import {
    getIdentityDefaultOrganization,
} from './identity-default-organization.ts';
import { log } from '../logger.ts';
import {
    resolveActiveOrganization,
    postOrganizationSessionExchange,
} from './organization-session.ts';
import {
    recordApiRequest,
} from '../page-request-profile.ts';
import type { HttpFacade } from './http-facade.ts';

// Either the in-page handleRequest adapter or the fetch
// facade. RequestContext verbs are the same on both.
type ClientFacade = HttpFacade | object;

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

// G1 stores trio on the PUT; GET streams it. Pre-G1
// rows still fill lifecycle from GET :id/versions.
interface TrioRow {
    readonly id: string;
    readonly state?: string;
    readonly state_at?: string;
    readonly state_event_id?: string;
}

interface VersionRow {
    readonly id: string;
    readonly state: string;
    readonly at: string;
    readonly version?: string;
}

export async function withLifecycleTrio<T extends TrioRow>(
    ctx: RequestContext,
    family: string,
    row: T,
): Promise<T> {
    if (row.state !== undefined) return row;
    const history = await ctx.GET<readonly VersionRow[]>(
        family + '/' + row.id + '/versions',
    );
    const current = history[0];
    if (current === undefined) return row;
    return {
        ...row,
        state: current.state,
        state_at: current.at,
        state_event_id: current.id,
    };
}

export async function withLifecycleTrios<T extends TrioRow>(
    ctx: RequestContext,
    family: string,
    rows: readonly T[],
): Promise<T[]> {
    return Promise.all(
        rows.map(
            (row) => withLifecycleTrio(ctx, family, row),
        ),
    );
}



export interface RequestContext {
    readonly requestId: string;
    readonly identity: Principal;
    GET<T>(resource: string): Promise<T>;
    // Body plus strong ETag (quotes stripped) for If-Match.
    GETWithEtag<T>(
        resource: string,
    ): Promise<{ body: T; etag: string | undefined }>;
    PUT<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<T>;
    PUTWithEtag<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<{ body: T; etag: string | undefined }>;
    PATCH<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<T>;
    PATCHWithEtag<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<{ body: T; etag: string | undefined }>;
    DELETE(resource: string): Promise<void>;
    POST<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    // Sibling of POST that carries extra headers
    // (If-Match on value-bearing transitions). Existing
    // POST callers stay header-free.
    POSTWithHeaders<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields:
            readonly (readonly [string, string])[],
    ): Promise<T>;
}

// The recovery-free context: each verb runs directly on its
// captured token. The recovering sibling below is the
// sessionContext path.
export function createRequestContext(
    adapter: ClientFacade,
    token: string,
): RequestContext {
    return makeRequestContext(adapter, token, false);
}

// The recovery-enabled context: a 401 refreshes the session
// via withAuthRecovery and retries against the live token
// once.
export function createRecoveringRequestContext(
    adapter: ClientFacade,
    token: string,
): RequestContext {
    return makeRequestContext(adapter, token, true);
}

function guestPrincipal(): Principal {
    return {
        id: '',
        roles: [],
        name: '',
    };
}

function makeRequestContext(
    adapter: ClientFacade,
    token: string,
    recover: boolean,
): RequestContext {
    const identity = token === ''
        ? guestPrincipal()
        : principalFromToken(token);
    const verbs = wrapClientAdapter(adapter);

    function run<T>(
        make: (tok: string) => Promise<T>,
    ): Promise<T> {
        return recover
            ? withAuthRecovery(
                adapter, token, identity.organization, make)
            : make(token);
    }

    // One vessel id for the whole client request: reportFault
    // logs it, and every wire verb carries it as
    // REQUEST_ID_HEADER so the server gate reuses it instead
    // of minting a second, unrelated trace.
    const requestId = generateCryptoSafeBase62();
    const operationId = generateCryptoSafeBase62();
    function writeHeaders(
        extra?:
            readonly (readonly [string, string])[],
    ): readonly (readonly [string, string])[] {
        if (extra?.some(([name]) =>
            name.toLowerCase() === OPERATION_ID_HEADER
        )) {
            return extra;
        }
        return [
            [OPERATION_ID_HEADER, operationId],
            ...(extra ?? []),
        ];
    }
    const ctx: RequestContext = {
        requestId,
        identity,
        GET: <T>(resource: string) => {
            recordApiRequest('GET', resource);
            return run<T>(tok => verbs.GET<T>(
                resource, tok, requestId,
            ));
        },
        GETWithEtag: <T>(resource: string) => {
            recordApiRequest('GET', resource);
            return run<{
                body: T;
                etag: string | undefined;
            }>(
                tok => verbs.GETWithEtag<T>(
                    resource, tok, requestId,
                ),
            );
        },
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?:
                readonly (readonly [string, string])[],
        ) => {
            recordApiRequest('PUT', resource);
            return run<T>(
                tok => verbs.PUT<T>(
                    resource, body, tok,
                    writeHeaders(headerFields), requestId,
                ));
        },
        PUTWithEtag: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?:
                readonly (readonly [string, string])[],
        ) => {
            recordApiRequest('PUT', resource);
            return run<{
                body: T;
                etag: string | undefined;
            }>(
                tok => verbs.PUTWithEtag<T>(
                    resource, body, tok,
                    writeHeaders(headerFields), requestId,
                ),
            );
        },
        PATCH: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?:
                readonly (readonly [string, string])[],
        ) => {
            recordApiRequest('PATCH', resource);
            return run<T>(
                tok => verbs.PATCH<T>(
                    resource, body, tok,
                    writeHeaders(headerFields), requestId,
                ));
        },
        PATCHWithEtag: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?:
                readonly (readonly [string, string])[],
        ) => {
            recordApiRequest('PATCH', resource);
            return run<{
                body: T;
                etag: string | undefined;
            }>(
                tok => verbs.PATCHWithEtag<T>(
                    resource, body, tok,
                    writeHeaders(headerFields), requestId,
                ),
            );
        },
        DELETE: (resource: string) => {
            recordApiRequest('DELETE', resource);
            return run<void>(
                tok => verbs.DELETE(
                    resource, tok, requestId,
                    writeHeaders(),
                ));
        },
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => {
            recordApiRequest('POST', resource);
            return run<T>(
                tok => verbs.POST<T>(
                    resource, body, tok,
                    requestId, writeHeaders(),
                ));
        },
        POSTWithHeaders: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields:
                readonly (readonly [string, string])[],
        ) => {
            recordApiRequest('POST', resource);
            return run<T>(
                tok => verbs.POST<T>(
                    resource, body, tok,
                    requestId, writeHeaders(headerFields),
                ));
        },
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
        getClientFacade(), getSessionToken(),
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
    adapter: ClientFacade,
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
    adapter: ClientFacade,
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
    adapter: ClientFacade,
    requestOrganization: Id | undefined,
): Promise<string | null> {
    let creds: SessionCredentials | null;
    try {
        creds = getSessionCredentials();
    } catch (err) {
        // a corrupt blob is unrecoverable — scrub and bounce
        log.warn(
            'corrupt session credential',
            'shared',
            err,
        );
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
    if (isCookieSession()) {
        // HttpFacade already single-flights the cookie
        // refresh. A second POST here is reuse.
        deleteSessionCredentials();
        redirectToLogin();
        return null;
    }
    if (decision.kind !== 'refresh') {
        deleteSessionCredentials();
        redirectToLogin();
        return null;
    }
    const access = await refreshCredentials(
        adapter, decision.refreshToken);
    if (access === null) {
        return null;
    }
    return installAndScope(
        adapter, access, requestOrganization);
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
    adapter: ClientFacade,
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
    adapter: ClientFacade,
    refreshToken: string,
): Promise<string | null> {
    const token = sessionTokenIsSeeded()
        ? getSessionToken()
        : '';
    const free = createRequestContext(adapter, token);
    try {
        const access = await runSingleFlightRefresh(
            async () => {
                try {
                    const creds = await postSessionRefresh(
                        free, refreshToken);
                    putSessionCredentials(creds);
                    return creds.accessToken;
                } catch (err) {
                    if (err instanceof UnauthorizedError) {
                        return null;
                    }
                    throw err;
                }
            },
        );
        if (access === null) {
            deleteSessionCredentials();
            redirectToLogin();
            return null;
        }
        return access;
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
    adapter: ClientFacade,
    flatToken: string,
    requestOrganization: Id | undefined,
): Promise<void> {
    const ctx = createRequestContext(adapter, flatToken);
    // Overlap independent rescope reads. Named delta: the
    // default-org read now fires (and can surface errors)
    // on the empty-membership corner path too.
    const [
        organizations, defaultOrganization,
    ] = await Promise.all([
        getOrganizations(ctx),
        getIdentityDefaultOrganization(ctx),
    ]);
    const reachable = organizations.map(o => o.id);
    if (reachable.length === 0) {
        return;
    }
    const active = resolveActiveOrganization(
        reachable,
        requestOrganization ?? null,
        defaultOrganization,
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
