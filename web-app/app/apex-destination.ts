// Apex `/` destination. The refresh cookie is
// Path=/api/authentication, so GET `/` cannot
// see it. The existing refresh grant is the
// probe — not a new door.

import { authParam } from
    '../../client/authentication.ts';
import { getClient } from './client.ts';

export const APEX_SIGNED_IN = 'dashboard/index.html';
export const APEX_SIGNED_OUT = 'landing/index.html';

export async function resolveApexLocation(
    sessionLive: () => Promise<boolean>,
): Promise<string> {
    try {
        if (await sessionLive()) {
            return APEX_SIGNED_IN;
        }
    } catch {
        // a probe fault is unsigned
    }
    return APEX_SIGNED_OUT;
}

export async function probeRefreshSession(
): Promise<boolean> {
    const client = getClient();
    const ctx = client.requestContext('');
    const access = await client.runSingleFlightRefresh(
        async () => {
            const answered = await ctx.POSTUnauthenticated(
                'authentication/token',
                { grant_type: 'refresh' },
            );
            if (answered.status !== 200) return null;
            return authParam(
                answered.headers.get(
                    'authentication-info',
                ),
                'access_token',
            );
        },
    );
    return access !== null;
}
