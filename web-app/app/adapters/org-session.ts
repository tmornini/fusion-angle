import { DEFAULT_ORG } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

// The persisted active-org key — the CLIENT-side org vessel.
// We persist the org id, NEVER the token (a 15-min TTL would
// rot it); boot re-exchanges a fresh scoped token from this id.
export const ACTIVE_ORG_KEY = 'fusion.active-org';

// Exchange the held bearer for a token scoped to `org` via the
// real OAuth token-exchange (RFC 8693 self-delegation: subject
// == actor == the caller). The server fences on membership — a
// non-member exchange is a 403 that mints nothing, surfaced
// here as a thrown error. Returns the org-scoped access token;
// the caller installs it as the per-tab session, kept free of
// that global side effect so it stays testable (mirrors
// loginViaPassword).
export async function postOrgSessionExchange(
    ctx: RequestContext,
    subjectToken: string,
    org: string,
): Promise<string> {
    const res = await ctx.POST<{ access_token: string }>(
        'authentication/token', {
            grant_type: 'token-exchange',
            subject_token: subjectToken,
            actor_token: subjectToken,
            organization: org,
        });
    return res.access_token;
}

// The switcher is an honest affordance only when there is a
// real choice — two or more reachable orgs.
export function shouldShowOrgSwitcher(
    orgs: readonly { id: string }[],
): boolean {
    return orgs.length >= 2;
}

// Boot ALWAYS resolves an active org from the reachable set:
// the persisted choice if still reachable, else DEFAULT_ORG if
// reachable (an EXPLICIT named bridge, not a silent default),
// else the first reachable. A single-org member always lands
// in their org.
export function resolveActiveOrg(
    reachable: readonly string[],
    persisted: string | null,
): string {
    if (persisted !== null
        && reachable.includes(persisted)) {
        return persisted;
    }
    if (reachable.includes(DEFAULT_ORG)) {
        return DEFAULT_ORG;
    }
    return reachable[0]!;
}
