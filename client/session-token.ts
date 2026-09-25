import {
    ANONYMOUS_ID,
    principalFromToken,
} from '../shared/access-token-decode.ts';

// Per-client bearer holder. No mint — the test composition
// root (`adapters/init.ts`) seeds an anonymous token; the
// server entry installs a login token.

export interface SessionTokenHolder {
    putSessionToken(token: string): void;
    deleteSessionToken(): void;
    // True once postSessionSeed() (or putSessionToken()) has
    // set a holder. Non-throwing so callers can probe before
    // boot completes. getSessionToken() still throws if
    // unseeded; the predicates below return false.
    sessionTokenIsSeeded(): boolean;
    // Returns the already-set per-tab token. Boot must have
    // seeded it; the boot gate / login / recovery then REPLACE
    // it via putSessionToken. An unseeded holder is a
    // boot-order bug, not a state to mask — crash with a
    // clear message rather than return a wrong token.
    getSessionToken(): string;
    // True only when the held token carries an organization
    // claim — the post-exchange, organization-scoped session.
    // The anonymous seed and an un-exchanged flat token both
    // read false, so organization-bound surfaces can gate
    // their reads on a real scoped session instead of firing
    // them on a seed and surfacing a 401.
    sessionIsOrganizationScoped(): boolean;
    // True when the held token's identity can reach at least
    // one organization. A freshly minted (flat) login token
    // carries the reachable set before organization-scoping;
    // an identity with zero memberships reads false, so login
    // and boot can land it on invitations instead of an
    // organization-scoped dead end.
    sessionHasReachableOrganization(): boolean;
    // True when the held token belongs to a logged-in
    // identity rather than the anonymous seed.
    sessionIsAuthenticated(): boolean;
}

export function createSessionTokenHolder(): SessionTokenHolder {
    let sessionToken: string | undefined;

    function putSessionToken(token: string): void {
        sessionToken = token;
    }

    function deleteSessionToken(): void {
        sessionToken = undefined;
    }

    function sessionTokenIsSeeded(): boolean {
        return sessionToken !== undefined;
    }

    function getSessionToken(): string {
        if (sessionToken === undefined) {
            throw new Error(
                'session token uninitialized;'
                + ' await postSessionSeed() first',
            );
        }
        return sessionToken;
    }

    function sessionIsOrganizationScoped(): boolean {
        if (!sessionTokenIsSeeded()) {
            return false;
        }
        return principalFromToken(getSessionToken())
            .organization !== undefined;
    }

    function sessionHasReachableOrganization(): boolean {
        if (!sessionTokenIsSeeded()) {
            return false;
        }
        const organizations =
            principalFromToken(getSessionToken())
                .organizations;
        return organizations !== undefined
            && organizations.length > 0;
    }

    function sessionIsAuthenticated(): boolean {
        if (!sessionTokenIsSeeded()) {
            return false;
        }
        return principalFromToken(getSessionToken()).id
            !== ANONYMOUS_ID;
    }

    return {
        putSessionToken,
        deleteSessionToken,
        sessionTokenIsSeeded,
        getSessionToken,
        sessionIsOrganizationScoped,
        sessionHasReachableOrganization,
        sessionIsAuthenticated,
    };
}
