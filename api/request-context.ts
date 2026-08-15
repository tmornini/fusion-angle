import type { GuardedDbAdapter } from './db.ts';
import { nowUtc, type Id } from './types.ts';
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
// the chosen boundary where the vessel hands the base
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
    // The unfenced tier. Phase Final Task 5 retired the
    // org-scoped decorator shell; handlers receive this base
    // adapter. Pair-plane tenancy rides uri_collection, not a
    // store fence.
    readonly base: GuardedDbAdapter;
    // The ARRIVAL stamp: minted here, gate entry, as early as
    // the request is observable — the message plane's requests
    // row keeps it verbatim (api/message-pair.ts). nowUtc() is
    // synchronous, so minting it here costs nothing async.
    readonly requestAt: string;
}

// Enriched by the authentication step (request-auth.ts) —
// the one place the principal is resolved.
export interface AuthenticatedContext extends IncomingContext {
    readonly principal: Principal;
}

// Completed by the fence step (request-auth.ts) — the one
// place the organization, the live memberships, and the
// roles are resolved. No scoped adapter: surviving stores
// are global (message plane).
export interface RequestContext extends AuthenticatedContext {
    readonly organization: Id;
    // The caller's live membership orgs, derived from the
    // ledger at the fence — the one truth the liveness check
    // and the organizations/:id read fence both consume.
    readonly memberOrganizations: ReadonlySet<Id>;
    readonly roles: readonly string[];
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
        requestAt: nowUtc(),
    };
}
