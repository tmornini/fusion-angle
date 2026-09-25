// Apex `/` destination. The refresh cookie is
// Path=/api/authentication, so GET `/` cannot
// see it. The existing refresh grant is the
// probe — not a new door.

import { createRequestContext } from
    '../../client/shared.ts';
import { authParam } from
    '../../client/authentication.ts';
import { getClientFacade } from
    '../../client/facade-holder.ts';
import { runSingleFlightRefresh } from
    '../../client/session-refresh-mutex.ts';

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
    const ctx = createRequestContext(
        getClientFacade(), '',
    );
    const access = await runSingleFlightRefresh(
        async () => {
            const answered = await ctx.postForHeaders(
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
