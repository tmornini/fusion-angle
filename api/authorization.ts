import type {
    Id,
    RoleGrantAction,
    RoleGrantEntity,
    IdentityDefaultOrgEntity,
} from './types.ts';
import { latestByKey } from './ledger-reduction.ts';

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
export function currentRolesForInOrg(
    rows: readonly RoleGrantEntity[],
    identityId: Id,
    org: Id,
): string[] {
    const inOrg = rows.filter(
        row => row.identity_id === identityId
            && row.organization_id === org,
    );
    const latest = latestByKey(
        inOrg, row => row.role, failClosed,
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
export function currentDefaultOrgFor(
    rows: readonly IdentityDefaultOrgEntity[],
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

function matchesOnSegmentBoundary(
    pathname: string,
    prefix: string,
): boolean {
    if (prefix === '/') return true;
    return pathname === prefix
        || pathname.startsWith(prefix + '/');
}

// The verbs the `member` role may use, per content prefix.
// Admin surfaces — identities, credentials, clients,
// providers, role-grants, memberships, organization and
// member WRITES, snapshots — are absent: deny-by-default
// keeps them at the root admin entries. members/ai-members/
// human-members appear read-only here for author and roster
// display; their writes stay admin (member management).
// identity-tokens POST covers only its rotation/revocation
// sub-routes — session management any member performs.
const MEMBER_VERBS: Readonly<
    Record<string, readonly string[]>
> = {
    '/ideas': ['GET', 'PUT'],
    '/idea-submissions': ['GET', 'PUT'],
    '/projects': ['GET', 'PUT'],
    '/project-flows': ['GET', 'PUT', 'DELETE'],
    '/project-objective-baseline-scores': ['GET', 'PUT'],
    '/project-objective-actual-scores': ['GET', 'PUT'],
    '/objectives': ['GET', 'PUT'],
    '/objective-revisions': ['GET', 'PUT'],
    '/flows': ['GET', 'PUT'],
    '/flow-versions': ['GET', 'PUT', 'DELETE'],
    '/flow-work-orders': ['GET', 'PUT'],
    '/flow-records': ['GET', 'PUT', 'DELETE'],
    '/records': ['GET', 'PUT', 'DELETE'],
    '/record-attributes': ['GET', 'PUT', 'DELETE'],
    '/records-multi-put': ['POST'],
    '/state-field-values': ['GET', 'PUT', 'DELETE'],
    '/work-orders': ['GET', 'PUT', 'POST'],
    '/states': ['GET', 'PUT'],
    '/entity-states': ['GET'],
    '/commit': ['POST'],
    '/members': ['GET'],
    '/ai-members': ['GET'],
    '/human-members': ['GET'],
    '/current-member': ['GET'],
    '/organizations': ['GET'],
    '/identity-tokens': ['POST'],
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
