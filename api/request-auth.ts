import type { DbAdapter } from './db.ts';
import {
    nowEpochSeconds,
    type Id,
} from './types.ts';
import {
    verifyAccessToken,
    principalFromClaims,
    ANONYMOUS_ID,
    type Principal,
} from './access-token.ts';
import type {
    IncomingContext,
    AuthenticatedContext,
    RequestContext,
} from './request-context.ts';
import { HTTP_FORBIDDEN } from './http-errors.ts';
import {
    projectClaimRolesForOrganization,
    isPermitted,
} from './authorization.ts';
import {
    identityDefaultOrganization,
} from './authentication.ts';

// Authenticate at the one chokepoint. Match is pure and
// first, but authentication runs BEFORE the no-match 404 —
// an unauthenticated caller to ANY non-exempt path
// (including unknown and retired) gets 401, never a route-
// topology oracle. A 401 states only "no valid credentials."
// Resource existence (404) is shown only to an authenticated
// caller (or on a bearer-exempt route). The authentication
// grant surface is permanently exempt — a caller cannot hold
// a token before minting one. Exempt-from-the-gate is NOT
// the same as unauthenticated — it is a single audited
// surface; any addition here is security-sensitive.
export const AUTHENTICATION_ROUTES: ReadonlySet<string> =
    new Set([
        'authentication/token',
        'authentication/authorize',
    ]);

// The snapshot/bootstrap plane is auth-free — a dev-tier
// install/demo surface that runs below the auth tier (it
// installs the datastore before any identity can exist). It
// carries no bearer and no route policy, regardless of
// whether a schema exists. This is a KNOWN, accepted dev-tier
// decision, not a regression — see ARCHITECTURE.md
// § Server-tier deploy blockers. The whole exemption MUST be
// removed or re-gated when the Postgres server tier lands.
export const BOOTSTRAP_ROUTES: ReadonlySet<string> =
    new Set([
        'snapshots/schema',
        'snapshots/mock-data',
        'snapshots/bootstrap',
        'snapshots/import',
    ]);

export async function authenticateRequest(
    ctx: IncomingContext,
    request: Request,
): Promise<AuthenticatedContext | string> {
    const header =
        request.headers.get('authorization');
    if (header === null
        || !header.startsWith('Bearer ')) {
        return 'missing bearer token';
    }
    const token = header.slice('Bearer '.length);
    const now = nowEpochSeconds();
    const result = await verifyAccessToken(token, now);
    if (!result.valid) {
        return result.reason;
    }
    if (result.claims.sub === ANONYMOUS_ID) {
        return 'anonymous principal not authenticated';
    }
    // Per-request revocation retired: mint/refresh/exchange
    // still consult the revocation ledger. A revoked access
    // token works until exp (≤ ACCESS_TTL_SECONDS) — the
    // NAMED ≤15-min staleness covenant.
    return {
        ...ctx,
        principal: principalFromClaims(result.claims),
    };
}

type FenceResult =
    | { ok: true; ctx: RequestContext }
    | { ok: false; error: string; status: number };

// The fence step: every authenticated request resolves an
// organization ONCE here — the verified token claim, else the
// identity's default (its set choice, else primary membership)
// — and rides the vessel for authz. A flat token whose
// identity resolves to no organization is DENIED: there is no
// global default to fall back on.
//
// NAMED COVENANT (membership/role/revocation staleness):
// membership and roles come from token claims, not live
// identity-spine reads. De-membership, demotion, and
// logout-everywhere bite at the next mint/refresh/exchange
// or access-token expiry — ≤ ACCESS_TTL_SECONDS (15 min) —
// not on the very next request. Ownership fences
// (write authorizer / resolveGlobalOwner) remain pair-plane
// reads. Phase Final Task 5 retired the store decorator:
// handlers receive ctx.base; pair-plane tenancy rides
// uri_prefix.
export async function fenceRequest(
    ctx: AuthenticatedContext,
): Promise<FenceResult> {
    const organization = ctx.principal.organization
        ?? await identityDefaultOrganization(
            ctx.base, ctx.principal.id,
        );
    if (organization === null) {
        return {
            ok: false,
            error: 'forbidden: identity has no'
                + ' organization',
            status: HTTP_FORBIDDEN,
        };
    }
    const memberOrganizations =
        callerOrganizationIdsFromClaims(ctx.principal);
    if (!memberOrganizations.has(organization)) {
        return {
            ok: false,
            error: 'forbidden: no longer a member'
                + ' of this organization',
            status: HTTP_FORBIDDEN,
        };
    }
    const roles = projectClaimRolesForOrganization(
        ctx.principal.roles, organization,
    );
    return {
        ok: true,
        ctx: {
            ...ctx,
            organization,
            memberOrganizations,
            roles,
        },
    };
}

export function authorizeRequest(
    ctx: RequestContext,
): string | null {
    if (isPermitted(ctx.method, ctx.pathname, ctx.roles)) {
        return null;
    }
    return 'forbidden: ' + ctx.method + ' ' + ctx.pathname
        + ' requires a role this principal lacks';
}

// The PII facet of an identity's subtree. A member reads ONLY
// its own (GET self); writes are its own OR an admin's (member
// management). Mirrors the tree-ownership check of
// /identities/:id/default-org, widened to admin for writes.
export function authorizeIdentityPii(
    ctx: RequestContext,
    targetId: string,
): string | null {
    if (ctx.principal.id === targetId) {
        return null;
    }
    if (ctx.method === 'GET') {
        return 'forbidden: an identity may read only its'
            + ' own pii';
    }
    if (ctx.roles.includes('admin')) {
        return null;
    }
    return "forbidden: writing another identity's pii"
        + ' requires an admin role';
}

// The orgs a caller can reach, from the token's organizations
// claim (mint-time membership snapshot). Shared by GET
// /organizations and the organizations/:id read fence in
// handleRequest. Staleness is the NAMED ≤15-min covenant.
export function callerOrganizationIdsFromClaims(
    principal: Principal,
): Set<Id> {
    return new Set(principal.organizations ?? []);
}

// Adapter-shaped alias retained for callers that still pass
// a DbAdapter — the claim set is authoritative; the adapter
// is unused. Prefer callerOrganizationIdsFromClaims.
export async function callerOrganizationIds(
    _adapter: DbAdapter,
    principal: Principal,
): Promise<Set<Id>> {
    return callerOrganizationIdsFromClaims(principal);
}

// Parse a request body that must be a JSON OBJECT. Valid JSON
// that is not an object (null, number, string, array) is the
// same client fault as malformed JSON — both stop at the 400
// gate, neither reaches the domain boundary.
type ParsedBody =
    | { ok: true; body: Record<string, unknown> }
    | { ok: false };

export async function parseObjectBody(
    request: Request,
): Promise<ParsedBody> {
    let parsed: unknown;
    try {
        parsed = await request.json();
    } catch {
        return { ok: false };
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        return { ok: false };
    }
    return {
        ok: true,
        body: parsed as Record<string, unknown>,
    };
}
