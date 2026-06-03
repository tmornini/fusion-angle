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
} from './crypto-safe-base62.ts';

let adapter: DbAdapter | undefined;

export async function initAdapter(
): Promise<boolean> {
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

function mintSessionToken(
    sub: string,
    name: string,
): string {
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

export function getSessionToken(): string {
    if (sessionToken === undefined) {
        sessionToken = mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        );
    }
    return sessionToken;
}

// Mint and install a real (signature-deferred) session token
// for an authenticated subject. Login and app-boot call this.
export function establishSession(
    sub: string,
    name: string,
): void {
    setSessionToken(mintSessionToken(sub, name));
}
