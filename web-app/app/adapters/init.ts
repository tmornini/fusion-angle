import {
    LocalStorageDbAdapter,
} from '../../../api/db-localstorage.ts';
import type { DbAdapter } from '../../../api/db.ts';
import { GET } from '../../../api/api.ts';
import {
    mintAccessToken,
    ANONYMOUS_ID,
} from '../../../api/access-token.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';

let adapter: DbAdapter | undefined;

export async function initAdapter(
): Promise<boolean> {
    await ensureSessionToken();
    adapter = new LocalStorageDbAdapter();
    await adapter.initialize();
    const schema =
        await GET<string | null>(
            adapter, 'snapshots/schema',
            getSessionToken(),
        );
    return schema !== null;
}

export function getDbAdapter(): DbAdapter {
    if (!adapter) {
        throw new Error(
            'initAdapter() not called.',
        );
    }
    return adapter;
}

const SESSION_TTL_SECONDS = 15 * 60;

let sessionToken: string | undefined;

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

async function mintSessionToken(
    sub: string,
    name: string,
): Promise<string> {
    return mintAccessToken({
        sub,
        roles: [],
        name,
        iat: nowSeconds(),
        ttlSeconds: SESSION_TTL_SECONDS,
        jti: generateCryptoSafeBase62(),
    });
}

export function setSessionToken(token: string): void {
    sessionToken = token;
}

export function clearSessionToken(): void {
    sessionToken = undefined;
}

// Pre-seed the per-tab holder with the anonymous default.
// Minting is async (real HMAC signing), so a sync getter
// cannot mint lazily; the boot path awaits this before any
// getSessionToken() call. Idempotent: a holder already set
// (anonymous or an established subject) is left untouched.
export async function ensureSessionToken(): Promise<void> {
    if (sessionToken === undefined) {
        sessionToken = await mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        );
    }
}

// Returns the already-minted per-tab token. ensureSessionToken
// (boot) or establishSession (login) must have seeded it; an
// unseeded holder is a boot-order bug, not a state to mask —
// crash with a clear message rather than return a wrong token.
export function getSessionToken(): string {
    if (sessionToken === undefined) {
        throw new Error(
            'session token uninitialized;'
            + ' await ensureSessionToken() first',
        );
    }
    return sessionToken;
}

// Mint and install a session token DIRECTLY for `sub` — the
// mock-auth convenience for app-boot and demo sign-up. The REAL
// password flow (verify a credential through the OAuth front
// doors) is loginViaPassword in adapters/authentication.ts; boot
// keeps this direct mint because the seed admin password is
// random and surfaced once, so none is available at boot time.
export async function establishSession(
    sub: string,
    name: string,
): Promise<void> {
    setSessionToken(await mintSessionToken(sub, name));
}
