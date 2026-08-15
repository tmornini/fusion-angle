import type { RequestContext } from './shared.ts';
import type { SessionCredentials } from './session-credentials.ts';
import { isCookieSession } from './session-credentials.ts';

interface TokenGrantResponse {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
}

// Trade a live refresh token for a rotated credential pair via
// the OAuth refresh grant. Cookie-session omits the body token
// and reads the HttpOnly cookie. Browser ZIP still sends the
// stored refresh (body fallback). A terminal 401 surfaces as
// UnauthorizedError; non-401 faults propagate as-is.
export async function postSessionRefresh(
    ctx: RequestContext,
    refreshToken: string,
): Promise<SessionCredentials> {
    const body: Record<string, unknown> = {
        grant_type: 'refresh',
    };
    if (!isCookieSession()) {
        body.refresh_token = refreshToken;
    }
    const grant = await ctx.POST<TokenGrantResponse>(
        'authentication/token', body);
    return {
        accessToken: grant.access_token,
        refreshToken: grant.refresh_token ?? '',
    };
}
