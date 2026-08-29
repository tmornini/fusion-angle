import './hmac-test-key.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import './in-page-facade.ts';

// Default membership type for fixture tokens: `current` is
// the root admin; every other subject is a plain member.
// Claim roles are `{type}:{organization_id}` baked the same
// way mint does from membership type.
function fixtureRoles(
    sub: string,
    organization: string,
): string[] {
    const type = sub === 'XXZruirZyAOoRpNxaDnpSA' ? 'admin' : 'member';
    return [type + ':' + organization];
}

// A deterministic, always-valid 'XXZruirZyAOoRpNxaDnpSA' token: a fixed iat
// with an enormous TTL puts exp far in the future, so it
// verifies against any wall clock without a clock seam.
// Carries claim roles + organizations (gate reads claims,
// not live role-grants / memberships). Async because minting
// now signs via WebCrypto (HMAC-SHA256).
export async function devToken(
    sub = 'XXZruirZyAOoRpNxaDnpSA',
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: fixtureRoles(sub, 'AjdvjuECVZEgZoFajaIEkg'),
        name: 'Demo',
        organizations: ['AjdvjuECVZEgZoFajaIEkg'],
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'dev-' + sub,
    });
}

// An org-scoped dev token: the org-exchanged session a web-app
// adapter sees post-boot, carrying the `org` claim activeOrganization
// reads. Defaults to `current` in org 'AjdvjuECVZEgZoFajaIEkg'.
export async function organizationToken(
    sub = 'XXZruirZyAOoRpNxaDnpSA', organization = 'AjdvjuECVZEgZoFajaIEkg',
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: fixtureRoles(sub, organization),
        name: 'Demo',
        organization,
        organizations: [organization],
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'org-' + sub + '-' + organization,
    });
}

// A flat (un-exchanged) login token carrying the reachable
// `orgs` set but no scoped `org` claim — the shape a freshly
// minted password-grant token has before boot exchanges it for
// an org-scoped session. Defaults to one reachable org; pass []
// for the zero-membership identity.
export async function reachableToken(
    sub = 'XXZruirZyAOoRpNxaDnpSA'
        , organizations: readonly string[] = ['AjdvjuECVZEgZoFajaIEkg'],
): Promise<string> {
    const roles = organizations.flatMap(
        org => fixtureRoles(sub, org),
    );
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles,
        name: 'Demo',
        organizations,
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'reach-' + sub,
    });
}

// Explicit claim control for multi-org / per-type fixtures.
// Prefer devToken / organizationToken / reachableToken when
// the default admin(current)/member(other) map is enough.
export async function claimToken(opts: {
    sub?: string;
    organization?: string;
    organizations: readonly string[];
    roles: readonly string[];
    jti?: string;
}): Promise<string> {
    const sub = opts.sub ?? 'XXZruirZyAOoRpNxaDnpSA';
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: [...opts.roles],
        name: 'Demo',
        ...(opts.organization !== undefined
            ? { organization: opts.organization } : {}),
        organizations: [...opts.organizations],
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: opts.jti ?? ('claim-' + sub),
    });
}

export async function expiredToken(
    sub = 'XXZruirZyAOoRpNxaDnpSA',
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: fixtureRoles(sub, 'AjdvjuECVZEgZoFajaIEkg'),
        name: 'Demo',
        organizations: ['AjdvjuECVZEgZoFajaIEkg'],
        iat: 1_600_000_000, ttlSeconds: 1,
        jti: 'exp-' + sub,
    });
}

export async function notYetValidToken(
    sub = 'XXZruirZyAOoRpNxaDnpSA',
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: fixtureRoles(sub, 'AjdvjuECVZEgZoFajaIEkg'),
        name: 'Demo',
        organizations: ['AjdvjuECVZEgZoFajaIEkg'],
        iat: 4_000_000_000, ttlSeconds: 10_000_000_000,
        jti: 'nbf-' + sub,
    });
}

// Pre-minted 'XXZruirZyAOoRpNxaDnpSA' org-scoped token for the common case.
// Minting is async now, but organizationToken() is
// deterministic, so one value equals every call. Tests that
// need the token as a plain string — e.g. inside a
// synchronous assert.throws thunk — import this instead of
// awaiting at each call site. Minted once here via top-level
// await; the async module graph waits. Product adapters
// read the org claim via activeOrganization.
export const DEV_TOKEN = await organizationToken();
