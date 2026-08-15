import {
    ANONYMOUS_ID,
    principalFromToken,
} from '../../../shared/access-token-decode.ts';

// Per-tab bearer holder. No mint, no IndexedDB — the
// browser seed still mints in init.ts; the server entry
// installs a decode-only anonymous stub or a login token.

let sessionToken: string | undefined;

export function putSessionToken(token: string): void {
    sessionToken = token;
}

export function deleteSessionToken(): void {
    sessionToken = undefined;
}

// True once postSessionSeed() (or putSessionToken()) has
// set a holder. Non-throwing so callers can probe before
// boot completes. getSessionToken() still throws if
// unseeded; the predicates below return false.
export function sessionTokenIsSeeded(): boolean {
    return sessionToken !== undefined;
}

// Returns the already-set per-tab token. Boot must have
// seeded it; the boot gate / login / recovery then REPLACE
// it via putSessionToken. An unseeded holder is a
// boot-order bug, not a state to mask — crash with a
// clear message rather than return a wrong token.
export function getSessionToken(): string {
    if (sessionToken === undefined) {
        throw new Error(
            'session token uninitialized;'
            + ' await postSessionSeed() first',
        );
    }
    return sessionToken;
}

// True only when the held token carries an organization
// claim — the post-exchange, organization-scoped session.
// The anonymous seed and an un-exchanged flat token both
// read false, so organization-bound surfaces can gate
// their reads on a real scoped session instead of firing
// them on a seed and surfacing a 401.
export function sessionIsOrganizationScoped(): boolean {
    if (!sessionTokenIsSeeded()) {
        return false;
    }
    return principalFromToken(getSessionToken())
        .organization !== undefined;
}

// True when the held token's identity can reach at least
// one organization. A freshly minted (flat) login token
// carries the reachable set before organization-scoping;
// an identity with zero memberships reads false, so login
// and boot can land it on invitations instead of an
// organization-scoped dead end.
export function sessionHasReachableOrganization(): boolean {
    if (!sessionTokenIsSeeded()) {
        return false;
    }
    const organizations =
        principalFromToken(getSessionToken())
            .organizations;
    return organizations !== undefined
        && organizations.length > 0;
}

// True when the held token belongs to a logged-in
// identity rather than the anonymous seed.
export function sessionIsAuthenticated(): boolean {
    if (!sessionTokenIsSeeded()) {
        return false;
    }
    return principalFromToken(getSessionToken()).id
        !== ANONYMOUS_ID;
}
