import type { RequestContext } from './shared.ts';
import type { SessionCredentials } from './session-credentials.ts';

interface TokenGrantResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
}

// Trade a live refresh token for a rotated credential pair via
// the OAuth refresh grant. The token route is BEARER_EXEMPT, so
// the anonymous boot bearer reaches it. A terminal 401 (reuse,
// unknown, or expired refresh) surfaces as UnauthorizedError —
// one typed error everywhere; non-401 faults propagate as-is.
// Free of global side effects (mirrors postOrgSessionExchange):
// the caller persists and installs the result.
export async function postSessionRefresh(
    ctx: RequestContext,
    refreshToken: string,
): Promise<SessionCredentials> {
    const grant = await ctx.POST<TokenGrantResponse>(
        'authentication/token', {
            grant_type: 'refresh',
            refresh_token: refreshToken,
        });
    return {
        accessToken: grant.access_token,
        refreshToken: grant.refresh_token,
    };
}
