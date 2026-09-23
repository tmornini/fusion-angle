// Apex `/` destination. The refresh cookie is
// Path=/api/authentication, so GET `/` cannot
// see it. The existing refresh grant is the
// probe — not a new door.

import {
    RequestError,
    UnauthorizedError,
} from '../../api/http-errors.ts';
import { createRequestContext } from
    './adapters/shared.ts';
import { getClientFacade } from
    './adapters/facade-holder.ts';
import { runSingleFlightRefresh } from
    './adapters/session-refresh-mutex.ts';

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
            try {
                const body = await ctx.POST<{
                    access_token?: unknown;
                }>(
                    'authentication/token',
                    { grant_type: 'refresh' },
                );
                return typeof body.access_token
                    === 'string'
                    ? body.access_token
                    : null;
            } catch (err) {
                if (
                    err instanceof UnauthorizedError
                    || err instanceof RequestError
                ) {
                    return null;
                }
                throw err;
            }
        },
    );
    return access !== null;
}
