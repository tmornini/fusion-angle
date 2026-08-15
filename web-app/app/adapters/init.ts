import {
    indexedDbAdapter,
} from '../../../api/db-indexeddb.ts';
import {
    postNotificationEvent,
} from './broadcast-channel.ts';
import type {
    ClientFacadeAdapter,
} from '../../../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    ANONYMOUS_ID,
} from '../../../api/access-token.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    nowEpochSeconds,
} from '../../../api/types.ts';
import { wrapInPageAdapter } from './in-page-facade.ts';
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

// The persistence tier: a real IndexedDB transaction per op,
// O(1) appends, and cross-tab refresh via the posted
// notification events. The connection opens in initialize().
// Production boot passes this; boot-path tests substitute an
// in-memory tier — IndexedDB has no Node stub, and we add no
// fake.
export function defaultAdapter(): ClientFacadeAdapter {
    return indexedDbAdapter(postNotificationEvent);
}

export async function initAdapter(
    makeAdapter: () => ClientFacadeAdapter,
): Promise<boolean> {
    await postSessionSeed();
    adapter = makeAdapter();
    await adapter.initialize();
    putClientFacade(wrapInPageAdapter(adapter));
    // The composition root probes the datastore directly —
    // the same infrastructure tier as initialize() above.
    // Exporting the whole database through the snapshot plane
    // just to compare it against null was never the question
    // being asked.
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
        jti: generateCryptoSafeBase62(),
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
