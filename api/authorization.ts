import type {
    Id,
    MembershipType,
    IdentityDefaultOrganizationEntity,
} from './types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';

// Claim role shape: `{type}:{organization_id}` (e.g. admin:1).
// Baked at mint from membership type + organization; projected
// back to plain ROUTE_POLICY bases (admin / member) for the
// fenced organization at the gate.
export function composeClaimRole(
    type: MembershipType,
    organizationId: Id,
): string {
    return type + ':' + organizationId;
}

// Project claim roles for the fenced organization into plain
// policy bases. A claim whose suffix is not the fenced org is
// invisible here — the per-tenant fence at the claim layer.
export function projectClaimRolesForOrganization(
    claimRoles: readonly string[],
    organization: Id,
): string[] {
    const suffix = ':' + organization;
    const held: string[] = [];
    for (const claim of claimRoles) {
        if (!claim.endsWith(suffix)) continue;
        const base = claim.slice(0, claim.length - suffix.length);
        if (base === 'admin' || base === 'member') {
            held.push(base);
        }
    }
    return held;
}

// The org an identity has CURRENTLY chosen as its default: the
// latest event in its append-only default-org ledger, null when
// it has none. The default (at, id) total order decides a
// same-`at` tie deterministically on every backend.
export function currentDefaultOrganizationFor(
    rows: readonly IdentityDefaultOrganizationEntity[],
    identityId: Id,
): Id | null {
    const chosen = latestByKey(rows, row => row.identity_id)
        .get(identityId);
    return chosen === undefined ? null : chosen.organization_id;
}

// A policy entry: the roles permitted to use `verb` on any
// path that begins with `pathPrefix` ON A SEGMENT BOUNDARY —
// matching enforces the boundary, so '/members' can never
// half-match '/memberships'.
export interface PolicyEntry {
    readonly verb: string;
    readonly pathPrefix: string;
    readonly roles: readonly string[];
}

export function matchesOnSegmentBoundary(
    pathname: string,
    prefix: string,
): boolean {
    if (prefix === '/') return true;
    const pathSegs = pathname.split('/').filter(Boolean);
    const prefixSegs = prefix.split('/').filter(Boolean);
    // A prefix matches when the pathname is at least as deep
    // and every prefix segment matches the pathname's segment
    // at that position — a `:`-prefixed prefix segment is the
    // route's variable id and matches any one segment. So
    // '/members' never half-matches '/memberships', and
    // '/flows/:id/versions' matches '/flows/f1/versions/v1'
    // but not the shallower '/flows/f1'.
    if (pathSegs.length < prefixSegs.length) return false;
    return prefixSegs.every(
        (seg, i) =>
            seg.startsWith(':') || seg === pathSegs[i],
    );
}

// The verbs the `member` role may use, per content prefix.
// Admin surfaces — identities, credentials,
// providers, memberships, organization and
// member WRITES, snapshots — are absent: deny-by-default
// keeps them at the root admin entries. members/ai-members/
// human-members appear read-only here for author and roster
// display; their writes stay admin (member management).
// identity-tokens POST covers only its rotation/revocation
// sub-routes — session management any member performs.
// identity-token-revocations PUT (WP8, Phase 13 Task 8) widens
// analogously: a member may revoke its OWN token chain — a real
// logout-everywhere, not merely rotation/revocation of a single
// session. This route-policy entry only clears the coarse
// content-prefix check; api/api.ts's Region B write authorizer
// keeps the write self-only — naming another identity still
// requires admin. GET stays admin-only, untouched.
const MEMBER_VERBS: Readonly<
    Record<string, readonly string[]>
> = {
    '/ideas': ['GET', 'PUT', 'POST'],
    '/ideas/:id/submissions': ['GET', 'PUT'],
    '/projects': ['GET', 'PUT'],
    '/projects/:id/flows': ['GET', 'PUT', 'DELETE'],
    '/projects/:id/objective-baseline-scores': ['GET', 'PUT'],
    '/projects/:id/objective-actual-scores': ['GET', 'PUT'],
    '/objectives': ['GET', 'PUT', 'POST'],
    '/objectives/:id/revisions': ['GET', 'PUT'],
    '/flows': ['GET', 'PUT', 'POST'],
    // GET /flows/:id/versions is pair-chain (member GET
    // rides '/flows'). Writes stay unwired (405).
    '/flows/:id/work-orders': ['GET', 'PUT'],
    '/flows/:id/records': ['GET', 'PUT', 'DELETE'],
    '/flows/:id/tags': ['GET', 'PUT', 'DELETE'],
    // Nested record-types schema READ (decision 16): one
    // MEMBER_VERBS row covers the whole subtree's GETs via
    // matchesOnSegmentBoundary (`:id` is a one-segment
    // wildcard). Schema mutations stay admin by absence —
    // flat /records and /record-attributes retired (Task 23).
    '/organizations/:id/record-types': ['GET'],
    // Nested instances: member PATCH create/update,
    // DELETE, GET. PUT stays listed so public PUT
    // 405s (Task 20) instead of 403ing at policy.
    // Path-tier only — field ACL gates set/clear.
    '/organizations/:id/record-types/:tid/instances':
        ['GET', 'PUT', 'PATCH', 'DELETE'],
    // Nested field-values collection RETIRED (states-URI
    // elimination C4); field values fold on WO history.
    '/work-orders': ['GET', 'PUT', 'POST'],
    // Bulk lifecycle collection RETIRED (states-URI
    // elimination C3).
    '/members': ['GET'],
    '/ai-members': ['GET'],
    '/human-members': ['GET'],
    '/current-member': ['GET'],
    '/organizations': ['GET'],
    '/identity-tokens': ['POST'],
    '/identity-token-revocations': ['PUT'],
};

const MEMBER_TIER: readonly PolicyEntry[] =
    Object.entries(MEMBER_VERBS).flatMap(
        ([pathPrefix, verbs]) => verbs.map(verb => ({
            verb, pathPrefix, roles: ['member'],
        })),
    );

// Deny-by-default policy. `admin` is allowed on every verb at
// the root prefix `/` — "admin everywhere" in five honest
// lines (Task 10 adds PATCH), no implicit-superuser special
// case. The member tier widens the content surfaces to the
// `member` role. Admin PATCH on handler-less routes answers
// 405 (known verb, no handler); members still 403 by absence
// of member PATCH rows outside future instance surfaces.
export const ROUTE_POLICY: readonly PolicyEntry[] = [
    { verb: 'GET', pathPrefix: '/', roles: ['admin'] },
    { verb: 'PUT', pathPrefix: '/', roles: ['admin'] },
    { verb: 'POST', pathPrefix: '/', roles: ['admin'] },
    { verb: 'DELETE', pathPrefix: '/', roles: ['admin'] },
    { verb: 'PATCH', pathPrefix: '/', roles: ['admin'] },
    ...MEMBER_TIER,
];

// Permitted iff SOME matching entry (same verb; pathname
// begins with prefix on a segment boundary) lists a role the
// principal holds. No match → false (deny-by-default).
export function isPermitted(
    method: string,
    pathname: string,
    heldRoles: readonly string[],
): boolean {
    for (const entry of ROUTE_POLICY) {
        if (entry.verb !== method) continue;
        if (!matchesOnSegmentBoundary(
            pathname, entry.pathPrefix,
        )) continue;
        for (const role of entry.roles) {
            if (heldRoles.includes(role)) return true;
        }
    }
    return false;
}
