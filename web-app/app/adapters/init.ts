import type {
    ClientFacadeAdapter,
} from '../../../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    ANONYMOUS_ID,
} from '../../../api/access-token.ts';
import {
    generateIdentifier,
} from '../../../shared/identifier.ts';
import {
    nowEpochSeconds,
} from '../../../api/types.ts';
import { wrapClientAdapter } from './facade-holder.ts';
import { putClientFacade } from './facade-holder.ts';
import {
    putSessionToken,
    sessionTokenIsSeeded,
} from './session-token.ts';

export {
    getSessionToken,
    putSessionToken,
    deleteSessionToken,
    sessionTokenIsSeeded,
    sessionIsOrganizationScoped,
    sessionHasReachableOrganization,
    sessionIsAuthenticated,
} from './session-token.ts';

let adapter: ClientFacadeAdapter | undefined;

// Test composition root: an injected adapter (memory)
// wrapped as HttpFacade. Product boot uses server-core
// and the fetch facade.
export async function initAdapter(
    makeAdapter: () => ClientFacadeAdapter,
): Promise<boolean> {
    await postSessionSeed();
    adapter = makeAdapter();
    await adapter.initialize();
    putClientFacade(wrapClientAdapter(adapter));
    return adapter.hasSchema();
}

export function getDbAdapter(): ClientFacadeAdapter {
    if (!adapter) {
        throw new Error(
            'initAdapter() not called.',
        );
    }
    return adapter;
}

const SESSION_TTL_SECONDS = 15 * 60;

async function mintSessionToken(
    sub: string,
    name: string,
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: [],
        name,
        iat: nowEpochSeconds(),
        ttlSeconds: SESSION_TTL_SECONDS,
        jti: generateIdentifier(),
    });
}

// Pre-seed the per-tab holder with the anonymous default.
// Minting is async (real HMAC signing), so a sync getter
// cannot mint lazily; the boot path awaits this before any
// getSessionToken() call. Idempotent: a holder already set
// (anonymous or an established subject) is left untouched.
export async function postSessionSeed(): Promise<void> {
    if (!sessionTokenIsSeeded()) {
        putSessionToken(await mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        ));
    }
}
