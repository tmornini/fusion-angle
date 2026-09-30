import type {
    ClientFacadeAdapter,
} from '../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    ANONYMOUS_ID,
} from '../api/access-token.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    nowEpochSeconds,
} from '../shared/types.ts';
import {
    createAppClient,
    getClient,
    putClient,
} from '../web-app/app/client.ts';
import { wrapInPageAdapter } from
    './in-page-facade.ts';

let adapter: ClientFacadeAdapter | undefined;

// Test composition root: an injected adapter (memory)
// behind the in-page transport, as the app's one client.
// Product boot uses server-core and the fetch transport.
export async function initAdapter(
    makeAdapter: () => ClientFacadeAdapter,
): Promise<boolean> {
    adapter = makeAdapter();
    await adapter.initialize();
    putClient(createAppClient(wrapInPageAdapter(adapter)));
    await postSessionSeed();
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
    if (!getClient().sessionTokenIsSeeded()) {
        getClient().putSessionToken(await mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        ));
    }
}
