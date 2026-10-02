import type { GuardedDbAdapter } from './db.ts';
import { nowUtc, type Id } from '../shared/types.ts';
import type { Principal } from './access-token.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    errorJson,
    HTTP_BAD_REQUEST,
    HTTP_LENGTH_REQUIRED,
} from '../shared/http-errors.ts';

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

// The server mints request-id. A carried header is refused
// at the gate; this step does not read one.

const BODY_NEEDS_LENGTH =
    'A request body requires Content-Length';

export interface IncomingContext {
    readonly requestId: string;
    readonly method: string;
    readonly pathname: string;
    // The raw query, including the leading '?'. Empty when
    // the request names none. A route's query slot reads it.
    readonly search: string;
    // The unfenced tier. Phase Final Task 5 retired the
    // org-scoped decorator shell; handlers receive this base
    // adapter. Pair-plane tenancy rides path, not a
    // store fence.
    readonly base: GuardedDbAdapter;
    // The ARRIVAL stamp: minted here, gate entry, as early as
    // the request is observable — the message plane's requests
    // row keeps it verbatim (api/message-pair.ts). nowUtc() is
    // synchronous, so minting it here costs nothing async.
    readonly requestAt: string;
    // performance.now() at arrival: a monotonic reading for
    // durations, never a stamp — it names no instant, and
    // only another performance.now() can be subtracted from
    // it (msSinceMonotonic).
    readonly arrivalMs: number;
    // Read once, here. Later steps decode these bytes.
    readonly bodyBytes: Uint8Array;
}

// operation-id, validated once at the gate. No later step
// writes it.
export interface FramedContext extends IncomingContext {
    readonly operationId: string;
}

// Enriched by the authentication step (request-auth.ts) —
// the one place the principal is resolved.
export interface AuthenticatedContext extends FramedContext {
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

export async function incomingContext(
    base: GuardedDbAdapter,
    request: Request,
): Promise<IncomingContext> {
    const bodyBytes = new Uint8Array(
        await request.arrayBuffer(),
    );
    const url = new URL(request.url);
    return {
        requestId: generateIdentifier(),
        method: request.method,
        pathname: url.pathname,
        search: url.search,
        base,
        requestAt: nowUtc(),
        arrivalMs: performance.now(),
        bodyBytes,
    };
}

function lengthMatches(
    value: string,
    byteLength: number,
): boolean {
    if (!/^\d+$/.test(value)) return false;
    if (value.length > 16) return false;
    return Number(value) === byteLength;
}

// First failure wins. A 411 does not inspect operation-id.
export function framingRefusal(
    headers: Headers,
    bodyBytes: Uint8Array,
): Response | undefined {
    if (headers.get('transfer-encoding') !== null) {
        return errorJson(
            BODY_NEEDS_LENGTH,
            HTTP_LENGTH_REQUIRED,
        );
    }
    const contentLength = headers.get('content-length');
    if (
        bodyBytes.byteLength > 0
        && contentLength === null
    ) {
        return errorJson(
            BODY_NEEDS_LENGTH,
            HTTP_LENGTH_REQUIRED,
        );
    }
    if (
        contentLength !== null
        && !lengthMatches(
            contentLength, bodyBytes.byteLength,
        )
    ) {
        return errorJson(
            'Content-Length does not match the body',
            HTTP_BAD_REQUEST,
        );
    }
    return undefined;
}
