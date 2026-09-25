import type { RequestContext } from './request-context.ts';
import type { SessionCredentials } from
    './session-credentials.ts';
import {
    authParam,
    refreshFromHeaders,
    refusedDoor,
} from './authentication.ts';

// Trade a live refresh token for a rotated credential pair
// via the OAuth refresh grant. Both session modes send the
// token on the cookie line and never in the body. A terminal
// 401 surfaces as UnauthorizedError; non-401 faults
// propagate as-is.
export async function postSessionRefresh(
    ctx: RequestContext,
    refreshToken: string,
    organization?: string,
): Promise<SessionCredentials> {
    const body: Record<string, unknown> = {
        grant_type: 'refresh',
    };
    if (organization !== undefined) {
        body.organization = organization;
    }
    const answered = await ctx.postForHeaders(
        'authentication/token',
        body,
        [[
            'cookie',
            'refresh_token=' + refreshToken,
        ]],
    );
    const refused = refusedDoor(answered);
    if (refused !== null) throw refused;
    const accessToken = authParam(
        answered.headers.get('authentication-info'),
        'access_token',
    );
    if (accessToken === null) {
        throw new Error(
            'authentication-info lacks access_token',
        );
    }
    return {
        accessToken,
        refreshToken: refreshFromHeaders(answered.headers),
    };
}
