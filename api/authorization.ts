import type {
    Id,
    RoleGrantAction,
    RoleGrantEntity,
    IdentityDefaultOrganizationEntity,
} from './types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';

// On an equal-`at` tie the FAIL-CLOSED action wins regardless
// of row order — a revoke beats a co-timestamped grant on
// every backend. Equal actions fall to the id tail for
// determinism.
const ACTION_RANK: Record<RoleGrantAction, number> = {
    revoked: 1,
    granted: 0,
};

function failClosed(
    candidate: RoleGrantEntity,
    incumbent: RoleGrantEntity,
): boolean {
    if (candidate.at !== incumbent.at) {
        return candidate.at > incumbent.at;
    }
    const c = ACTION_RANK[candidate.action];
    const i = ACTION_RANK[incumbent.action];
    if (c !== i) return c > i;
    return candidate.id > incumbent.id;
}

// Roles an identity currently holds IN A GIVEN ORG: the latest
// action per role within that org — a 'granted' with no later
// 'revoked' wins. The org predicate sits beside the identity
// filter, so a grant in another org is invisible here: this is
// the per-tenant fence at the role layer, the half of
// `role_grants.organization_id` the gate had been writing but
// never reading. A same-`at` tie falls to the fail-closed rank
// above.
export function currentRolesForInOrganization(
    rows: readonly RoleGrantEntity[],
    identityId: Id,
    organization: Id,
): string[] {
    const inOrganization = rows.filter(
        row => row.identity_id === identityId
            && row.organization_id === organization,
    );
    const latest = latestByKey(
        inOrganization, row => row.role, failClosed,
    );
    const held: string[] = [];
    for (const [role, last] of latest) {
        if (last.action === 'granted') held.push(role);
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
// providers, role-grants, memberships, organization and
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
// content-prefix check; api/api.ts's Region B ownership fence
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
    '/flows/:id/versions': ['GET', 'PUT', 'POST', 'DELETE'],
    '/flows/:id/work-orders': ['GET', 'PUT'],
    '/flows/:id/records': ['GET', 'PUT', 'DELETE'],
    '/records': ['GET', 'PUT', 'DELETE', 'POST'],
    '/record-attributes': ['GET', 'PUT', 'DELETE'],
    '/states/:id/field-values': ['GET', 'PUT', 'DELETE'],
    '/work-orders': ['GET', 'PUT', 'POST'],
    '/states': ['GET', 'PUT'],
    '/entity-states': ['GET'],
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
// the root prefix `/` — "admin everywhere" in four honest
// lines, no implicit-superuser special case. The member tier
// widens the content surfaces to the `member` role.
export const ROUTE_POLICY: readonly PolicyEntry[] = [
    { verb: 'GET', pathPrefix: '/', roles: ['admin'] },
    { verb: 'PUT', pathPrefix: '/', roles: ['admin'] },
    { verb: 'POST', pathPrefix: '/', roles: ['admin'] },
    { verb: 'DELETE', pathPrefix: '/', roles: ['admin'] },
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
