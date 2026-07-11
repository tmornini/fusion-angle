import type { RequestContext } from './shared.ts';
import { STORAGE_KEY_ACTIVE_ORGANIZATION_ID } from
    '../storage-keys.ts';

// localStorage slot for the active organization id — the
// CLIENT-side org vessel. We persist the org id, NEVER the
// token (a 15-min TTL would rot it); boot re-exchanges a
// fresh scoped token from this id. Alias of
// STORAGE_KEY_ACTIVE_ORGANIZATION_ID for call sites that
// speak the domain name.
export const ACTIVE_ORGANIZATION_ID =
    STORAGE_KEY_ACTIVE_ORGANIZATION_ID;

// Exchange the held bearer for a token scoped to `org` via the
// real OAuth token-exchange (RFC 8693 self-delegation: subject
// == actor == the caller). The server fences on membership — a
// non-member exchange is a 403 that mints nothing, surfaced
// here as a thrown error. Returns the org-scoped access token;
// the caller installs it as the per-tab session, kept free of
// that global side effect so it stays testable (mirrors
// postPasswordLogin).
export async function postOrganizationSessionExchange(
    ctx: RequestContext,
    subjectToken: string,
    organization: string,
): Promise<string> {
    const res = await ctx.POST<{ access_token: string }>(
        'authentication/token', {
            grant_type: 'token-exchange',
            subject_token: subjectToken,
            actor_token: subjectToken,
            organization: organization,
        });
    return res.access_token;
}

// The switcher is an honest affordance only when there is a
// real choice — two or more reachable orgs.
export function shouldShowOrganizationSwitcher(
    organizations: readonly { id: string }[],
): boolean {
    return organizations.length >= 2;
}

// Boot ALWAYS resolves an active org from the reachable set:
// the persisted per-tab choice if still reachable, else the
// identity's default (its set choice, else primary membership —
// resolved server-side), else the first reachable. A single-org
// member always lands in their org.
export function resolveActiveOrganization(
    reachable: readonly string[],
    persisted: string | null,
    identityDefault: string | null,
): string {
    if (persisted !== null
        && reachable.includes(persisted)) {
        return persisted;
    }
    if (identityDefault !== null
        && reachable.includes(identityDefault)) {
        return identityDefault;
    }
    return reachable[0]!;
}
