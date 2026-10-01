import {
    nowEpochSeconds,
    type Id,
} from '../shared/types.ts';
import {
    UnauthorizedError,
} from '../shared/http-errors.ts';
import { OPERATION_ID_HEADER } from '../shared/message-id-fields.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import type { ClientSession } from './client-session.ts';
import {
    type Principal,
    principalFromToken,
} from '../shared/access-token-decode.ts';
import {
    resolveCredentialDecision,
} from './credential-resolution.ts';
import type { SessionCredentials } from './session-credentials.ts';
import { postSessionRefresh } from './session-refresh.ts';
import { getOrganizations } from './organizations.ts';
import {
    getIdentityDefaultOrganization,
} from './identity-default-organization.ts';
import {
    resolveActiveOrganization,
    postOrganizationSessionExchange,
} from './organization-session.ts';
import type { HeaderFields, HttpFacade } from './http-facade.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';

// The app's hands, given to a client at construction.
export interface ClientNavigation {
    redirectToLogin(): void;
    navigateToAuth(): void;
}

export interface ClientLog {
    warn(message: string, context?: string, ...data: unknown[]): void;
}

export type RequestRecorder = (
    method: string,
    resource: string,
) => void;

// All concurrent 401s share ONE recovery: the first failure
// starts it, the rest await the same promise — a burst of
// parallel reads over an expired token spends the refresh jti
// exactly once. A second spend would be branded reuse by the
// grant, revoking the winner's fresh chain and force-logging
// the user out. Cleared on settle so the NEXT 401 starts a
// fresh recovery.
export type SharedRecovery = (
    start: () => Promise<string | null>,
) => Promise<string | null>;

export function createSharedRecovery(): SharedRecovery {
    let recoveryInFlight: Promise<string | null> | null = null;
    return (start) => {
        recoveryInFlight ??= start().finally(() => {
            recoveryInFlight = null;
        });
        return recoveryInFlight;
    };
}

// What one client's contexts close over: its bound
// transport, its session, the app's hands, and its one
// recovery in flight.
export interface ClientCore {
    readonly facade: HttpFacade;
    readonly session: ClientSession;
    readonly navigation: ClientNavigation;
    readonly log: ClientLog;
    readonly recordRequest: RequestRecorder;
    readonly recovery: SharedRecovery;
}

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

// What a write derives from: the messages it latches,
// parent first, in the order its route judges them, or
// the declaration that it creates a document.
export type Latch =
    | readonly [HttpMessage, ...HttpMessage[]]
    | 'creates';

// The precondition a latch sends: each message's etag
// line as received, or If-None-Match: * for a create. A
// latched message with no etag line is a bug: the write
// would go blind.
function latchFields(latch: Latch): HeaderFields {
    if (latch === 'creates') return [['If-None-Match', '*']];
    return [[
        'If-Match',
        latch.map((message) => {
            const tag = message.query('header.etag');
            if (!tag.exists()) {
                throw new Error(
                    'a latched message carries no etag line;'
                        + ' the write would go blind',
                );
            }
            return tag.toText();
        }).join(', '),
    ]];
}

export function organizationCollection(
    ctx: RequestContext,
    family: string,
): string {
    return 'organizations/'
        + activeOrganization(ctx)
        + '/' + family + '/';
}

export function organizationItem(
    ctx: RequestContext,
    family: string,
    id: string,
): string {
    return 'organizations/'
        + activeOrganization(ctx)
        + '/' + family + '/' + id;
}

