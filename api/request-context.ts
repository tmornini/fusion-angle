import type { DbAdapter, GuardedDbAdapter } from './db.ts';
import type { Id } from './types.ts';
import type { Principal } from './access-token.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';

// The server half of the request vessel (Office of the
// Context): one context enters at the gate and rides the
// pipeline, and each field is set exactly once, at the step
// that resolves it. This module owns the entry stage; the
// authentication and fence steps enrich it downstream. The
// vessel is loggable BY COVENANT — it never carries the
// bearer token; authentication reads the header from the raw
// Request and the secret stays there. Route handlers keep
// their (adapter, params, body) contract: the route table is
// the chosen boundary where the vessel hands the fenced
// adapter to the handler.

// The request id travels the whole hop chain: the facade
// rewrite re-enters handleRequest with this header so the
// inner hop keeps the outer request's id — one user request,
// one trace.
export const REQUEST_ID_HEADER = 'x-request-id';

export interface IncomingContext {
    readonly requestId: string;
    readonly method: string;
    readonly pathname: string;
    // The unfenced tier, carried with its full honest face so
    // the fence step can consume the guarded write capability
    // without re-acquiring it by assertion.
    readonly base: GuardedDbAdapter;
}

// Enriched by the authentication step (request-auth.ts) —
// the one place the principal is resolved.
export interface AuthenticatedContext extends IncomingContext {
    readonly principal: Principal;
}

// Completed by the fence step (request-auth.ts) — the one
// place the org, the live memberships, the roles, and the
// org-scoped adapter are resolved.
export interface RequestContext extends AuthenticatedContext {
    readonly organization: Id;
    // The caller's live membership orgs, derived from the
    // ledger at the fence — the one truth the liveness check
    // and the organizations/:id read fence both consume.
    readonly memberOrgs: ReadonlySet<Id>;
    readonly roles: readonly string[];
    readonly scoped: DbAdapter;
}

export function incomingContext(
    base: GuardedDbAdapter,
    request: Request,
): IncomingContext {
    return {
        requestId:
            request.headers.get(REQUEST_ID_HEADER)
                ?? generateCryptoSafeBase62(),
        method: request.method,
        pathname: new URL(request.url).pathname,
        base,
    };
}