export interface RequestContext {
    readonly operationId: string;
    readonly identity: Principal;
    // This context's client session. A verb that reads or
    // replaces the session goes through it.
    readonly session: ClientSession;
    GET<T>(resource: string): Promise<HttpMessage<T>>;
    GETCollection<T>(resource: string): Promise<HttpMessage<T>[]>;
    PUT<T>(
        resource: string,
        body: Record<string, unknown>,
        latch?: Latch,
    ): Promise<HttpMessage<T>>;
    PATCH<T>(
        resource: string,
        body: Record<string, unknown>,
        latch: Latch,
    ): Promise<HttpMessage<T>>;
    POST<T>(
        resource: string,
        body: Record<string, unknown>,
        latch?: Latch,
    ): Promise<HttpMessage<T>>;
    DELETE(resource: string, latch?: Latch): Promise<HttpMessage>;
    // Door POST. Token is always empty, so the session
    // bearer never rides the grant's authorization line.
    POSTUnauthenticated<T>(
        resource: string,
        body: Record<string, unknown>,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
}

// The recovery-free context: each verb runs directly on its
// captured token. The recovering sibling below is the
// sessionContext path.
export function createRequestContext(
    core: ClientCore,
    token: string,
): RequestContext {
    return makeRequestContext(core, token, false);
}

// The recovery-enabled context: a 401 refreshes the session
// via withAuthRecovery and retries against the live token
// once.
export function createRecoveringRequestContext(
    core: ClientCore,
    token: string,
): RequestContext {
    return makeRequestContext(core, token, true);
}

function guestPrincipal(): Principal {
    return {
        id: '',
        roles: [],
        name: '',
    };
}

function makeRequestContext(
    core: ClientCore,
    token: string,
    recover: boolean,
): RequestContext {
    // One id for this operation. Recovery reuses it;
    // no other site mints one.
    return openRequestContext(
        core, token, recover, generateIdentifier(),
    );
}

function openRequestContext(
    core: ClientCore,
    token: string,
    recover: boolean,
    operationId: string,
): RequestContext {
    const identity = token === ''
        ? guestPrincipal()
        : principalFromToken(token);
    const verbs = core.facade;

    function run<T>(
        make: (tok: string) => Promise<T>,
    ): Promise<T> {
        return recover
            ? withAuthRecovery(
                core, token, identity.organization,
                operationId, make)
            : make(token);
    }

    function writeHeaders(
        extra?: HeaderFields,
    ): HeaderFields {
        return [
            [OPERATION_ID_HEADER, operationId],
            ...(extra ?? []),
        ];
    }
    function latchHeaders(latch: Latch | undefined): HeaderFields {
        return latch === undefined
            ? writeHeaders()
            : writeHeaders(latchFields(latch));
    }
    const ctx: RequestContext = {
        operationId,
        identity,
        session: core.session,
        GET: <T>(resource: string) => {
            core.recordRequest('GET', resource);
            const headers = writeHeaders();
            return run<HttpMessage<T>>(tok => verbs.GET<T>(
                resource, tok, headers,
            ));
        },
        GETCollection: <T>(resource: string) => {
            core.recordRequest('GET', resource);
            const headers = writeHeaders();
            return run<HttpMessage<T>[]>(
                tok => verbs.GETCollection<T>(
                    resource, tok, headers,
                ));
        },
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
            latch?: Latch,
        ) => {
            core.recordRequest('PUT', resource);
            const headers = latchHeaders(latch);
            return run<HttpMessage<T>>(
                tok => verbs.PUT<T>(
                    resource, body, tok, headers,
                ));
        },
        PATCH: <T>(
            resource: string,
            body: Record<string, unknown>,
            latch: Latch,
        ) => {
            core.recordRequest('PATCH', resource);
            const headers = latchHeaders(latch);
            return run<HttpMessage<T>>(
                tok => verbs.PATCH<T>(
                    resource, body, tok, headers,
                ));
        },
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
            latch?: Latch,
        ) => {
            core.recordRequest('POST', resource);
            const headers = latchHeaders(latch);
            return run<HttpMessage<T>>(
                tok => verbs.POST<T>(
                    resource, body, tok, headers,
                ));
        },
        DELETE: (resource: string, latch?: Latch) => {
            core.recordRequest('DELETE', resource);
            const headers = latchHeaders(latch);
            return run<HttpMessage>(
                tok => verbs.DELETE(
                    resource, tok, headers,
                ));
        },
        POSTUnauthenticated: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?: HeaderFields,
        ) => {
            core.recordRequest('POST', resource);
            const headers = writeHeaders(headerFields);
            return verbs.POSTUnauthenticated<T>(
                resource, body, headers,
            );
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

// Wrap one verb call with single-shot 401 recovery. The first
// attempt runs on the request's own vessel token — never the
// session's live token, so identity and wire credential cannot
// diverge mid-request (one vessel truth). A non-401 fault
// surfaces untouched. A 401 drives one refresh + re-scope; the
// call is retried exactly once against the recovered token. A
// second 401 (or no refreshable credential) clears the session
// and bounces to login — there is no third attempt.
async function withAuthRecovery<T>(
    core: ClientCore,
    token: string,
    requestOrganization: Id | undefined,
    operationId: string,
    make: (tok: string) => Promise<T>,
): Promise<T> {
    try {
        return await make(token);
    } catch (err) {
        if (!(err instanceof UnauthorizedError)) {
            throw err;
        }
        const recovered = await core.recovery(
            () => recoverSession(
                core, requestOrganization, operationId,
            ),
        );
        if (recovered === null) {
            throw err;   // unrefreshable — already redirected
        }
        try {
            return await make(recovered);
        } catch (retryErr) {
            if (retryErr instanceof UnauthorizedError) {
                core.session.deleteSessionCredentials();
                core.navigation.redirectToLogin();
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
    core: ClientCore,
    requestOrganization: Id | undefined,
    operationId: string,
): Promise<string | null> {
    let creds: SessionCredentials | null;
    try {
        creds = core.session.getSessionCredentials();
    } catch (err) {
        // a corrupt blob is unrecoverable — scrub and bounce
        core.log.warn(
            'corrupt session credential',
            'shared',
            err,
        );
        core.session.deleteSessionCredentials();
        core.navigation.redirectToLogin();
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
            core, decision.accessToken,
            requestOrganization, operationId);
    }
    if (core.session.isCookieSession()) {
        // HttpFacade already single-flights the cookie
        // refresh. A second POST here is reuse.
        core.session.deleteSessionCredentials();
        core.navigation.redirectToLogin();
        return null;
    }
    if (decision.kind !== 'refresh') {
        core.session.deleteSessionCredentials();
        core.navigation.redirectToLogin();
        return null;
    }
    const access = await refreshCredentials(
        core, decision.refreshToken, operationId);
    if (access === null) {
        return null;
    }
    return installAndScope(
        core, access, requestOrganization, operationId);
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
    core: ClientCore,
    flatToken: string,
    requestOrganization: Id | undefined,
    operationId: string,
): Promise<string | null> {
    core.session.putSessionToken(flatToken);
    try {
        await rescopeToActiveOrganization(
            core, flatToken, requestOrganization,
            operationId);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            core.session.deleteSessionCredentials();
            core.navigation.redirectToLogin();
            return null;
        }
        throw err;
    }
    return core.session.getSessionToken();
}

// Run the refresh grant on a recovery-FREE context: a refresh
// that itself 401s (reuse/expiry) is terminal and must not
// recurse. The free context reuses the failing operation id
// rather than minting another. A dead refresh scrubs the
// session and bounces.
async function refreshCredentials(
    core: ClientCore,
    refreshToken: string,
    operationId: string,
): Promise<string | null> {
    const token = core.session.sessionTokenIsSeeded()
        ? core.session.getSessionToken()
        : '';
    const free = openRequestContext(
        core, token, false, operationId,
    );
    try {
        const access = await core.session.runSingleFlightRefresh(
            async () => {
                try {
                    const creds = await postSessionRefresh(
                        free, refreshToken);
                    core.session.putSessionCredentials(creds);
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
            core.session.deleteSessionCredentials();
            core.navigation.redirectToLogin();
            return null;
        }
        return access;
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            core.session.deleteSessionCredentials();
            core.navigation.redirectToLogin();
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
    core: ClientCore,
    flatToken: string,
    requestOrganization: Id | undefined,
    operationId: string,
): Promise<void> {
    const ctx = openRequestContext(
        core, flatToken, false, operationId,
    );
    // Overlap independent rescope reads. Named delta: the
    // default-organization read now fires (and can surface
    // errors)
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
    core.session.putSessionToken(
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
